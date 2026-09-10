// 主应用组件：无限画布的核心状态机。
// 负责节点/连线/页面/历史栈的增删改查，平移缩放视口、框选、快捷键、
// 以及对接后端 API（AI 整理、AI 故事、数据持久化）。
// Main app component — the core state machine of the infinite canvas.
import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { motion, useMotionValue } from 'motion/react';
import { CanvasNode } from './components/CanvasNode';
import { Toolbar } from './components/Toolbar';
import { Minimap } from './components/Minimap';
import { ViewportControls } from './components/ViewportControls';
import { StoryControls } from './components/StoryControls';
import { EdgeLayer } from './components/EdgeLayer';
import { NodeData, NodeType, EdgeData, Page } from './types';
import { initialNodes } from './data';
import { CanvasListItem } from './components/CanvasListItem';
import { SettingsModal } from './components/SettingsModal';
import { useHistory } from './hooks/useHistory';
import { loadConfig } from './lib/config';
import { organizeNodes as organizeLlm, summarizeBoard as summarizeLlm } from './lib/llm';
import { Plus, Layout, ChevronUp, ChevronDown, Sun, Moon } from 'lucide-react';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Plain-text storyline → light HTML so the text node renders nicely in prose.
const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('');

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

  const [maxZ, setMaxZ] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  const [isLinking, setIsLinking] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [storyNodeId, setStoryNodeId] = useState<string | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('canvas_theme') === 'dark' ? 'dark' : 'light');

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

  const handleDeletePage = (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation();
    if (pages.length <= 1) {
      alert("Cannot delete the last canvas.");
      return;
    }
    if (confirm("Are you sure you want to delete this canvas?")) {
      const nextPages = pages.filter(p => p.id !== pageId);
      setPages(nextPages);
      if (currentPageId === pageId) {
        setCurrentPageId(nextPages[0].id);
      }
      localStorage.removeItem(`canvas_nodes_${pageId}`);
      localStorage.removeItem(`canvas_edges_${pageId}`);
      localStorage.removeItem(`canvas_viewport_${pageId}`);
    }
  };

  const handleRenamePage = (id: string, name: string) => {
    setPages(prev => prev.map(p => (p.id === id ? { ...p, name } : p)));
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
    return () => el.removeEventListener('wheel', handleWheel);
  }, [x, y, scale]);

  const handleAddNode = (type: NodeType) => {
    beginTransaction();
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;

    const addX = (screenCenterX - x.get()) / scale.get();
    const addY = (screenCenterY - y.get()) / scale.get();

    const newNode: NodeData = {
      id: Math.random().toString(36).substring(7),
      type,
      x: addX - 150,
      y: addY - 100,
      content: type === 'image' ? '' : type === 'link' ? 'https://example.com' : '',
      color: 'rgba(255, 255, 255, 0.95)',
      width: type === 'image' ? 400 : 300,
      height: type === 'image' ? 300 : undefined,
      zIndex: maxZ + 1
    };
    setMaxZ(prev => prev + 1);
    setNodes(prev => [...prev, newNode]);
    setIsLinking(false);
    setLinkSource(null);
  };

  const handleRemoveNode = (id: string) => {
    beginTransaction();
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleUpdateNode = (id: string, updates: Partial<NodeData>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const handleBringToFront = (id: string) => {
    setMaxZ(prev => prev + 1);
    handleUpdateNode(id, { zIndex: maxZ + 1 });
  };

  const handleSelectNode = (id: string, multi: boolean) => {
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
  };

  const handleSelectEdge = (id: string, multi: boolean) => {
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
  };

  const handleLinkClick = (id: string) => {
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
  };

  const toggleLinking = () => {
    setIsLinking(!isLinking);
    setLinkSource(null);
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
  const fitViewport = (positions: { id: string; x: number; y: number }[]) => {
    const rects = nodes.map(n => {
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

  const handleAiOrganize = async () => {
    setIsOrganizing(true);
    const cfg = loadConfig();
    if (!cfg || !cfg.apiKey || !cfg.model || !cfg.baseUrl) {
      alert("请先在设置中配置 LLM（Base URL / 模型 / API Key）");
      setIsOrganizing(false);
      return;
    }
    try {
      const data = await organizeLlm(nodes, edges, cfg);
      beginTransaction();
      const labelNodes: NodeData[] = (data.groups || []).map((g: any) => ({
        id: Math.random().toString(36).substring(7),
        type: 'text',
        x: g.x,
        y: g.y - 44,
        content: `<p><b>${escapeHtml(String(g.name || '组'))}</b></p>`,
        color: 'rgba(255, 255, 255, 0.6)',
        width: 200,
        height: 36,
        fontSize: 13,
        zIndex: maxZ + 1,
      }));
      setMaxZ((prev) => prev + 1);
      setNodes(prev => [
        ...prev.map(n => {
          const newPos = (data.positions || []).find((p: any) => p.id === n.id);
          if (newPos) {
            return { ...n, x: newPos.x, y: newPos.y };
          }
          return n;
        }),
        ...labelNodes,
      ]);
      fitViewport(data.positions);
    } catch (e) {
      console.error(e);
      alert((e instanceof Error && e.message) ? e.message : "调用 AI 整理失败，请检查服务与 LLM 配置");
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
      const cfg = loadConfig();
      if (!cfg || !cfg.apiKey || !cfg.model || !cfg.baseUrl) {
        alert('请先在设置中配置 LLM（Base URL / 模型 / API Key）');
        setStoryBusy(false);
        return;
      }
      const snap = stateRef.current;
      const summary = await summarizeLlm(
        snap.nodes.filter((n) => n.id !== storyNodeId),
        snap.edges,
        cfg,
        { instruction: opts.instruction, style: opts.style },
      );
      beginTransaction();
      const html = `<p><b>看板故事线</b></p>${textToHtml(summary)}`;
      const estimatedLines = Math.max(1, Math.ceil(summary.length / 42));
      handleUpdateNode(storyNodeId, {
        content: html,
        height: Math.min(640, Math.max(240, estimatedLines * 24 + 120)),
      });
    } catch (e) {
      console.error(e);
      alert((e instanceof Error && e.message) ? e.message : '重新生成失败，请检查服务与 LLM 配置');
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
      const cfg = loadConfig();
      if (!cfg || !cfg.apiKey || !cfg.model || !cfg.baseUrl) {
        alert('请先在设置中配置 LLM（Base URL / 模型 / API Key）');
        setIsSummarizing(false);
        return;
      }
      const snap = stateRef.current;
      const summary = await summarizeLlm(snap.nodes, snap.edges, cfg);
      addSummaryNode(summary);
    } catch (e) {
      console.error(e);
      alert((e instanceof Error && e.message) ? e.message : "调用 AI 总结失败，请检查服务与 LLM 配置");
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

    // Left-drag on empty space = marquee selection.
    if (e.button === 0) {
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
        className="absolute origin-top-left w-full h-full pointer-events-none"
      >
        <div className="absolute top-[-50000px] left-[-50000px] w-[100000px] h-[100000px] canvas-bg pointer-events-none" />

        <EdgeLayer 
          nodes={nodes} 
          edges={edges} 
          selectedEdgeIds={selectedEdgeIds}
          onSelectEdge={handleSelectEdge}
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
          {nodes.map(node => (
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
            />
          ))}
        </div>
      </motion.div>

      <Minimap nodes={nodes} x={x} y={y} scale={scale} />
      <ViewportControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={handleFitView}
        onReset={handleResetView}
      />

      {/* Pages Panel */}
      <div className="fixed bottom-8 left-8 flex flex-col items-start gap-2 z-50">
        <button 
          onClick={() => setIsPagesOpen(!isPagesOpen)}
          className="flex items-center gap-2 mb-1 px-3 py-2 bg-white/80 backdrop-blur-md rounded-xl text-gray-700 font-medium text-xs uppercase tracking-wider shadow-sm border border-black/5 hover:bg-white transition-colors dark:bg-gray-900/80 dark:border-white/10 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Layout size={14} /> Canvases {isPagesOpen ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}
        </button>
        
        {isPagesOpen && (
          <>
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {pages.map(p => (
                <CanvasListItem
                  key={p.id}
                  page={p}
                  isActive={currentPageId === p.id}
                  canDelete={pages.length > 1}
                  onSwitch={setCurrentPageId}
                  onRename={handleRenamePage}
                  onDelete={handleDeletePage}
                />
              ))}
            </div>
            <button
              onClick={() => {
                const newId = Math.random().toString(36).substring(7);
                setPages(prev => [...prev, { id: newId, name: `Canvas ${prev.length + 1}` }]);
                setCurrentPageId(newId);
              }}
              className="mt-2 w-40 px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-gray-600 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 border border-transparent hover:border-black/5 dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-300"
            >
              <Plus size={16} /> New Canvas
            </button>
          </>
        )}
      </div>

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

      <Toolbar
        onAdd={handleAddNode}
        isLinking={isLinking}
        onToggleLink={toggleLinking}
        onAiOrganize={handleAiOrganize}
        isOrganizing={isOrganizing}
        onAiSummarize={handleAiSummarize}
        isSummarizing={isSummarizing}
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

      <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

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
