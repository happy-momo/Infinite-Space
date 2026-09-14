// AI 联想建议面板：选中一个节点时点「找相关」，列出语义相关的其他节点，点击跳转或连线。
// AI associate panel — lists semantically related nodes for the selected one; click to jump or connect.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Sparkles, Link2, Maximize2, Loader2, Lightbulb } from 'lucide-react';
import { NodeData } from '../types';

interface Suggestion {
  nodeId: string;
  reason: string;
  confidence: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sourceNode: NodeData | null;
  nodes: NodeData[];
  /** 点击跳转 */
  onFocus: (nodeId: string) => void;
  /** 与源节点建立连线 */
  onConnect: (targetId: string) => void;
}

export function SuggestPanel({ open, onClose, sourceNode, nodes, onFocus, onConnect }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sourceNode) return;
    setLoading(true);
    setSuggestions([]);
    setError(null);

    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/llm/associate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({ nodeId: sourceNode.id, nodes, limit: 5 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '请求失败');
        setSuggestions(data.suggestions || []);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError(e?.message || '请求失败');
      } finally {
        setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [open, sourceNode?.id, nodes]);

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
          className="fixed top-0 right-0 bottom-0 w-[320px] md:w-[340px] max-w-[90vw] z-[60] bg-white/95 backdrop-blur-2xl border-l border-white/60 shadow-[-8px_0_32px_rgba(0,0,0,0.08)] flex flex-col dark:bg-gray-900/95 dark:border-white/10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-500 text-white flex items-center justify-center shadow-sm">
                <Lightbulb size={15} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI 联想</h2>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">相关节点建议</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>

          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-black/5 dark:border-white/10">
            源节点：<span className="font-medium text-gray-700 dark:text-gray-200 truncate">
              {sourceNode.content.replace(/<[^>]*>/g, '').slice(0, 24) || sourceNode.type}
            </span>
          </div>

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
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-500 text-white text-[10px] font-bold">
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium text-gray-700 truncate dark:text-gray-200">
                        {node.content.replace(/<[^>]*>/g, ' ').slice(0, 24) || node.type}
                      </span>
                    </div>
                    <span className="text-[10px] text-fuchsia-600 font-medium shrink-0 dark:text-fuchsia-400">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mb-2 leading-relaxed dark:text-gray-400">{s.reason}</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { onFocus(s.nodeId); onClose(); }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/30"
                    >
                      <Maximize2 size={12} /> 跳转
                    </button>
                    <button
                      onClick={() => { onConnect(s.nodeId); onClose(); }}
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