// AI 对话侧边栏：与看板对话（SSE 流式输出），可让 AI 总结/扩写/生成新节点。
// AI chat sidebar — talk to your board with SSE streaming; can summarize, elaborate or create nodes.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Send, Loader2, Sparkles, Square, MessageSquare } from 'lucide-react';
import { NodeData, EdgeData, ChatMessage, NodeType } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  nodes: NodeData[];
  edges: EdgeData[];
  currentPageName: string;
  /** AI 生成新节点 */
  onInsertNode: (type: NodeType, content: string) => void;
}

// 纯文本提取（搜索/发送给 AI 用）
const toPlainText = (content: string): string =>
  content
    .replace(/<[^>]*>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function AiChatPanel({ open, onClose, nodes, edges, currentPageName, onInsertNode }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

    const userMsg: ChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setStreaming(true);
    streamingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          context: { pageName: currentPageName, nodes, edges },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${data.error || '请求失败'}` }]);
        return;
      }
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        let idx: number;
        // 解析 SSE 行
        while ((idx = acc.indexOf('\n')) !== -1) {
          const line = acc.slice(0, idx); acc = acc.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.replace(/^data:\s*/, '').trim();
          if (!payload) continue;
          try {
            const o = JSON.parse(payload);
            if (o.error) {
              setStreamText((prev) => prev + `\n⚠️ ${o.error}`);
              streamingRef.current = false;
              break;
            }
            if (o.done) { streamingRef.current = false; break; }
            if (typeof o.delta === 'string') setStreamText((prev) => prev + o.delta);
          } catch { /* skip */ }
        }
        if (!streamingRef.current) break;
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ 请求失败，请检查服务与 LLM 配置' }]);
      }
    }
    if (streamText) {
      setMessages((prev) => [...prev, { role: 'assistant', content: streamText }]);
    }
    setStreaming(false);
    streamingRef.current = false;
    abortRef.current = null;
  };

  const stop = () => { abortRef.current?.abort(); };

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
          className="fixed top-0 right-0 bottom-0 w-[90vw] md:w-[380px] z-[60] bg-white/95 backdrop-blur-2xl border-l border-white/60 shadow-[-8px_0_32px_rgba(0,0,0,0.08)] flex flex-col dark:bg-gray-900/95 dark:border-white/10"
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
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10"
              title="关闭"
            >
              <X size={18} />
            </button>
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
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-md'
                      : 'bg-black/5 text-gray-700 rounded-bl-md dark:bg-white/10 dark:text-gray-200'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm whitespace-pre-wrap break-words bg-black/5 text-gray-700 dark:bg-white/10 dark:text-gray-200">
                  {streamText}
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
            <div className="flex items-end gap-2 bg-black/5 rounded-xl p-2 dark:bg-white/10">
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