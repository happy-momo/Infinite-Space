// 主应用组件：无限画布的核心状态机。
// 负责节点/连线/页面/历史栈的增删改查，平移缩放视口、框选、快捷键、
// 以及对接后端 API（AI 整理、AI 故事、数据持久化）。
// Main app component — the core state machine of the infinite canvas.
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { motion, useMotionValue } from 'motion/react';
import { CanvasNode } from './components/CanvasNode';
import { Toolbar } from './components/Toolbar';
import { Minimap } from './components/Minimap';
import { ViewportControls } from './components/ViewportControls';
import { StoryControls } from './components/StoryControls';
import { EdgeLayer } from './components/EdgeLayer';
import { NodeData, NodeType, EdgeData, Page, ChatMessage } from './types';
import { initialNodes } from './data';
import { PagesTree } from './components/PagesTree';
import { SettingsModal } from './components/SettingsModal';
import { SearchPanel } from './components/SearchPanel';
import { TemplateModal } from './components/TemplateModal';
import { AiChatPanel } from './components/AiChatPanel';
import { EdgeActionCard, EdgeProposal } from './components/EdgeActionCard';
import { TagPanel } from './components/TagPanel';
import { TagRibbon } from './components/TagRibbon';
import { SuggestPanel, Suggestion } from './components/SuggestPanel';
import { Template } from './templates';
import { useHistory } from './hooks/useHistory';
import { Plus, Layout, ChevronUp, ChevronDown, Sun, Moon } from 'lucide-react';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Plain-text storyline → light HTML so the text node renders nicely in prose.
const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('');

// 新建节点的浅色系背景色池（含半透明白玻璃 + 与品牌一致的柔和色相，见 node.color）。
// Light pastel background pool for newly created nodes — white glass plus soft
// indigo/violet/emerald/sky/pink/amber tints that match the app's glassmorphism.
const NODE_COLOR_POOL = [
  'rgba(255, 255, 255, 0.9)',
  'rgba(238, 242, 255, 0.9)', // indigo-50
  'rgba(245, 243, 255, 0.9)', // violet-50
  'rgba(240, 253, 244, 0.9)', // green-50
  'rgba(236, 253, 245, 0.9)', // emerald-50
  'rgba(236, 249, 255, 0.9)', // sky-50
  'rgba(224, 242, 254, 0.9)', // sky-100
  'rgba(254, 242, 252, 0.9)', // pink-50
  'rgba(255, 237, 213, 0.9)', // orange-100
  'rgba(250, 245, 255, 0.9)', // purple-50
];
const randomNodeColor = () => NODE_COLOR_POOL[Math.floor(Math.random() * NODE_COLOR_POOL.length)];

