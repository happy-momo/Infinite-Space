// 标签面板：展示当前页面所有标签及节点数，点击筛选（高亮匹配节点、淡化其他节点）。
// Tag panel — lists all tags on the page; clicking a tag filters the canvas (highlight matches, dim others).
import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Tag as TagIcon } from 'lucide-react';
import { NodeData } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  nodes: NodeData[];
  /** 当前筛选的标签集合 */
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
}

export function TagPanel({ open, onClose, nodes, selectedTags, onToggleTag }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 统计每个标签的节点数，按数量降序
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n) => (n.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="tag-panel"
          initial={{ x: 380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 380, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed top-0 right-0 bottom-0 w-[85vw] md:w-[320px] z-[60] bg-white/95 backdrop-blur-2xl border-l border-white/60 shadow-[-8px_0_32px_rgba(0,0,0,0.08)] flex flex-col dark:bg-gray-900/95 dark:border-white/10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-sm">
                <TagIcon size={15} />
              </span>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">标签</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10" title="关闭">
              <X size={18} />
            </button>
          </div>

          {selectedTags.size > 0 && (
            <div className="px-4 pt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-gray-400">筛选:</span>
              {Array.from(selectedTags).map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-600 text-xs font-medium dark:bg-indigo-500/25 dark:text-indigo-300">
                  {t}
                  <button onClick={() => onToggleTag(t)} className="ml-1 hover:text-red-500">×</button>
                </span>
              ))}
              <button onClick={() => onToggleTag('__clear__')} className="text-[11px] text-blue-500 hover:underline">清除</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-1">
            {tagCounts.length === 0 && (
              <div className="text-center mt-10 text-sm text-gray-400 dark:text-gray-500">
                还没有标签。<br />选中节点后，用节点上的「+ 标签」添加。
              </div>
            )}
            {tagCounts.map(([tag, count]) => {
              const active = selectedTags.has(tag);
              return (
                <button
                  key={tag}
                  onClick={() => onToggleTag(tag)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${
                    active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200' : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm flex items-center gap-2">
                    <TagIcon size={13} className="opacity-60" />
                    {tag}
                  </span>
                  <span className="text-xs text-gray-400">{count}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}