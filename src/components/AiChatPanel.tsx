// AI 对话侧边栏：与看板对话（SSE 流式输出），可让 AI 总结/扩写/生成新节点。
// 消息状态由父组件（App）按画布分桶管理；本组件为受控组件，仅负责渲染与流式交互。
// AI chat sidebar — talk to your board with SSE streaming. Messages are owned by the parent
// (per-canvas); this is a controlled component for rendering + streaming only.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Send, Loader2, Sparkles, Square, MessageSquare, Trash2 } from 'lucide-react';
import { NodeData, EdgeData, ChatMessage, NodeType } from '../types';
import { loadConfig } from '../lib/config';
import { streamLlm } from '../lib/llm';

interface Props {
  open: boolean;
  onClose: () => void;
  nodes: NodeData[];
  edges: EdgeData[];
  currentPageName: string;
  /** 当前画布的完整对话（受控） */
  messages: ChatMessage[];
  /** 提交新的完整对话 */
  onChangeMessages: (msgs: ChatMessage[]) => void;
  /** 清空当前画布对话（由父组件执行、指向当前看板） */
  onClear: () => void;
  /** AI 生成新节点 */
  onInsertNode: (type: NodeType, content: string) => void;
}

// Markdown 富文本渲染：复用全局 prose 排版（与 Markdown 节点一致），外链新窗口打开。
const Markdown = ({ children }: { children: string }) => (
  <div className="prose prose-sm prose-slate max-w-none">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node, ...rest }) => <a {...rest} target="_blank" rel="noopener noreferrer" />,
      }}
    >
      {children}
    </ReactMarkdown>
  </div>
);

