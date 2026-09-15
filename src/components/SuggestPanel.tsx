// AI 联想建议面板（受控）：展示当前源节点的语义相关节点，点击可跳转或连线。
// 结果是「按节点缓存」的——切换节点、点击操作都不会清空，关闭侧栏或切换看板时才整体清空。
// 美术风格与全系统玻璃拟态统一：品牌渐变 from-indigo-500 to-violet-500 + 蓝/绿操作按钮。
// Controlled AI associate panel — shows semantically related nodes for the current
// source; actions (jump/connect) never close it. Results are cached per source node.
import { AnimatePresence, motion } from 'motion/react';
import { X, Link2, Maximize2, Loader2, Lightbulb, RefreshCw } from 'lucide-react';
import { NodeData } from '../types';

export interface Suggestion {
  nodeId: string;
  reason: string;
  confidence: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 当前正在"联想"的源节点 */
  sourceNode: NodeData | null;
  nodes: NodeData[];
  /** 当前源节点已缓存的联想结果（受控） */
  suggestions: Suggestion[];
  loading: boolean;
  error: string | null;
  /** 跳转到相关节点（不关闭面板） */
  onFocus: (nodeId: string) => void;
  /** 与源节点建立连线（不关闭面板） */
  onConnect: (targetId: string) => void;
  /** 重新分析当前节点：清掉该节点缓存并重新请求 */
  onReanalyze: () => void;
}

export function SuggestPanel({ open, onClose, sourceNode, nodes, suggestions, loading, error, onFocus, onConnect, onReanalyze }: Props) {
  if (!sourceNode) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="suggest"
          initial={{ x: 380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 380, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed right-6 top-20 bottom-24 w-[320px] md:w-[340px] max-w-[90vw] z-[60] bg-white/90 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-2xl overflow-hidden flex flex-col dark:bg-gray-900/90 dark:border-white/10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-sm">
                <Lightbulb size={15} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI 联想</h2>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">按节点各自保存，不会因操作清空</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onReanalyze} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors dark:hover:text-indigo-300 dark:hover:bg-indigo-500/20" title="重新分析当前节点">
                <RefreshCw size={15} />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10" title="关闭（清空联想）">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* 当前源节点 */}
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-black/5 dark:border-white/10">
            源节点：<span className="font-medium text-gray-700 dark:text-gray-200 truncate">
              {sourceNode.content.replace(/<[^>]*>/g, '').slice(0, 24) || sourceNode.type}
            </span>
          </div>

          {/* 结果列表 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-10 text-sm text-gray-400">
                <Loader2 size={18} className="animate-spin mr-2" /> 正在分析…
              </div>
            )}
            {error && (
              <div className="text-center py-10 text-sm text-red-500">{error}</div>
            )}
            {!loading && !error && suggestions.length === 0 && (
              <div className="text-center py-10 text-sm text-gray-400">未找到相关节点</div>
            )}
            {!loading && !error && suggestions.map((s, i) => {
              const node = nodes.find((n) => n.id === s.nodeId);
              if (!node) return null;
              return (
                <div key={s.nodeId} className="p-3 rounded-xl border border-black/5 bg-white/60 dark:bg-white/5 dark:border-white/10">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[10px] font-bold">
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium text-gray-700 truncate dark:text-gray-200">
                        {node.content.replace(/<[^>]*>/g, ' ').slice(0, 24) || node.type}
                      </span>
                    </div>
                    <span className="text-[10px] text-indigo-600 font-medium shrink-0 dark:text-indigo-400">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mb-2 leading-relaxed dark:text-gray-400">{s.reason}</p>
                  <div className="flex items-center gap-1">
                    {/* 操作不关闭面板、不清空结果 */}
                    <button
                      onClick={() => onFocus(s.nodeId)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/30"
                    >
                      <Maximize2 size={12} /> 跳转
                    </button>
                    <button
                      onClick={() => onConnect(s.nodeId)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30"
                    >
                      <Link2 size={12} /> 连线
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}