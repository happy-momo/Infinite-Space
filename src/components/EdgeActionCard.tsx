// 连线操作卡片（底部居中玻璃卡片）：给选中的边手动设置"关系说明"，
// 或展示 AI 为边提案的关系说明（可逐条编辑后应用）。样式与界面玻璃拟态统一。
// Edge action card — set a relationship description for the selected edge manually,
// or review AI-proposed edge labels (editable) before applying. Matches the glass aesthetic.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRightLeft, Sparkles, Loader2, Check, X, PencilLine } from 'lucide-react';
import { EdgeData } from '../types';

export interface EdgeProposal {
  edgeId: string;
  label: string;
  desc: string;
}

interface Props {
  /** 当前恰一条选中的连线（无则不显示手动编辑区） */
  edge?: EdgeData | null;
  /** AI 提案的关系说明（非 null 时显示提案区） */
  proposals: EdgeProposal[] | null;
  isLabeling: boolean;
  /** 提交手动编辑的关系说明（空字符串 = 清除 label） */
  onUpdateLabel: (edgeId: string, label: string) => void;
  /** 触发 AI 标注（针对当前选中的这条边） */
  onRunAi: (edgeId: string) => void;
  /** 修改某条提案的 label */
  onChangeProposal: (edgeId: string, label: string) => void;
  onApplyProposals: () => void;
  onCancelProposals: () => void;
  /** 提交/取消后关闭本卡片（父组件取消边选中即可隐藏） */
  onDismiss: () => void;
}

export function EdgeActionCard({
  edge, proposals, isLabeling, onUpdateLabel, onRunAi, onChangeProposal, onApplyProposals, onCancelProposals, onDismiss,
}: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // 只有用户真正编辑过（dirty）才允许提交。避免：卡片挂载、草稿尚未从 edge.label 同步时，
  // 一次 focus/blur 竞态把已有标注误删成空。dirty 在切换边时重置。
  const dirtyRef = useRef(false);

  // 选中边变化（id 或 label 变化）时同步本地草稿，并重置脏标记
  useEffect(() => {
    setDraft(edge?.label || '');
    dirtyRef.current = false;
  }, [edge?.id, edge?.label]);

  // 无论焦点在何处（输入框内/AI 提案模式/空白处），Esc 都关闭本卡片：
  // 还原手动草稿、丢弃待应用的 AI 提案，再让父组件取消选中以隐藏卡片。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key !== 'Escape') return;
      dirtyRef.current = false;
      setDraft(edge?.label || '');
      onCancelProposals();
      onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [edge?.id, edge?.label, onCancelProposals, onDismiss]);

  // 仅在「边切换」时聚焦输入框（不依赖 label，避免输入过程中被重聚焦打断）
  useEffect(() => {
    if (edge) inputRef.current?.focus();
  }, [edge?.id]);

  const commit = () => {
    if (!edge || !dirtyRef.current) return; // 未编辑过则不提交，保住已有标注
    onUpdateLabel(edge.id, draft.trim());
  };
  const showManual = !!edge && !proposals;
  const showAi = !!proposals || isLabeling;

  return (
    <AnimatePresence>
      {(showManual || showAi) && (
        <motion.div
          key="edge-action-card"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'tween', ease: 'easeOut', duration: 0.18 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[90vw] max-w-md bg-white/90 backdrop-blur-2xl border border-white/60 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-4 dark:bg-gray-900/90 dark:border-white/10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* AI 提案区 */}
          {(showAi || showManual) && proposals && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center">
                  <Sparkles size={14} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI 关系标注</h3>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">逐条可改，满意后一并应用</p>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2">
                {proposals.map((p) => (
                  <div key={p.edgeId}>
                    <p className="text-[11px] text-gray-400 mb-0.5 truncate dark:text-gray-500">{p.desc}</p>
                    <input
                      value={p.label}
                      onChange={(e) => onChangeProposal(p.edgeId, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm bg-white/70 border border-black/5 rounded-lg outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 dark:bg-white/10 dark:border-white/10 dark:text-gray-100"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onApplyProposals}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-medium hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <Check size={13} /> 应用
                </button>
                <button
                  onClick={onCancelProposals}
                  className="flex-1 px-3 py-2 rounded-xl border border-black/5 text-gray-500 text-xs font-medium hover:bg-black/5 transition-colors dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* AI 加载态 */}
          {showAi && !proposals && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-2 dark:text-gray-500">
              <Loader2 size={16} className="animate-spin text-indigo-500" />
              AI 正在理解连线关系…
            </div>
          )}

          {/* 手动编辑区 */}
          {showManual && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center">
                    <PencilLine size={14} />
                  </span>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">关系说明</h3>
                </div>
                <button
                  onClick={() => { if (edge) onRunAi(edge.id); }}
                  disabled={isLabeling}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50 dark:bg-indigo-500/20 dark:text-indigo-300 dark:hover:bg-indigo-500/30"
                  title="让 AI 为这条连线生成关系说明"
                >
                  <Sparkles size={12} /> AI 标注
                </button>
              </div>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); dirtyRef.current = true; }}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as KeyboardEvent).isComposing) return;
                  if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); onDismiss(); }
                  // Escape 由全局监听统一处理（还原草稿 + 关闭卡片），此处不重复拦截。
                }}
                onBlur={commit}
                placeholder="如：原因、属于、引用于…"
                className="w-full px-3 py-2 text-sm bg-white/70 border border-black/5 rounded-xl outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:bg-white/10 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Enter 确认并关闭 · Esc 取消并关闭 · 留空即清除</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}