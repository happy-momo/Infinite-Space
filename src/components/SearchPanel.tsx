// 全局搜索面板：搜索当前页面所有节点的内容，按类型筛选，点击结果飞过去并高亮。
// Global search panel — search node contents on the current page, filter by type, jump on click.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft, Type, Image as ImageIcon, Link, FileCode2 } from 'lucide-react';
import { NodeData } from '../types';

interface Props {
  nodes: NodeData[];
  selectedNodeIds: Set<string>;
  onClose: () => void;
  /** 点击结果：飞到该节点并高亮 */
  onFocusNode: (nodeId: string) => void;
}

const NODE_TYPES: { t: NodeData['type']; label: string; icon: React.ReactNode }[] = [
  { t: 'text', label: '文字', icon: <Type size={13} /> },
  { t: 'markdown', label: 'Markdown', icon: <FileCode2 size={13} /> },
  { t: 'link', label: '链接', icon: <Link size={13} /> },
  { t: 'image', label: '图片', icon: <ImageIcon size={13} /> },
  { t: 'table', label: '表格', icon: <Type size={13} /> },
  { t: 'chart', label: '图表', icon: <FileCode2 size={13} /> },
];

/** 提取纯文本（去除 HTML 标签、Markdown 符号），便于搜索匹配 */
const toPlainText = (content: string): string =>
  content
    .replace(/<[^>]*>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function SearchPanel({ nodes, selectedNodeIds, onClose, onFocusNode }: Props) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<NodeData['type'] | 'all'>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc 关闭（阻止和全局画布快捷键冲突）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((n) => {
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (!q) return true;
      return toPlainText(n.content).toLowerCase().includes(q);
    });
  }, [nodes, query, typeFilter]);

  useEffect(() => { setActiveIndex(0); }, [query, typeFilter]);

  const jump = (id: string) => {
    onFocusNode(id);
    onClose();
  };

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 w-[420px] max-w-[90vw] z-[70] bg-white/90 backdrop-blur-2xl border border-white/60 shadow-[0_16px_48px_rgba(0,0,0,0.15)] rounded-2xl overflow-hidden dark:bg-gray-900/90 dark:border-white/10"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 输入框 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5 dark:border-white/10">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[activeIndex]) jump(results[activeIndex].id);
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
          }}
          placeholder="搜索节点内容…"
          className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400 dark:text-gray-200"
        />
        <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:bg-white/10" title="关闭 (Esc)">
          <X size={15} />
        </button>
      </div>

      {/* 类型筛选 */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-black/5 flex-wrap dark:border-white/10">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-2 py-0.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-300' : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10'}`}
        >
          全部
        </button>
        {NODE_TYPES.map(({ t, label, icon }) => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === t ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-300' : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10'}`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* 结果列表 */}
      <div className="max-h-[300px] overflow-y-auto custom-scrollbar py-1">
        {results.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">无匹配结果</div>
        )}
        {results.map((n, i) => {
          const typeMeta = NODE_TYPES.find((x) => x.t === n.type) || { label: n.type, icon: <Type size={13} /> };
          return (
            <button
              key={n.id}
              onClick={() => jump(n.id)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === activeIndex ? 'bg-blue-50 dark:bg-blue-500/15' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
            >
              <span className="text-gray-400 shrink-0">{typeMeta.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-gray-700 dark:text-gray-200 truncate">
                  {toPlainText(n.content) || `空白 ${typeMeta.label}`}
                </div>
                <div className="text-[11px] text-gray-400 capitalize">{typeMeta.label}{selectedNodeIds.has(n.id) ? ' · 当前选中' : ''}</div>
              </div>
              {i === activeIndex && <CornerDownLeft size={14} className="text-blue-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}