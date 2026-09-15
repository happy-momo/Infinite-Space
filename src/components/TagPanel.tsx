// 标签面板（右侧抽屉）：展示所有标签与计数，点击组合筛选（隐藏非匹配节点），
// 并对筛选子集执行 AI 整理 / 总结。UI 与界面其余玻璃拟态 + 渐变风格统一。
// Tag panel — lists tags and counts, composite-filter by hiding non-matches,
// and runs AI organize/summarize on the filtered subset. Matches the app's glass aesthetic.
import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Tag as TagIcon, Sparkles, BookOpenText, Tags } from 'lucide-react';
import { NodeData } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  nodes: NodeData[];
  /** 当前筛选的标签集合 */
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  /** 对当前筛选子集执行 AI 整理 / 总结（总结走子集专有提示词） */
  onAiOrganize?: () => void;
  isOrganizing?: boolean;
  onAiSummarize?: () => void;
  isSummarizing?: boolean;
}

export function TagPanel({ open, onClose, nodes, selectedTags, onToggleTag, onAiOrganize, isOrganizing, onAiSummarize, isSummarizing }: Props) {
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

  const filtered = selectedTags.size > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="tag-panel"
          initial={{ x: 380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 380, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed top-0 right-0 bottom-0 w-[320px] md:w-[340px] max-w-[90vw] z-[60] bg-white/95 backdrop-blur-2xl border-l border-white/60 shadow-[-8px_0_32px_rgba(0,0,0,0.08)] flex flex-col dark:bg-gray-900/95 dark:border-white/10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* 头部：渐变图标 + 标题 + 副标题 + 关闭 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-sm">
                <TagIcon size={15} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-800 leading-tight dark:text-gray-100">标签</h2>
                <p className="text-[11px] text-gray-400 leading-tight dark:text-gray-500">按主题筛选并操作子集</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10" title="关闭 (Esc)">
              <X size={18} />
            </button>
          </div>

          {/* 当前筛选：可移除的标签胶囊 + 清除 */}
          {filtered && (
            <div className="px-4 py-2.5 border-b border-black/5 dark:border-white/10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-gray-400 shrink-0 dark:text-gray-500">筛选</span>
                {Array.from(selectedTags).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-medium dark:bg-indigo-500/25 dark:text-indigo-300"
                  >
                    {t}
                    <button onClick={() => onToggleTag(t)} className="p-0.5 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-500/40" title="移除该标签">
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <button onClick={() => onToggleTag('__clear__')} className="text-[11px] text-blue-500 hover:underline shrink-0">
                  清除
                </button>
              </div>
            </div>
          )}

          {/* 标签列表 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-1">
            <p className="px-1 pb-1 text-[11px] text-gray-400 dark:text-gray-500">
              {tagCounts.length ? `共 ${tagCounts.length} 个标签` : ''}
            </p>
            {tagCounts.length === 0 && (
              <div className="flex flex-col items-center gap-2 mt-10 px-6 text-center">
                <span className="w-10 h-10 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] flex items-center justify-center text-gray-300 dark:text-gray-600">
                  <Tags size={18} />
                </span>
                <p className="text-sm text-gray-400 leading-relaxed dark:text-gray-500">
                  还没有标签。<br />点「AI 整理」后，节点会按主题自动打上标签。
                </p>
              </div>
            )}
            {tagCounts.map(([tag, count]) => {
              const active = selectedTags.has(tag);
              return (
                <button
                  key={tag}
                  onClick={() => onToggleTag(tag)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
                    active
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white border-transparent shadow-sm'
                      : 'bg-white/60 border-black/5 text-gray-600 hover:bg-white hover:shadow-sm dark:bg-white/5 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm flex items-center gap-2 min-w-0">
                    <TagIcon size={13} className={`shrink-0 ${active ? 'opacity-80' : 'opacity-60'}`} />
                    <span className="truncate">{tag}</span>
                  </span>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-md ${active ? 'bg-white/20' : 'text-gray-400 bg-black/[0.04] dark:bg-white/10'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 筛选激活时：对当前可见子集执行 AI 整理 / 总结 */}
          {filtered && (onAiOrganize || onAiSummarize) && (
            <div className="px-4 py-3 border-t border-black/5 dark:border-white/10">
              <p className="text-[11px] text-gray-400 mb-2 dark:text-gray-500">对筛选子集执行</p>
              <div className="flex items-center gap-2">
                {onAiOrganize && (
                  <button
                    onClick={onAiOrganize}
                    disabled={isOrganizing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-medium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                    title="只对当前筛选出的节点做 AI 分组整理"
                  >
                    <Sparkles size={13} className={isOrganizing ? 'animate-pulse' : ''} />
                    {isOrganizing ? '整理中…' : '整理子集'}
                  </button>
                )}
                {onAiSummarize && (
                  <button
                    onClick={onAiSummarize}
                    disabled={isSummarizing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                    title="用子集专有提示词生成一份「子集总结」文本节点"
                  >
                    <BookOpenText size={13} className={isSummarizing ? 'animate-pulse' : ''} />
                    {isSummarizing ? '总结中…' : '总结子集'}
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}