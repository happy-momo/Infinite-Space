// 模板选择弹窗：新建画布时让用户从内置模板中选择，或从空白开始。
// Template selection modal — shown when creating a new canvas.
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, LayoutTemplate, FilePlus2 } from 'lucide-react';
import { TEMPLATES, Template } from '../templates';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 选择一个模板（或 null → 空白）来新建画布 */
  onSelect: (template: Template) => void;
}

export function TemplateModal({ open, onClose, onSelect }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[70] bg-black/20 dark:bg-black/50 flex items-center justify-center p-4"
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
          onWheel={(e) => e.stopPropagation()}
        >
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ opacity: { duration: 0.16 }, scale: { type: 'spring', stiffness: 380, damping: 28 } }}
            className="w-full max-w-xl bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-2xl dark:bg-gray-900/85 dark:border-white/10"
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center shadow-sm">
                  <LayoutTemplate size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">新建画布</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">选择一个模板开始</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10"
                title="关闭 (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 max-h-[min(68vh,540px)] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t)}
                    className="group text-left p-4 rounded-xl border border-black/5 bg-white/60 hover:bg-white hover:border-blue-300 hover:shadow-md transition-all dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 dark:hover:border-blue-500/50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <FilePlus2 size={14} className="text-indigo-500 shrink-0" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t.name}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-3">
                      {t.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}