// 纯文本提取（搜索/发送给 AI 用）
const toPlainText = (content: string): string =>
  content
    .replace(/<[^>]*>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// 把看板节点/连线序列化为上下文附加到 system 指令（浏览器版，镜像服务端 buildCanvasContext）。
const buildCanvasContext = (pageName: string, nodes: NodeData[], edges: EdgeData[]): string => {
  const sys =
    '你是一个嵌入无限画布应用的 AI 助手。用简洁、友好的中文回答用户关于画布与节点内容的提问，也可帮用户梳理、扩展、总结思路。';
  if (!Array.isArray(nodes) || nodes.length === 0) return sys;
  const nodesText = nodes
    .slice(0, 80)
    .map((n) => {
      let t = '';
      if (n.type === 'table' && Array.isArray(n.tableData) && n.tableData.length > 0) {
        t = n.tableData
          .slice(0, 10)
          .map((row: any[]) => row.map((c: any) => String(c?.text ?? '')).join(' | '))
          .join('\n')
          .slice(0, 600);
      } else if (n.type === 'chart' && n.chartConfig) {
        const pts = (n.chartConfig.data || [])
          .slice(0, 15)
          .map((d: any) => `${d.label}:${d.value}`)
          .join(', ');
        t = `[${n.chartConfig.chartType || 'chart'}] ${n.chartConfig.title || ''} | ${pts}`;
      } else {
        t = (typeof n.content === 'string' ? n.content : '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200);
      }
      const tagText = Array.isArray(n.tags) && n.tags.length ? `[标签:${n.tags.slice(0, 5).join(',')}] ` : '';
      return `- [${n.type || 'text'}] (id=${n.id}) ${tagText}${t}`;
    })
    .join('\n');
  const edgeText = (Array.isArray(edges) ? edges : [])
    .slice(0, 100)
    .map((e) => `${e.source} → ${e.target}`)
    .join('\n');
  return `${sys}\n\n当前看板「${pageName || '未命名'}」的内容：\n${nodesText}\n\n节点之间的连接：\n${edgeText || '（无）'}\n说明：你可以参考上面的看板内容回答问题，但不要编造看板中不存在的内容。`;
};

export function AiChatPanel({ open, onClose, nodes, edges, currentPageName, messages, onChangeMessages, onClear, onInsertNode }: Props) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamText]);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || streaming) return;
    setInput('');
    setStreamText('');

    // base = 已提交对话 + 本次用户消息；流结束时把 assistant 回复追加到 base 后整体提交。
    const userMsg: ChatMessage = { role: 'user', content: text };
    const base = [...messages, userMsg];
    onChangeMessages(base);
    setStreaming(true);
    streamingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    // 本地累加器：实时更新显示，并在结束时提交到消息列表。
    // 不能依赖闭包里的 streamText（它停留在渲染时旧值，导致流式内容无法提交）。
    let committed = '';

    try {
      const cfg = loadConfig();
      if (!cfg?.apiKey || !cfg.model || !cfg.baseUrl) {
        onChangeMessages([...base, { role: 'assistant', content: '⚠️ 请先在「LLM 设置」中配置 Base URL / 模型 / API Key（密钥仅保存在你的浏览器）' }]);
        streamingRef.current = false;
        return;
      }
      // 浏览器端直接流式调用 OpenAI 兼容端点（静态版无后端）。
      const system = buildCanvasContext(currentPageName, nodes, edges);
      await streamLlm(
        cfg,
        [{ role: 'system' as const, content: system }, ...base.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))],
        (delta) => {
          committed += delta;
          setStreamText(committed);
        },
        { signal: controller.signal },
      );
      // 流结束（含中途被 stop）时把累积内容提交为一条 assistant 消息
      if (committed.trim()) {
        onChangeMessages([...base, { role: 'assistant', content: committed.trim() }]);
      }
      setStreamText('');
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        onChangeMessages([...base, { role: 'assistant', content: `⚠️ ${e?.message || '请求失败'}` }]);
      }
    } finally {
      setStreaming(false);
      streamingRef.current = false;
      abortRef.current = null;
    }
  };

  const stop = () => { abortRef.current?.abort(); };

  const handleClear = () => {
    if (confirm('清空当前看板的对话？')) {
      abortRef.current?.abort();
      setStreamText('');
      setInput('');
      onClear();
    }
  };

  // 快捷操作：让 AI 总结整个看板 / 扩写选中的第一个节点
  const quickSummarize = () => {
    if (streaming) return;
    const prompt = `请总结当前看板的内容，按主题归纳节点，指出连接关系，控制在 300 字以内。`;
    send(prompt);
  };
  const quickElaborate = () => {
    if (streaming || nodes.length === 0) return;
    const n = nodes[0];
    setInput(`请对下方节点进行扩写，给出 3 个可落地的展开方向：\n「${toPlainText(n.content)}」`);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="chat-drawer"
          initial={{ x: 380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 380, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed right-6 top-20 bottom-24 w-[90vw] md:w-[380px] max-w-[90vw] z-[60] bg-white/90 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-2xl overflow-hidden flex flex-col dark:bg-gray-900/90 dark:border-white/10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-sm">
                <MessageSquare size={15} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI 助手</h2>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">与当前看板对话 · {currentPageName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors dark:hover:text-red-400 dark:hover:bg-red-500/10"
                  title="清空对话"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10"
                title="关闭"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
            {messages.length === 0 && !streaming && (
              <div className="text-center mt-10 text-sm text-gray-400 dark:text-gray-500 space-y-2">
                <Sparkles size={20} className="mx-auto mb-2 text-emerald-400" />
                <p>你好，我是 AI 助手，理解你当前的看板内容。</p>
                <p className="text-xs">可以让我总结、梳理、扩写，或回答关于看板的问题。</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm shadow-sm ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white rounded-br-md whitespace-pre-wrap break-words'
                      : 'bg-white/60 border border-black/5 text-gray-700 rounded-bl-md dark:bg-white/5 dark:border-white/10 dark:text-gray-200'
                  }`}
                >
                  {m.role === 'user' ? m.content : <Markdown>{m.content}</Markdown>}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm shadow-sm bg-white/60 border border-black/5 text-gray-700 dark:bg-white/5 dark:border-white/10 dark:text-gray-200">
                  <Markdown>{streamText}</Markdown>
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-emerald-500 align-text-bottom animate-pulse" />
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="px-4 pt-2 flex items-center gap-2">
            <button
              onClick={quickSummarize}
              disabled={streaming || nodes.length === 0}
              className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              总结看板
            </button>
            <button
              onClick={quickElaborate}
              disabled={streaming || nodes.length === 0}
              className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              扩写节点
            </button>
          </div>

          {/* Input */}
          <div className="p-4 pt-2">
            <div className="flex items-end gap-2 bg-white/70 border border-black/5 rounded-xl p-2 dark:bg-white/10 dark:border-white/10">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="问点什么…（Enter 发送，Shift+Enter 换行）"
                className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-700 placeholder:text-gray-400 max-h-32 dark:text-gray-200 dark:placeholder:text-gray-500"
              />
              {streaming ? (
                <button onClick={stop} className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/20" title="停止">
                  <Square size={15} />
                </button>
              ) : (
                <button onClick={() => send()} disabled={!input.trim()} className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-blue-500/20" title="发送">
                  {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}