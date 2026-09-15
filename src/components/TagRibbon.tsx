// 左上角标签磁贴条：单击即筛（组合 AND），一键清除，无需打开右侧抽屉。
// Top-left tag ribbon — one-click filtering (composite AND) with a clear button.
import { motion } from 'motion/react';
import { Tag as TagIcon, X } from 'lucide-react';

interface Props {
  tags: { name: string; count: number }[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
}

export function TagRibbon({ tags, selectedTags, onToggleTag }: Props) {
  if (tags.length === 0) return null;
  const hasSelection = selectedTags.size > 0;

  return (
    <div className="fixed top-4 left-4 z-[60] flex items-center gap-1.5 max-w-[80vw] px-2 py-1.5 rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:bg-gray-900/80 dark:border-white/10">
      <span className="shrink-0 flex items-center gap-1 px-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
        <TagIcon size={13} />
        <span className="hidden md:inline">标签</span>
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {tags.map((t) => {
          const active = selectedTags.has(t.name);
          return (
            <motion.button
              key={t.name}
              onClick={() => onToggleTag(t.name)}
              whileTap={{ scale: 0.95 }}
              title={`筛选「${t.name}」`}
              className={`flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm'
                  : 'bg-white/70 text-gray-600 hover:bg-white hover:text-gray-900 border border-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white dark:border-white/10'
              }`}
            >
              <span className="max-w-[10ch] truncate">{t.name}</span>
              <span className={`text-[10px] leading-none px-1 py-0.5 rounded ${active ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'}`}>
                {t.count}
              </span>
              {active && (
                <span className="p-0.5 rounded hover:bg-white/20" onClick={(e) => { e.stopPropagation(); onToggleTag(t.name); }}>
                  <X size={11} />
                </span>
              )}
            </motion.button>
          );
        })}
        {hasSelection && (
          <button
            onClick={() => onToggleTag('__clear__')}
            className="px-2 py-1 rounded-lg text-[11px] text-blue-500 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/20 transition-colors"
          >
            清除
          </button>
        )}
      </div>
    </div>
  );
}