export default function App() {
  const [pages, setPages] = useState<Page[]>(() => {
    const saved = localStorage.getItem('canvas_pages');
    if (saved) return JSON.parse(saved);
    return [{ id: 'default', name: 'Main Canvas' }];
  });
  
  const [currentPageId, setCurrentPageId] = useState(() => {
    return localStorage.getItem('canvas_current_page') || 'default';
  });
  
  const [isPagesOpen, setIsPagesOpen] = useState(true);

  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);

  // 按画布分桶的 AI 对话（每画布独立、localStorage 持久化）
  const [chatByPage, setChatByPage] = useState<Record<string, ChatMessage[]>>({});

  const [maxZ, setMaxZ] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  const [isLinking, setIsLinking] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);

  // 性能：用 ref 同步高频/易变的状态，使传给 memo 节点的回调能保持「稳定身份」，
  // 避免任意交互都触发所有节点/连线重渲染。仅读最新值，不改行为。
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const maxZRef = useRef(maxZ);
  maxZRef.current = maxZ;
  const isLinkingRef = useRef(isLinking);
  isLinkingRef.current = isLinking;
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  // 边的关系说明（AI 提案）
  const [edgeProposals, setEdgeProposals] = useState<EdgeProposal[] | null>(null);
  const [isLabeling, setIsLabeling] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [storyNodeId, setStoryNodeId] = useState<string | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);
  // 连线增强：从节点边缘拖拽出的预览线 + 松开后选择新节点类型
  const [dragEdge, setDragEdge] = useState<{ sourceId: string; curX: number; curY: number } | null>(null);
  const [dragNewMenu, setDragNewMenu] = useState<{ x: number; y: number; sourceId: string } | null>(null);
  // 全局搜索
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // 模板库
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  /** 模板新建画布时的父文件夹（文件夹内新建用） */
  const [pendingParentId, setPendingParentId] = useState<string | null>(null);
  // AI 对话侧边栏
  const [isChatOpen, setIsChatOpen] = useState(false);
  // 文件夹展开状态（UI 态，可持久化）
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // AI 联想面板：按节点缓存结果，关闭侧栏或切换看板时整体清空
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  // 当前正在"联想"的源节点 id（不再直接跟随选区，点击空白/操作不会丢失上下文）
  const [suggestForNodeId, setSuggestForNodeId] = useState<string | null>(null);
  // 各节点的联想结果缓存（内存态，每个节点一份独立"对话记录"）
  const [suggestByNode, setSuggestByNode] = useState<Record<string, { suggestions: Suggestion[]; error: string | null }>>({});
  const [suggestLoading, setSuggestLoading] = useState(false);
  // 「重新分析」时自增，驱动 fetch effect 重新跑（否则清缓存不会触发重组）
  const [suggestEpoch, setSuggestEpoch] = useState(0);
  // 缓存镜像 ref：让 fetch effect 的守卫读到最新缓存，避免闭包捕获陈旧快照
  const suggestCacheRef = useRef(suggestByNode);
  suggestCacheRef.current = suggestByNode;
  // 正在生成图表的表格节点 id
  const [generatingChartId, setGeneratingChartId] = useState<string | null>(null);
  // 标签筛选系统
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [isTagPanelOpen, setIsTagPanelOpen] = useState(false);
  // 虚拟渲染：视口变化时触发可见节点重算
  const [viewportTick, setViewportTick] = useState(0);
  const [viewportSize, setViewportSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('canvas_theme') === 'dark' ? 'dark' : 'light');

  // 把主题同步到 <html>，供非 React 上下文（如图表 SVG、SW）检测暗色模式
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const containerRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);

  // Load viewport on mount for current page
  useEffect(() => {
    const savedViewport = localStorage.getItem(`canvas_viewport_${currentPageId}`);
    if (savedViewport) {
      try {
        const { vx, vy, vs } = JSON.parse(savedViewport);
        x.set(vx); y.set(vy); scale.set(vs);
      } catch (e) {}
    } else {
      x.set(0); y.set(0); scale.set(1);
    }
    
    const saveViewport = () => {
      localStorage.setItem(`canvas_viewport_${currentPageId}`, JSON.stringify({ vx: x.get(), vy: y.get(), vs: scale.get() }));
    };
    
    window.addEventListener('beforeunload', saveViewport);
    return () => {
      saveViewport();
      window.removeEventListener('beforeunload', saveViewport);
    };
  }, [currentPageId, x, y, scale]);

  // Handle Page switching and Migration
  useEffect(() => {
    if (currentPageId === 'default' && !localStorage.getItem('canvas_nodes_default')) {
      const oldNodes = localStorage.getItem('canvas_nodes');
      const oldEdges = localStorage.getItem('canvas_edges');
      if (oldNodes || oldEdges) {
        setNodes(oldNodes ? JSON.parse(oldNodes) : []);
        setEdges(oldEdges ? JSON.parse(oldEdges) : []);
        localStorage.setItem('canvas_nodes_default', oldNodes || '[]');
        localStorage.setItem('canvas_edges_default', oldEdges || '[]');
        return;
      }
    }
    
    const savedNodes = localStorage.getItem(`canvas_nodes_${currentPageId}`);
    const savedEdges = localStorage.getItem(`canvas_edges_${currentPageId}`);
    setNodes(savedNodes ? JSON.parse(savedNodes) : (currentPageId === 'default' ? initialNodes : []));
    setEdges(savedEdges ? JSON.parse(savedEdges) : []);
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
  }, [currentPageId]);

  // Save current page state
  useEffect(() => {
    localStorage.setItem(`canvas_nodes_${currentPageId}`, JSON.stringify(nodes));
    localStorage.setItem(`canvas_edges_${currentPageId}`, JSON.stringify(edges));
  }, [nodes, edges, currentPageId]);

  // Save pages list
  useEffect(() => {
    localStorage.setItem('canvas_pages', JSON.stringify(pages));
    localStorage.setItem('canvas_current_page', currentPageId);
  }, [pages, currentPageId]);

  // ---- Per-canvas AI chat persistence ----
  // 懒加载当前画布对话（首次访问某画布时从 localStorage 读入）
  useEffect(() => {
    if (chatByPage[currentPageId] !== undefined) return;
    let saved: ChatMessage[] = [];
    try {
      const raw = localStorage.getItem(`chat_${currentPageId}`);
      if (raw) saved = JSON.parse(raw);
    } catch { /* ignore */ }
    setChatByPage((prev) => (prev[currentPageId] !== undefined ? prev : { ...prev, [currentPageId]: saved }));
  }, [currentPageId, chatByPage]);

  // 自动保存当前画布对话
  useEffect(() => {
    const chat = chatByPage[currentPageId];
    if (chat === undefined) return;
    if (chat.length === 0) localStorage.removeItem(`chat_${currentPageId}`);
    else localStorage.setItem(`chat_${currentPageId}`, JSON.stringify(chat));
  }, [chatByPage, currentPageId]);

  const handleChatChange = (next: ChatMessage[]) => {
    setChatByPage((prev) => ({ ...prev, [currentPageId]: next }));
  };
  const handleClearChat = () => {
    setChatByPage((prev) => ({ ...prev, [currentPageId]: [] }));
    localStorage.removeItem(`chat_${currentPageId}`);
  };

  // ---- Server-side persistence (data/state.json) ----
  const stateRef = useRef({ pages, currentPageId, nodes, edges, x, y, scale });
  stateRef.current = { pages, currentPageId, nodes, edges, x, y, scale };

  // Undo/redo history.
  const history = useHistory();
  const beginTransaction = history.snapshot;

  // Keep the history hook's current snapshot in sync with committed state.
  useEffect(() => {
    history.setCurrent({ nodes, edges });
  });

  const buildBundle = useCallback(() => {
    const s = stateRef.current;
    const readPage = (key: string, pid: string): unknown => {
      try {
        return JSON.parse(localStorage.getItem(`${key}_${pid}`) || 'null');
      } catch {
        return null;
      }
    };
    return {
      pages: s.pages,
      currentPageId: s.currentPageId,
      nodes: Object.fromEntries(
        s.pages.map(p => [p.id, p.id === s.currentPageId ? s.nodes : (readPage('canvas_nodes', p.id) || [])]),
      ),
      edges: Object.fromEntries(
        s.pages.map(p => [p.id, p.id === s.currentPageId ? s.edges : (readPage('canvas_edges', p.id) || [])]),
      ),
      viewports: Object.fromEntries(
        s.pages.map(p => [
          p.id,
          p.id === s.currentPageId
            ? { vx: s.x.get(), vy: s.y.get(), vs: s.scale.get() }
            : (readPage('canvas_viewport', p.id) || { vx: 0, vy: 0, vs: 1 }),
        ]),
      ),
    };
  }, []);

  const postBundle = useCallback(async () => {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBundle()),
      });
    } catch (e) {
      console.error('Failed to save state to server:', e);
    }
  }, [buildBundle]);

  // ---- Export / Import (JSON) ----
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const bundle = buildBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyImport = (bundle: any) => {
    if (!bundle || !Array.isArray(bundle.pages) || bundle.pages.length === 0) {
      alert('导入失败：无效的看板文件');
      return;
    }
    const pid = bundle.pages.some((p: Page) => p.id === bundle.currentPageId)
      ? bundle.currentPageId
      : bundle.pages[0].id;
    localStorage.setItem('canvas_pages', JSON.stringify(bundle.pages));
    localStorage.setItem('canvas_current_page', pid);
    Object.entries(bundle.nodes || {}).forEach(([k, v]) =>
      localStorage.setItem(`canvas_nodes_${k}`, JSON.stringify(v)));
    Object.entries(bundle.edges || {}).forEach(([k, v]) =>
      localStorage.setItem(`canvas_edges_${k}`, JSON.stringify(v)));
    Object.entries(bundle.viewports || {}).forEach(([k, v]) =>
      localStorage.setItem(`canvas_viewport_${k}`, JSON.stringify(v)));
    setPages(bundle.pages);
    setCurrentPageId(pid);
    setNodes(bundle.nodes?.[pid] || []);
    setEdges(bundle.edges?.[pid] || []);
    const vp = bundle.viewports?.[pid];
    if (vp) {
      x.set(vp.vx);
      y.set(vp.vy);
      scale.set(vp.vs);
    } else {
      x.set(0);
      y.set(0);
      scale.set(1);
    }
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
    scheduleServerSave();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyImport(JSON.parse(reader.result as string));
      } catch {
        alert('导入失败：无法解析文件');
      }
    };
    reader.readAsText(file);
  };

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleServerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { postBundle(); }, 700);
  }, [postBundle]);

  // Hydrate from server on mount; migrate localStorage state up if server is empty.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        if (data && Array.isArray(data.pages) && data.pages.length > 0) {
          const pid = data.pages.some((p: Page) => p.id === data.currentPageId)
            ? data.currentPageId
            : data.pages[0].id;
          localStorage.setItem('canvas_pages', JSON.stringify(data.pages));
          localStorage.setItem('canvas_current_page', pid);
          Object.entries(data.nodes || {}).forEach(([k, v]) =>
            localStorage.setItem(`canvas_nodes_${k}`, JSON.stringify(v)));
          Object.entries(data.edges || {}).forEach(([k, v]) =>
            localStorage.setItem(`canvas_edges_${k}`, JSON.stringify(v)));
          Object.entries(data.viewports || {}).forEach(([k, v]) =>
            localStorage.setItem(`canvas_viewport_${k}`, JSON.stringify(v)));
          setPages(data.pages);
          setCurrentPageId(pid);
          setNodes(data.nodes?.[pid] || []);
          setEdges(data.edges?.[pid] || []);
          const vp = data.viewports?.[pid];
          if (vp) { x.set(vp.vx); y.set(vp.vy); scale.set(vp.vs); }
        } else {
          // Server empty → push the current localStorage state up once.
          scheduleServerSave();
        }
      } catch (e) {
        console.error('Failed to load state from server, using local cache:', e);
      }
    })();
  }, []);

  // Debounced server save on state changes.
  useEffect(() => {
    scheduleServerSave();
  }, [pages, currentPageId, nodes, edges, scheduleServerSave]);

  // Debounced server save on viewport (pan/zoom) changes.
  useEffect(() => {
    const unsubs = [x, y, scale].map((mv) => mv.on('change', scheduleServerSave));
    return () => unsubs.forEach((u) => u());
  }, [x, y, scale, scheduleServerSave]);

  const handleDeletePage = (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation();
    const target = pages.find((p) => p.id === pageId);

    // 删除文件夹：级联删除其中所有画布
    if (target?.type === 'folder') {
      const childIds = pages.filter((p) => p.type !== 'folder' && p.parentId === pageId).map((c) => c.id);
      const msg = childIds.length
        ? `删除文件夹「${target.name}」及其中的 ${childIds.length} 个画布？`
        : `删除文件夹「${target.name}」？`;
      if (confirm(msg)) {
        const remaining = pages.filter((p) => p.id !== pageId && p.parentId !== pageId);
        setPages(remaining);
        childIds.forEach((cid) => {
          localStorage.removeItem(`canvas_nodes_${cid}`);
          localStorage.removeItem(`canvas_edges_${cid}`);
          localStorage.removeItem(`canvas_viewport_${cid}`);
        });
        if (currentPageId === pageId || childIds.includes(currentPageId)) {
          const firstCanvas = remaining.find((p) => p.type !== 'folder')?.id || remaining[0]?.id;
          if (firstCanvas) setCurrentPageId(firstCanvas);
        }
      }
      return;
    }

    // 仅剩一个画布时禁止删除
    if (pages.filter((p) => p.type !== 'folder').length <= 1) {
      alert("Cannot delete the last canvas.");
      return;
    }
    if (confirm("Are you sure you want to delete this canvas?")) {
      const nextPages = pages.filter(p => p.id !== pageId);
      setPages(nextPages);
      if (currentPageId === pageId) {
        setCurrentPageId(nextPages.find((p) => p.type !== 'folder')?.id || nextPages[0].id);
      }
      localStorage.removeItem(`canvas_nodes_${pageId}`);
      localStorage.removeItem(`canvas_edges_${pageId}`);
      localStorage.removeItem(`canvas_viewport_${pageId}`);
      setExpandedFolders(prev => { const n = new Set(prev); n.delete(pageId); return n; });
    }
  };

  const handleRenamePage = (id: string, name: string) => {
    setPages(prev => prev.map(p => (p.id === id ? { ...p, name } : p)));
  };

  // 从模板创建画布：新建页面并预填模板节点/连线（支持放入指定文件夹）
  const handleCreateFromTemplate = (template: Template) => {
    const newId = Math.random().toString(36).substring(7);
    const isBlank = template.nodes.length === 0;
    setPages(prev => [
      ...prev,
      { id: newId, name: isBlank ? `Canvas ${prev.length + 1}` : template.name, type: 'canvas', parentId: pendingParentId || undefined },
    ]);
    if (!isBlank) {
      localStorage.setItem(`canvas_nodes_${newId}`, JSON.stringify(template.nodes));
      localStorage.setItem(`canvas_edges_${newId}`, JSON.stringify(template.edges));
    }
    setCurrentPageId(newId);
    setNodes(template.nodes || []);
    setEdges(template.edges || []);
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
    setPendingParentId(null);
    setIsTemplateModalOpen(false);
    scheduleServerSave();
  };

  // 用模板弹窗新建画布（可选择是否放入某个文件夹）
  const openTemplateFor = (parentId?: string) => {
    setPendingParentId(parentId ?? null);
    setIsTemplateModalOpen(true);
  };

  // 新建文件夹
  const handleAddFolder = () => {
    const id = Math.random().toString(36).substring(7);
    setPages(prev => [...prev, { id, name: `文件夹 ${prev.filter((p) => p.type === 'folder').length + 1}`, type: 'folder' }]);
    setExpandedFolders(prev => new Set(prev).add(id));
  };

  // 拖拽把页面移入/移出文件夹
  const handleMovePage = (pageId: string, targetFolderId: string | null) => {
    setPages(prev => prev.map(p => (p.id === pageId ? { ...p, parentId: targetFolderId || undefined } : p)));
  };

  const handleToggleExpand = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  useEffect(() => {
    const unsubS = scale.on("change", (v) => {
      (window as any)._canvasScale = v;
    });
    // Set initial
    (window as any)._canvasScale = scale.get();
    return () => unsubS();
  }, [scale]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // 如果滚轮作用于某个可滚动的嵌套面板（左侧页面树 / 弹窗 / 侧边栏等），
      // 交给浏览器的原生滚动，而不是缩放画布。
      const target = e.target as Element | null;

      // 左侧页面树面板：把滚轮统一导向内部列表（即使在头部/底栏上滚动也翻看内容）
      if (target && target !== el && target.closest('[data-panel="pages"]')) {
        const list = target.closest('[data-panel="pages"]')!.querySelector<HTMLElement>('.pages-list');
        if (list) {
          const max = list.scrollHeight - list.clientHeight;
          if (max > 0) list.scrollTop = Math.min(max, Math.max(0, list.scrollTop + e.deltaY));
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // 其他可滚动的嵌套面板（弹窗 / 侧边栏 / 聊天等）：交给原生滚动，不缩放画布
      if (target && target !== el) {
        let n: Element | null = target;
        while (n && n !== el) {
          const cs = window.getComputedStyle(n);
          const scrollable =
            (cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowY === 'overlay') &&
            n.scrollHeight > n.clientHeight + 1;
          if (scrollable) {
            e.stopPropagation();
            return;
          }
          n = n.parentElement;
        }
      }

      e.preventDefault();

      if (e.shiftKey) {
        // Pan
        x.set(x.get() - e.deltaX);
        y.set(y.get() - e.deltaY);
      } else {
        // Zoom
        const currentScale = scale.get();
        // Slower zoom for smooth trackpads, still fast enough for mice
        const zoomFactor = 1 - e.deltaY * 0.005;
        let newScale = currentScale * zoomFactor;
        newScale = Math.max(0.1, Math.min(newScale, 5));

        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const currentX = x.get();
        const currentY = y.get();

        const scaleRatio = newScale / currentScale;
        const newX = cursorX - (cursorX - currentX) * scaleRatio;
        const newY = cursorY - (cursorY - currentY) * scaleRatio;

        scale.set(newScale);
        x.set(newX);
        y.set(newY);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });

    // 双指缩放（pinch to zoom）
    let pinchActive = false;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let pinchCenter = { x: 0, y: 0 };

    const dist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinchActive = true;
      pinchStartDist = dist(e.touches[0], e.touches[1]);
      pinchStartScale = scale.get();
      const rect = el.getBoundingClientRect();
      pinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchActive || e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist(e.touches[0], e.touches[1]);
      const ratio = d / pinchStartDist;
      let newScale = Math.max(0.1, Math.min(5, pinchStartScale * ratio));
      const curX = x.get();
      const curY = y.get();
      const scaleRatio = newScale / pinchStartScale;
      const newX = pinchCenter.x - (pinchCenter.x - curX) * scaleRatio;
      const newY = pinchCenter.y - (pinchCenter.y - curY) * scaleRatio;
      scale.set(newScale);
      x.set(newX);
      y.set(newY);
    };

    const onTouchEnd = () => { pinchActive = false; };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [x, y, scale]);

  const handleAddNode = (type: NodeType) => {
    beginTransaction();
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;

    const addX = (screenCenterX - x.get()) / scale.get();
    const addY = (screenCenterY - y.get()) / scale.get();

    const defaultContent =
      type === 'image' ? '' : type === 'link' ? 'https://example.com'
      : type === 'markdown' ? '# 新 Markdown 节点\n\n支持 **加粗**、`代码`、列表、表格等语法。双击编辑。'
      : type === 'table' ? ''
      : type === 'chart' ? ''
      : '';

    const newNode: NodeData = {
      id: Math.random().toString(36).substring(7),
      type,
      x: addX - 150,
      y: addY - 100,
      content: defaultContent,
      color: randomNodeColor(),
      width: type === 'image' ? 400 : type === 'markdown' ? 420 : type === 'table' ? 480 : 300,
      height: type === 'image' ? 300 : type === 'markdown' ? 320 : type === 'table' ? 360 : undefined,
      zIndex: maxZ + 1
    };
    setMaxZ(prev => prev + 1);
    setNodes(prev => [...prev, newNode]);
    setIsLinking(false);
    setLinkSource(null);
  };

  // AI 面板生成/插入一个节点
  const handleInsertAiNode = (type: NodeType, content: string) => {
    beginTransaction();
    const addX = (window.innerWidth / 2 - x.get()) / scale.get();
    const addY = (window.innerHeight / 2 - y.get()) / scale.get();
    const newNode: NodeData = {
      id: Math.random().toString(36).substring(7),
      type,
      x: addX + 20,
      y: addY + 120,
      content,
      color: randomNodeColor(),
      width: type === 'markdown' ? 420 : 300,
      height: type === 'markdown' ? 320 : undefined,
      zIndex: maxZ + 1,
    };
    setMaxZ((prev) => prev + 1);
    setNodes((prev) => [...prev, newNode]);
    setSelectedIds(new Set([newNode.id]));
    setSelectedEdgeIds(new Set());
  };

  // 标签筛选：多选 AND 匹配；__clear__ 清除
  const handleToggleTag = (tag: string) => {
    if (tag === '__clear__') {
      setSelectedTags(new Set());
      return;
    }
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    // 筛选变化会隐藏节点，清空选中避免光标悬在不可见节点上造成困惑
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
  };

  const handleRemoveNode = useCallback((id: string) => {
    beginTransaction();
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [beginTransaction]);

  const handleUpdateNode = useCallback((id: string, updates: Partial<NodeData>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  const updateEdge = useCallback((id: string, updates: Partial<EdgeData>) => {
    setEdges(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);

  // 手动设置单条边的关系说明（空字符串 = 清除 label）
  const handleUpdateEdgeLabel = (edgeId: string, label: string) => {
    beginTransaction();
    updateEdge(edgeId, { label: label || undefined });
  };

  // 共享：对给定连线集合跑 AI，构建逐条可编辑的提案
  const runAiLabeling = async (targets: EdgeData[]) => {
    if (targets.length === 0) return;
    setIsLabeling(true);
    setEdgeProposals(null);
    try {
      const res = await fetch('/api/llm/edge-relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: activeNodes, edges: targets }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.relations)) {
        alert(data.error || 'AI 标注失败');
        return;
      }
      const byId = new Map(activeNodes.map((n) => [n.id, n]));
      const maxId = new Set(edges.map((e) => e.id));
      const proposals: EdgeProposal[] = data.relations
        .filter((r: any) => r && r.label && maxId.has(r.edgeId))
        .map((r: any) => {
          const edgeE = edges.find((e) => e.id === r.edgeId);
          const src = edgeE ? byId.get(edgeE.source) : undefined;
          const tgt = edgeE ? byId.get(edgeE.target) : undefined;
          const name = (n?: NodeData) => (n ? (n.type === 'text' ? String(n.content || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 14) : n.type) : '?');
          return { edgeId: r.edgeId, label: String(r.label).slice(0, 40), desc: `${name(src)} → ${name(tgt)}` };
        });
      setEdgeProposals(proposals);
    } catch (e) {
      console.error(e);
      alert('调用 AI 标注失败，请检查服务与 LLM 配置');
    } finally {
      setIsLabeling(false);
    }
  };

  // 工具栏：为全板无说明的连线生成关系（添加到全部）
  const handleAiLabelEdges = () => {
    const targets = activeEdges.filter((e) => !e.label);
    if (targets.length === 0) {
      alert('没有需要标注的连线');
      return;
    }
    runAiLabeling(targets);
  };

  // 卡片：仅为当前选中的这一条边生成关系
  const handleAiLabelEdge = (edgeId: string) => {
    const target = activeEdges.find((e) => e.id === edgeId);
    if (target) runAiLabeling([target]);
  };

  const handleChangeEdgeProposal = (edgeId: string, label: string) => {
    setEdgeProposals((prev) => (prev ? prev.map((p) => (p.edgeId === edgeId ? { ...p, label } : p)) : prev));
  };

  const applyEdgeProposals = () => {
    if (!edgeProposals) return;
    beginTransaction();
    edgeProposals.forEach((p) => updateEdge(p.edgeId, { label: p.label.trim() || undefined }));
    setEdgeProposals(null);
  };

  const cancelEdgeProposals = () => setEdgeProposals(null);

  // 关闭边操作卡片（取消边选中即可隐藏，且不影响 AI 提案）
  const handleDismissEdge = () => setSelectedEdgeIds(new Set());

  const handleBringToFront = useCallback((id: string) => {
    const next = (maxZRef.current += 1);
    setMaxZ(next);
    handleUpdateNode(id, { zIndex: next });
  }, [handleUpdateNode]);

  const handleSelectNode = useCallback((id: string, multi: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(multi ? prev : []);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (!multi) {
      setSelectedEdgeIds(new Set());
    }
  }, []);

  const handleSelectEdge = useCallback((id: string, multi: boolean) => {
    setSelectedEdgeIds(prev => {
      const next = new Set(multi ? prev : []);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (!multi) {
      setSelectedIds(new Set());
    }
  }, []);

  const handleLinkClick = useCallback((id: string) => {
    if (!isLinking) return;

    if (!linkSource) {
      setLinkSource(id);
    } else {
      if (linkSource !== id) {
        beginTransaction();
        setEdges(prev => [...prev, {
          id: Math.random().toString(36).substring(7),
          source: linkSource,
          target: id
        }]);
      }
      setLinkSource(null);
      setIsLinking(false);
    }
  }, [isLinking, linkSource, beginTransaction]);

  const toggleLinking = () => {
    setIsLinking(!isLinking);
    setLinkSource(null);
  };

  // 联想面板里点「连线」→ 直接给源节点和目标节点加一条连线（不关闭面板）
  const handleConnectFromSuggest = (targetId: string) => {
    if (!suggestForNodeId) return;
    beginTransaction();
    setEdges((prev) => [
      ...prev,
      { id: Math.random().toString(36).substring(7), source: suggestForNodeId, target: targetId, directed: true },
    ]);
  };

  // 面板打开期间：选区切换为单个节点时，把「联想源」切换到该节点（保留各自缓存）
  useEffect(() => {
    if (!isSuggestOpen) return;
    if (selectedIds.size === 1) {
      const nid = Array.from(selectedIds)[0];
      setSuggestForNodeId((prev) => (prev === nid ? prev : nid));
    }
  }, [isSuggestOpen, selectedIds]);

  // 按节点拉取 AI 联想：该节点已有缓存则直接复用，不重复请求
  // 守卫用 ref 读最新缓存；epoch 变化（重新分析）时强制重新拉取
  useEffect(() => {
    if (!isSuggestOpen || !suggestForNodeId) return;
    if (suggestCacheRef.current[suggestForNodeId]) return; // 已有结果，保留（不清空）
    const src = nodes.find((n) => n.id === suggestForNodeId);
    if (!src) return;
    setSuggestLoading(true);
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/llm/associate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({ nodeId: suggestForNodeId, nodes, limit: 5 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || '请求失败');
        setSuggestByNode((prev) => ({ ...prev, [suggestForNodeId]: { suggestions: data.suggestions || [], error: null } }));
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          setSuggestByNode((prev) => ({ ...prev, [suggestForNodeId]: { suggestions: [], error: e?.message || '请求失败' } }));
        }
      } finally {
        setSuggestLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [isSuggestOpen, suggestForNodeId, nodes, suggestEpoch]);

  // 切换看板 → 清空 AI 联想内容并关闭面板
  useEffect(() => {
    setIsSuggestOpen(false);
    setSuggestForNodeId(null);
    setSuggestByNode({});
    setSuggestLoading(false);
  }, [currentPageId]);

  // 关闭面板 → 清空全部联想缓存（下次打开重新分析）
  const closeSuggest = () => {
    setIsSuggestOpen(false);
    setSuggestForNodeId(null);
    setSuggestByNode({});
    setSuggestLoading(false);
    setSuggestEpoch((e) => e + 1);
  };

  // 重新分析当前节点：仅清掉该节点的缓存并触发一次新请求（不动其它节点）
  const handleReanalyze = () => {
    if (!suggestForNodeId) return;
    setSuggestByNode((prev) => {
      const next = { ...prev };
      delete next[suggestForNodeId];
      return next;
    });
    setSuggestEpoch((e) => e + 1);
  };

  // 工具栏开关：打开仅置 true；关闭走 closeSuggest（与 ✕ 行为一致，清空缓存）
  const toggleSuggest = () => {
    if (isSuggestOpen) closeSuggest();
    else setIsSuggestOpen(true);
  };

  // ---- 连线增强：从节点边缘拖出预览线，松开时连线或新建节点 ----
  const ptInside = useCallback((pt: { wx: number; wy: number }, n: NodeData) => {
    const w = n.width || (n.type === 'image' ? 400 : 300);
    const h = n.height || (n.type === 'image' ? 300 : n.type === 'markdown' ? 320 : 200);
    return pt.wx >= n.x && pt.wx <= n.x + w && pt.wy >= n.y && pt.wy <= n.y + h;
  }, []);

  const handleDragEdgeStart = useCallback((e: React.PointerEvent, sourceId: string) => {
    if (isLinkingRef.current) return;
    e.stopPropagation();
    beginTransaction();
    const toWorld = (cx: number, cy: number) => ({ wx: (cx - x.get()) / scale.get(), wy: (cy - y.get()) / scale.get() });
    const start = toWorld(e.clientX, e.clientY);
    setDragEdge({ sourceId, curX: start.wx, curY: start.wy });

    const onMove = (mv: PointerEvent) => {
      const cur = toWorld(mv.clientX, mv.clientY);
      setDragEdge({ sourceId, curX: cur.wx, curY: cur.wy });
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const pt = toWorld(up.clientX, up.clientY);
      const hit = nodesRef.current.find((n) => n.id !== sourceId && ptInside(pt, n));
      setDragEdge(null);
      if (hit) {
        // 落在另一节点上 → 直接建立连线
        setEdges(prev => [...prev, { id: Math.random().toString(36).substring(7), source: sourceId, target: hit.id, directed: true }]);
      } else {
        // 落在空白 → 弹出节点类型选择，创建新节点并连线
        setDragNewMenu({ x: pt.wx, y: pt.wy, sourceId });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [x, y, scale, beginTransaction]);

  const createConnectedNode = (type: NodeType) => {
    if (!dragNewMenu) return;
    const { x: nx, y: ny, sourceId } = dragNewMenu;
    const id = Math.random().toString(36).substring(7);
    const defaultContent =
      type === 'link' ? 'https://example.com'
      : type === 'markdown' ? '# 新节点'
      : type === 'image' ? '' : '';
    setNodes(prev => [...prev, {
      id, type, x: nx - 75, y: ny - 40, content: defaultContent,
      color: randomNodeColor(),
      width: type === 'image' ? 400 : 300, height: type === 'image' ? 300 : undefined,
      zIndex: maxZ + 1,
    }]);
    setEdges(prev => [...prev, { id: Math.random().toString(36).substring(7), source: sourceId, target: id, directed: true }]);
    setMaxZ(prev => prev + 1);
    setDragNewMenu(null);
  };

  const handleDeleteSelected = (confirmIfEmpty: boolean = true) => {
    if (selectedIds.size === 0 && selectedEdgeIds.size === 0) {
      if (!confirmIfEmpty) return;
      if (confirm("Are you sure you want to clear the entire canvas?")) {
        beginTransaction();
        setNodes([]);
        setEdges([]);
        setSelectedIds(new Set());
        setSelectedEdgeIds(new Set());
      }
      return;
    }
    beginTransaction();

    setNodes(prev => prev.filter(n => !selectedIds.has(n.id)));
    setEdges(prev => prev.filter(e => 
      !selectedEdgeIds.has(e.id) && 
      !selectedIds.has(e.source) && 
      !selectedIds.has(e.target)
    ));
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
  };

  // ---- Undo / Redo ----
  const handleUndo = () => {
    const s = history.undo();
    if (s) {
      setNodes(s.nodes);
      setEdges(s.edges);
      setSelectedIds(new Set());
      setSelectedEdgeIds(new Set());
    }
  };

  const handleRedo = () => {
    const s = history.redo();
    if (s) {
      setNodes(s.nodes);
      setEdges(s.edges);
      setSelectedIds(new Set());
      setSelectedEdgeIds(new Set());
    }
  };

  // ---- Copy / paste ----
  const copiedRef = useRef<{ nodes: NodeData[]; edges: EdgeData[] } | null>(null);

  const handleCopy = () => {
    if (selectedIds.size === 0) return;
    copiedRef.current = {
      nodes: nodes.filter((n) => selectedIds.has(n.id)).map((n) => ({ ...n })),
      edges: edges
        .filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target))
        .map((e) => ({ ...e })),
    };
  };

  const handlePaste = () => {
    const src = copiedRef.current;
    if (!src || src.nodes.length === 0) return;
    beginTransaction();
    const idMap = new Map<string, string>();
    const newNodes = src.nodes.map((n) => {
      const id = Math.random().toString(36).substring(7);
      idMap.set(n.id, id);
      return { ...n, id, x: n.x + 40, y: n.y + 40, zIndex: maxZ + 1 };
    });
    const newEdges = src.edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        id: Math.random().toString(36).substring(7),
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }));
    const newIds = new Set(newNodes.map((n) => n.id));
    setMaxZ((prev) => prev + 1);
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
    setSelectedIds(newIds);
    setSelectedEdgeIds(new Set());
  };

  const nudgeSelected = (key: string, fast: boolean) => {
    if (selectedIds.size === 0) return;
    beginTransaction();
    const step = fast ? 40 : 10;
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
    setNodes((prev) =>
      prev.map((n) => (selectedIds.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    );
  };

  // ---- Global keyboard shortcuts ----
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && key === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (mod && key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected(false);
        return;
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        nudgeSelected(e.key, e.shiftKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Cmd/Ctrl+F 打开全局搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Space = temporary pan modifier (left-drag on empty space now selects).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Space picks an IME candidate while typing — don't arm pan mode then.
      if (e.isComposing) return;
      if (e.code === 'Space') setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Pan/zoom so the reorganized nodes fit comfortably in the viewport.
  const fitViewport = (positions: { id: string; x: number; y: number }[], nodeList: NodeData[] = nodes) => {
    const rects = nodeList.map(n => {
      const p = positions.find(q => q.id === n.id);
      return {
        x: p ? p.x : n.x,
        y: p ? p.y : n.y,
        w: n.width || 300,
        h: n.height || (n.type === 'image' ? 300 : 200),
      };
    });
    if (!rects.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rects.forEach(r => {
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    });
    const pad = 80;
    const availW = Math.max(1, window.innerWidth - pad * 2);
    const availH = Math.max(1, window.innerHeight - pad * 2);
    const fitScale = Math.max(
      0.2,
      Math.min(1.2, Math.min(availW / Math.max(1, maxX - minX), availH / Math.max(1, maxY - minY))),
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    x.set(window.innerWidth / 2 - cx * fitScale);
    y.set(window.innerHeight / 2 - cy * fitScale);
    scale.set(fitScale);
  };

  // 聚焦到单个节点：把视口移向该节点中心并选中它（搜索 / AI 联想共用）
  const focusNode = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    const w = n.width || (n.type === 'image' ? 400 : 300);
    const h = n.height || (n.type === 'image' ? 300 : n.type === 'markdown' ? 320 : 200);
    const cx = n.x + w / 2;
    const cy = n.y + h / 2;
    const s = scale.get();
    x.set(window.innerWidth / 2 - cx * s);
    y.set(window.innerHeight / 2 - cy * s);
    setSelectedIds(new Set([id]));
    setSelectedEdgeIds(new Set());
  };

  // 订阅视口变化（motion value 不触发 re-render）与窗口尺寸，驱动虚拟渲染重算
  useEffect(() => {
    const tick = () => setViewportTick((t) => t + 1);
    const onResize = () => { setViewportSize({ w: window.innerWidth, h: window.innerHeight }); tick(); };
    const unsubs = [x, y, scale].map((mv) => mv.on('change', tick));
    window.addEventListener('resize', onResize);
    return () => { unsubs.forEach((u) => u()); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 标签筛选 → 当前"可见子集"。未筛选时 = 全量；筛选时隐藏不匹配节点（非淡化）。
  const activeNodes = useMemo(() => {
    if (selectedTags.size === 0) return nodes;
    const tags = Array.from(selectedTags);
    return nodes.filter((n) => tags.every((t) => (n.tags || []).includes(t)));
  }, [nodes, selectedTags]);
  // 可见子集的边：两端点都在子集内才保留
  const activeEdges = useMemo(() => {
    const ids = new Set(activeNodes.map((n) => n.id));
    return edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [edges, activeNodes]);

  // 标签磁贴条数据：基于全量节点的标签计数（提供全貌），按数量降序
  const tagList = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n) => (n.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [nodes]);

  // 视口剔除：只渲染视口（含外延）内的节点，支撑千级节点流畅度
  const visibleNodes = useMemo(() => {
    const mx = x.get();
    const my = y.get();
    const ms = scale.get() || 1;
    const margin = 300;
    const x0 = (-mx) / ms - margin / ms;
    const y0 = (-my) / ms - margin / ms;
    const x1 = (viewportSize.w - mx) / ms + margin / ms;
    const y1 = (viewportSize.h - my) / ms + margin / ms;
    return activeNodes.filter((n) => {
      const w = n.width || (n.type === 'image' ? 400 : n.type === 'table' || n.type === 'chart' ? 480 : n.type === 'markdown' ? 420 : 300);
      const h = n.height || (n.type === 'image' ? 300 : n.type === 'table' ? 360 : n.type === 'markdown' ? 320 : 200);
      return n.x < x1 && n.x + w > x0 && n.y < y1 && n.y + h > y0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNodes, viewportTick, viewportSize]);

  const handleAiOrganize = async () => {
    setIsOrganizing(true);
    try {
      const response = await fetch('/api/organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 筛选激活时只整理当前可见子集，否则整理全量
        body: JSON.stringify({ nodes: activeNodes, edges: activeEdges })
      });

      const data = await response.json();

      if (response.ok && data.positions) {
        beginTransaction();
        // 只为「有切实名字」的分组生成标签，避免服务端返回空/纯空白组名时
        // 生成看似空的小框（<p><b></b></p>）。
        const labelNodes: NodeData[] = (data.groups || [])
          .filter((g: any) => typeof g.name === 'string' && g.name.trim())
          .map((g: any) => ({
            id: Math.random().toString(36).substring(7),
            type: 'text',
            x: g.x,
            y: g.y - 44,
            content: `<p><b>${escapeHtml(g.name.trim())}</b></p>`,
            color: 'rgba(255, 255, 255, 0.6)',
            width: 200,
            height: 36,
            fontSize: 13,
            zIndex: maxZ + 1,
          }));
        setMaxZ((prev) => prev + 1);
        // 应用新位置 + 自动打标：每个组把组主题名写为该组内所有节点的标签（去重）
        const tagByNode = new Map<string, string>();
        (data.groups || []).forEach((g: any) =>
          (Array.isArray(g.nodeIds) ? g.nodeIds : []).forEach((id: string) => {
            if (typeof g.name === 'string' && g.name.trim()) tagByNode.set(id, g.name.trim());
          })
        );
        setNodes(prev => prev.map(n => {
          const newPos = data.positions.find((p: any) => p.id === n.id);
          const gname = tagByNode.get(n.id);
          let next = newPos ? { ...n, x: newPos.x, y: newPos.y } : n;
          if (gname) {
            const cur = n.tags || [];
            if (!cur.includes(gname)) next = { ...next, tags: [...cur, gname] };
          }
          return next;
        }).concat(labelNodes));
        fitViewport(data.positions, activeNodes);
      } else {
        alert(data.error || "Failed to organize nodes");
      }
    } catch (e) {
      console.error(e);
      alert("调用 AI 整理失败，请检查服务与 LLM 配置");
    } finally {
      setIsOrganizing(false);
    }
  };

  // Create a highlighted text node to the right of the board content with the summary.
  const addSummaryNode = (summary: string) => {
    beginTransaction();
    const snap = stateRef.current;
    const maxX = snap.nodes.length ? Math.max(...snap.nodes.map((n) => n.x + (n.width || 300))) : 0;
    const minY = snap.nodes.length ? Math.min(...snap.nodes.map((n) => n.y)) : 0;
    const maxY = snap.nodes.length ? Math.max(...snap.nodes.map((n) => n.y + (n.height || 200))) : 0;

    const estimatedLines = Math.max(1, Math.ceil(summary.length / 42));
    const newNode: NodeData = {
      id: Math.random().toString(36).substring(7),
      type: 'text',
      x: maxX + 80,
      y: (minY + maxY) / 2 - 150,
      content: `<p><b>看板故事线</b></p>${textToHtml(summary)}`,
      color: 'rgba(238, 242, 255, 0.95)', // indigo-50 tint to mark the AI-generated story
      width: 420,
      height: Math.min(640, Math.max(240, estimatedLines * 24 + 120)),
      zIndex: maxZ + 1,
    };
    setMaxZ((prev) => prev + 1);
    setNodes((prev) => [...prev, newNode]);
    setSelectedIds(new Set([newNode.id]));
    setSelectedEdgeIds(new Set());
    setStoryNodeId(newNode.id);
  };

  // 新建「子集总结」文本节点：描述某个筛选子集的信息，并标注这是子集总结。
  // 与看板故事线不同，这个节点不挂故事控制条，用 emerald 色相区分。
  const addSubsetSummaryNode = (summary: string, label: string) => {
    beginTransaction();
    // 以筛选子集（activeNodes）为锚点，把总结节点放在子集右下角
    const set = activeNodes;
    const maxX = set.length ? Math.max(...set.map((n) => n.x + (n.width || 300))) : 0;
    const minX = set.length ? Math.min(...set.map((n) => n.x)) : 0;
    const minY = set.length ? Math.min(...set.map((n) => n.y)) : 0;
    const maxY = set.length ? Math.max(...set.map((n) => n.y + (n.height || 200))) : 0;

    const estimatedLines = Math.max(1, Math.ceil(summary.length / 42));
    const newNode: NodeData = {
      id: Math.random().toString(36).substring(7),
      type: 'text',
      x: maxX + 80,
      y: maxY + 60,
      content: `<p><b>「${escapeHtml(label || '筛选')}」子集总结</b></p>${textToHtml(summary)}`,
      color: 'rgba(236, 253, 245, 0.95)', // emerald-50 tint to mark an AI subset summary
      width: 420,
      height: Math.min(640, Math.max(240, estimatedLines * 24 + 120)),
      zIndex: maxZ + 1,
    };
    setMaxZ((prev) => prev + 1);
    setNodes((prev) => [...prev, newNode]);
    setSelectedIds(new Set([newNode.id]));
    setSelectedEdgeIds(new Set());
    // 清空筛选，让这个没有标签的总结节点立刻可见
    setSelectedTags(new Set());
    // 把视图中心带到新总结节点上，让用户直接看到结果
    const nodeW = newNode.width || 420;
    const nodeH = newNode.height || 240;
    const cx = newNode.x + nodeW / 2;
    const cy = newNode.y + nodeH / 2;
    x.set(-cx * scale.get() + window.innerWidth / 2);
    y.set(-cy * scale.get() + window.innerHeight / 2);
  };

  // Drop the story-control bar if the story node is deleted.
  useEffect(() => {
    if (storyNodeId && !nodes.some((n) => n.id === storyNodeId)) {
      setStoryNodeId(null);
    }
  }, [nodes, storyNodeId]);

  const regenerateStory = async (opts: { style?: string; instruction?: string }) => {
    if (!storyNodeId) return;
    setStoryBusy(true);
    try {
      // Same as handleAiSummarize: force-commit any in-flight edit first so the
      // regenerated story reflects the latest board content.
      if (document.activeElement instanceof HTMLElement) {
        const el = document.activeElement;
        if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          flushSync(() => el.blur());
        }
      }
      const snap = stateRef.current;
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: snap.nodes.filter((n) => n.id !== storyNodeId),
          edges: snap.edges,
          instruction: opts.instruction,
          style: opts.style,
        }),
      });
      const data = await response.json();
      if (response.ok && data.summary) {
        beginTransaction();
        const html = `<p><b>看板故事线</b></p>${textToHtml(data.summary)}`;
        const estimatedLines = Math.max(1, Math.ceil(data.summary.length / 42));
        handleUpdateNode(storyNodeId, {
          content: html,
          height: Math.min(640, Math.max(240, estimatedLines * 24 + 120)),
        });
      } else {
        alert(data.error || '重新生成失败');
      }
    } catch (e) {
      console.error(e);
      alert('重新生成失败，请检查服务与 LLM 配置');
    } finally {
      setStoryBusy(false);
    }
  };

  // Zoom around the viewport center / fit / reset helpers.
  const zoomAt = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const currentScale = scale.get();
    const newScale = Math.max(0.1, Math.min(5, currentScale * factor));
    const wx = (cx - x.get()) / currentScale;
    const wy = (cy - y.get()) / currentScale;
    x.set(cx - wx * newScale);
    y.set(cy - wy * newScale);
    scale.set(newScale);
  };

  const handleZoomIn = () => zoomAt(1.25);
  const handleZoomOut = () => zoomAt(1 / 1.25);

  const handleResetView = () => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const wx = (cx - x.get()) / scale.get();
    const wy = (cy - y.get()) / scale.get();
    scale.set(1);
    x.set(cx - wx);
    y.set(cy - wy);
  };

  const handleFitView = () => {
    if (!nodes.length) {
      handleResetView();
      return;
    }
    fitViewport(nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
  };

  // ---- AI 生成图表：读取表格数据 → /api/llm/chart → 在表格右侧创建 chart 节点 ----
  const handleGenerateChart = useCallback(async (tableNodeId: string) => {
    const table = nodesRef.current.find((n) => n.id === tableNodeId);
    if (!table || !table.tableData || table.tableData.length < 2) {
      alert('表格至少需要表头 + 一行数据才能生成图表');
      return;
    }
    setGeneratingChartId(tableNodeId);
    try {
      // TableCell[][] → string[][]
      const rows = table.tableData.map((row) => row.map((c) => c.text));
      const response = await fetch('/api/llm/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.data) && data.data.length > 0) {
        beginTransaction();
        const tw = table.width || 480;
        const chartNode: NodeData = {
          id: Math.random().toString(36).substring(7),
          type: 'chart',
          x: table.x + tw + 60,
          y: table.y,
          content: '',
          color: 'rgba(255, 255, 255, 0.95)',
          width: 480,
          height: 360,
          zIndex: (maxZRef.current += 1),
          chartConfig: {
            chartType: data.chartType,
            sourceTableId: tableNodeId,
            title: data.title,
            xAxis: data.xAxis,
            yAxis: data.yAxis,
            data: data.data,
          },
        };
        setMaxZ((prev) => prev + 1);
        setNodes((prev) => [...prev, chartNode]);
        setSelectedIds(new Set([chartNode.id]));
        setSelectedEdgeIds(new Set());
      } else {
        alert(data.error || 'AI 生成图表失败');
      }
    } catch (e) {
      console.error(e);
      alert('AI 生成图表失败，请检查服务与 LLM 配置');
    } finally {
      setGeneratingChartId(null);
    }
  }, [beginTransaction]);

  const handleAiSummarize = async () => {
    setIsSummarizing(true);
    try {
      // Commit any in-flight contentEditable edit first, so the summary reflects
      // what the user just typed (blur-commit races the button click otherwise).
      if (document.activeElement instanceof HTMLElement) {
        const el = document.activeElement;
        if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          flushSync(() => el.blur());
        }
      }
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 筛选激活时只总结当前可见子集，否则总结全量
        body: JSON.stringify({ nodes: activeNodes, edges: activeEdges }),
      });
      const data = await response.json();
      if (response.ok && data.summary) {
        addSummaryNode(data.summary);
      } else {
        alert(data.error || "AI 总结失败");
      }
    } catch (e) {
      console.error(e);
      alert("调用 AI 总结失败，请检查服务与 LLM 配置");
    } finally {
      setIsSummarizing(false);
    }
  };

  // 总结「筛选子集」：走与直接 AI Story 不同的简述提示词，并新建一个标注为子集总结的文本节点。
  const handleAiSummarizeSubset = async () => {
    setIsSummarizing(true);
    try {
      if (document.activeElement instanceof HTMLElement) {
        const el = document.activeElement;
        if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          flushSync(() => el.blur());
        }
      }
      const label = Array.from(selectedTags).join('、') || '筛选';
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: activeNodes,
          edges: activeEdges,
          mode: 'subset',
          subsetLabel: label,
        }),
      });
      const data = await response.json();
      if (response.ok && data.summary) {
        addSubsetSummaryNode(data.summary, label);
      } else {
        alert(data.error || "AI 子集总结失败");
      }
    } catch (e) {
      console.error(e);
      alert("调用 AI 子集总结失败，请检查服务与 LLM 配置");
    } finally {
      setIsSummarizing(false);
    }
  };

  const onPointerDownCanvas = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target !== containerRef.current && !target.classList.contains('canvas-bg')) return;

    // Linking mode: clicking empty space cancels it.
    if (isLinking) {
      setIsLinking(false);
      setLinkSource(null);
    }

    // Pan: middle mouse, Space+drag, or touch drag.
    if (e.button === 1 || spaceDown || e.pointerType === 'touch') {
      e.preventDefault();
      let lastX = e.clientX;
      let lastY = e.clientY;
      const onMove = (moveEvent: PointerEvent) => {
        x.set(x.get() + (moveEvent.clientX - lastX));
        y.set(y.get() + (moveEvent.clientY - lastY));
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }

    // Left-click / drag on empty space.
    if (e.button === 0) {
      // 单击空白处取消全部选中（节点 + 边，关闭选中态/操作卡片）。
      // Shift / Ctrl 等为「追加框选」模式，保留已有节点选中以支持多选。
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!additive) {
        setSelectedIds(new Set());
        setSelectedEdgeIds(new Set());
      } else if (selectedEdgeIds.size > 0) {
        setSelectedEdgeIds(new Set());
      }
      const toWorld = (cx: number, cy: number) => ({
        wx: (cx - x.get()) / scale.get(),
        wy: (cy - y.get()) / scale.get(),
      });
      const start = toWorld(e.clientX, e.clientY);
      const base = e.shiftKey ? selectedIds : new Set<string>();
      setMarquee({ x0: start.wx, y0: start.wy, x1: start.wx, y1: start.wy });

      const onMove = (moveEvent: PointerEvent) => {
        const cur = toWorld(moveEvent.clientX, moveEvent.clientY);
        const rect = {
          x0: Math.min(start.wx, cur.wx),
          y0: Math.min(start.wy, cur.wy),
          x1: Math.max(start.wx, cur.wx),
          y1: Math.max(start.wy, cur.wy),
        };
        setMarquee(rect);
        const hit = new Set(base);
        nodes.forEach((n) => {
          const nw = n.width || 300;
          const nh = n.height || (n.type === 'image' ? 300 : 200);
          if (n.x < rect.x1 && n.x + nw > rect.x0 && n.y < rect.y1 && n.y + nh > rect.y0) {
            hit.add(n.id);
          }
        });
        setSelectedIds(hit);
        setSelectedEdgeIds(new Set());
      };

      const onUp = () => {
        setMarquee(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden bg-[#f8f9fa] dark:bg-[#0f172a] selection:bg-blue-200 ${
        isLinking || marquee ? 'cursor-crosshair' : spaceDown ? 'cursor-grab' : 'cursor-default'
      } ${theme === 'dark' ? 'dark' : ''}`}
      onPointerDown={onPointerDownCanvas}
    >
      <motion.div
        style={{ x, y, scale }}
        className="absolute origin-top-left w-full h-full pointer-events-none will-change-transform"
      >
        <div className="absolute top-[-50000px] left-[-50000px] w-[100000px] h-[100000px] canvas-bg pointer-events-none" />

        <EdgeLayer
          nodes={activeNodes}
          edges={activeEdges}
          selectedEdgeIds={selectedEdgeIds}
          onSelectEdge={handleSelectEdge}
          dragEdge={dragEdge}
        />

        {marquee && (
          <div
            className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-10"
            style={{
              left: marquee.x0,
              top: marquee.y0,
              width: marquee.x1 - marquee.x0,
              height: marquee.y1 - marquee.y0,
            }}
          />
        )}

        <div className="absolute inset-0 pointer-events-none *:pointer-events-auto">
          {visibleNodes.map(node => {
            return (
              <CanvasNode
                key={node.id}
                node={node}
                onRemove={handleRemoveNode}
                onUpdate={handleUpdateNode}
                bringToFront={handleBringToFront}
                isSelected={selectedIds.has(node.id)}
                onSelect={handleSelectNode}
                isLinking={isLinking}
                onLinkClick={handleLinkClick}
                onTransactionStart={beginTransaction}
                onDragEdgeStart={handleDragEdgeStart}
                onGenerateChart={handleGenerateChart}
                isGeneratingChart={generatingChartId === node.id}
              />
            );
          })}
        </div>
      </motion.div>

      <Minimap nodes={nodes} x={x} y={y} scale={scale} />
      <ViewportControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={handleFitView}
        onReset={handleResetView}
      />

      {isSearchOpen && (
        <SearchPanel
          nodes={nodes}
          selectedNodeIds={selectedIds}
          onClose={() => setIsSearchOpen(false)}
          onFocusNode={focusNode}
        />
      )}

      {/* 松开拖拽线到空白处 → 选择新节点类型 */}
      {dragNewMenu && (
        <div
          className="fixed z-[70] flex items-center gap-1 p-1.5 bg-white/95 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-2xl dark:bg-gray-900/95 dark:border-white/10"
          style={{
            left: dragNewMenu.x * scale.get() + x.get() - 180,
            top: dragNewMenu.y * scale.get() + y.get() - 24,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="px-2 text-[11px] text-gray-400 whitespace-nowrap">新节点</span>
          {(['text', 'markdown', 'link', 'image'] as NodeType[]).map((t) => (
            <button
              key={t}
              onClick={() => createConnectedNode(t)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors capitalize dark:text-gray-300 dark:hover:bg-blue-500/20 dark:hover:text-blue-300"
            >
              {t}
            </button>
          ))}
          <div className="w-px h-5 bg-gray-200 mx-1 dark:bg-white/10" />
          <button
            onClick={() => setDragNewMenu(null)}
            className="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:bg-white/10"
          >
            取消
          </button>
        </div>
      )}

      {/* Pages Tree（文件夹 → 画布 两层结构） */}
      <PagesTree
        pages={pages}
        currentPageId={currentPageId}
        isOpen={isPagesOpen}
        onToggle={() => setIsPagesOpen((o) => !o)}
        expanded={expandedFolders}
        onToggleExpand={handleToggleExpand}
        onSwitch={setCurrentPageId}
        onAddPage={openTemplateFor}
        onAddFolder={handleAddFolder}
        onMovePage={handleMovePage}
        onDelete={handleDeletePage}
      />

      <button
        onClick={() =>
          setTheme((t) => {
            const next = t === 'dark' ? 'light' : 'dark';
            localStorage.setItem('canvas_theme', next);
            return next;
          })
        }
        className="fixed top-4 right-4 z-50 w-9 h-9 flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-2xl border border-white/60 shadow-sm text-gray-600 hover:text-gray-900 hover:bg-white transition-colors dark:bg-gray-900/80 dark:border-white/10 dark:text-gray-300 dark:hover:bg-gray-800"
        title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* 标签磁贴条（左上角，单击即筛） */}
      <TagRibbon tags={tagList} selectedTags={selectedTags} onToggleTag={handleToggleTag} />

      <Toolbar
        onAdd={handleAddNode}
        isLinking={isLinking}
        onToggleLink={toggleLinking}
        onToggleChat={() => setIsChatOpen((o) => !o)}
        isChatOpen={isChatOpen}
        onToggleSearch={() => setIsSearchOpen((o) => !o)}
        onToggleTagPanel={() => setIsTagPanelOpen((o) => !o)}
        isTagPanelOpen={isTagPanelOpen}
        onToggleSuggest={toggleSuggest}
        isSuggestOpen={isSuggestOpen}
        hasSingleSelection={selectedIds.size === 1}
        onAiOrganize={handleAiOrganize}
        isOrganizing={isOrganizing}
        onAiSummarize={handleAiSummarize}
        isSummarizing={isSummarizing}
        onLabelEdges={handleAiLabelEdges}
        isLabeling={isLabeling}
        canLabel={edges.length > 0}
        onClear={handleDeleteSelected}
        hasSelection={selectedIds.size > 0 || selectedEdgeIds.size > 0}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onExport={handleExport}
        onImport={() => importInputRef.current?.click()}
      />

      {linkSource && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg pointer-events-none z-50">
          Select target node to connect...
        </div>
      )}

      {storyNodeId && (
        <StoryControls
          busy={storyBusy}
          onRegenerate={regenerateStory}
          onClose={() => setStoryNodeId(null)}
        />
      )}

      <EdgeActionCard
        edge={selectedEdgeIds.size === 1 ? edges.find((e) => selectedEdgeIds.has(e.id)) || null : null}
        proposals={edgeProposals}
        isLabeling={isLabeling}
        onUpdateLabel={handleUpdateEdgeLabel}
        onRunAi={handleAiLabelEdge}
        onChangeProposal={handleChangeEdgeProposal}
        onApplyProposals={applyEdgeProposals}
        onCancelProposals={cancelEdgeProposals}
        onDismiss={handleDismissEdge}
      />

      <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <TemplateModal
        open={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onSelect={handleCreateFromTemplate}
      />

      <AiChatPanel
        open={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        nodes={nodes}
        edges={edges}
        currentPageName={pages.find((p) => p.id === currentPageId)?.name || ''}
        messages={chatByPage[currentPageId] ?? []}
        onChangeMessages={handleChatChange}
        onClear={handleClearChat}
        onInsertNode={handleInsertAiNode}
      />

      <TagPanel
        open={isTagPanelOpen}
        onClose={() => setIsTagPanelOpen(false)}
        nodes={nodes}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTag}
        onAiOrganize={handleAiOrganize}
        isOrganizing={isOrganizing}
        onAiSummarize={handleAiSummarizeSubset}
        isSummarizing={isSummarizing}
      />

      <SuggestPanel
        open={isSuggestOpen}
        onClose={closeSuggest}
        sourceNode={suggestForNodeId ? nodes.find((n) => n.id === suggestForNodeId) || null : null}
        nodes={nodes}
        suggestions={
          suggestForNodeId && suggestByNode[suggestForNodeId] ? suggestByNode[suggestForNodeId].suggestions : []
        }
        loading={!!suggestForNodeId && suggestLoading && !suggestByNode[suggestForNodeId]}
        error={suggestForNodeId && suggestByNode[suggestForNodeId] ? suggestByNode[suggestForNodeId].error : null}
        onFocus={focusNode}
        onConnect={handleConnectFromSuggest}
        onReanalyze={handleReanalyze}
      />

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  );
}
