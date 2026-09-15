// AI 对话侧边栏：与看板对话（SSE 流式输出），可让 AI 总结/扩写/生成新节点。
// 消息状态由父组件（App）按画布分桶管理；本组件为受控组件，仅负责渲染与流式交互。
// AI chat sidebar — talk to your board with SSE streaming. Messages are owned by the parent
// (per-canvas); this is a controlled component for rendering + streaming only.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Send, Loader2, Sparkles, Square, MessageSquare, Trash2, LayoutTemplate, ChevronUp, ChevronDown } from 'lucide-react';
import { NodeData, EdgeData, ChatMessage, NodeType } from '../types';

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
  /** 把一大段文字描述自动生成为画布上的节点 + 连线；返回回执文本，失败抛错 */
  onGenerateBoard: (description: string) => Promise<string>;
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

// 创作画布意图识别：用户明确想"创建/生成/设计一个画布/看板/思维导图类视觉载体"时，
// 无需大段内容即可触发自动生成（匹配不到时仍走普通对话或底部显式按钮）。
const CREATE_RE = /(创作|生成|制作|设计|绘制|搭建|构建|规划|布置|新开|创建|打造|构思|做一|画|建|做|搭)/;
const BOARD_RE = /(画布|看板|白板|思维导图|脑图|心智图|灵感板|展示板|展示墙|一张图|做.*(画布|看板|白板|思维导图))/;
const isCreateBoardIntent = (text: string): boolean => {
  const t = text.trim();
  if (!t) return false;
  // 明显在问看板是什么/怎么用，不算创作意图
  if (/\b(是什么|怎么用|如何|怎样|能不能(cancel|停止)|什么意思)\b/.test(t)) return false;
  return CREATE_RE.test(t) && BOARD_RE.test(t);
};

export function AiChatPanel({ open, onClose, nodes, edges, currentPageName, messages, onChangeMessages, onClear, onInsertNode, onGenerateBoard }: Props) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expandedInput, setExpandedInput] = useState(false);
  const [focused, setFocused] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 自动增高输入框：折叠状态下随内容长高（上限 ~160px），保留可滚动查看长文本。
  // 扩展模式下由固定高度 + overflow-y-auto 接管，这里不干预。
  useEffect(() => {
    const el = inputRef.current;
    if (!el || expandedInput) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input, expandedInput]);

  // 自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamText]);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || streaming || generating) return;
    setInput('');
    setStreamText('');

    // 创作画布意图：用户说"帮我创作一个画布/看板/思维导图"等语义即可直接触发生成。
    if (isCreateBoardIntent(text)) {
      await runGenerateBoard(text);
      return;
    }

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
      const res = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: base.map((m) => ({ role: m.role, content: m.content })),
          context: { pageName: currentPageName, nodes, edges },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onChangeMessages([...base, { role: 'assistant', content: `⚠️ ${data.error || '请求失败'}` }]);
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
              committed += `\n⚠️ ${o.error}`;
              streamingRef.current = false;
              break;
            }
            if (o.done) { streamingRef.current = false; break; }
            if (typeof o.delta === 'string') {
              committed += o.delta;
              setStreamText(committed);
            }
          } catch { /* skip */ }
        }
        if (!streamingRef.current) break;
      }
      // 流结束（含中途被 stop）时把累积内容提交为一条 assistant 消息
      if (committed.trim()) {
        onChangeMessages([...base, { role: 'assistant', content: committed.trim() }]);
      }
      setStreamText('');
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        onChangeMessages([...base, { role: 'assistant', content: '⚠️ 请求失败，请检查服务与 LLM 配置' }]);
      }
    } finally {
      setStreaming(false);
      streamingRef.current = false;
      abortRef.current = null;
    }
  };

  const stop = () => { abortRef.current?.abort(); };

  // 把文字描述提交给「生成画布」：AI 解构成节点 + 连线落到当前画布，并把回执写进对话。
  // desc 可以是具体内容，也可以是"帮我创作一个画布"这类简短请求（由模型自主构思主题）。
  const runGenerateBoard = async (desc: string) => {
    const userMsg: ChatMessage = { role: 'user', content: desc };
    const base = [...messages, userMsg];
    onChangeMessages(base);
    setGenerating(true);
    setStreamText('');
    try {
      const receipt = await onGenerateBoard(desc);
      onChangeMessages([...base, { role: 'assistant', content: `✅ ${receipt}\n\n已自动排版在当前画布上，可用 Ctrl+Z 撤销。` }]);
    } catch (e: any) {
      onChangeMessages([...base, { role: 'assistant', content: `⚠️ ${e?.message || '生成失败，请检查服务与 LLM 配置'}` }]);
    } finally {
      setGenerating(false);
    }
  };

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

          {/* 输入非空时提示可一键生成画布 */}
          {input.trim() && !streaming && !generating && (
            <div className="px-4 pt-1.5">
              <button
                onClick={() => runGenerateBoard(input.trim())}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white text-xs font-medium shadow-sm transition-opacity hover:opacity-90 active:scale-[0.99]"
              >
                <LayoutTemplate size={14} /> 将以下描述一键生成到画布（节点 + 连线）
              </button>
            </div>
          )}
          {generating && (
            <div className="px-4 pt-1.5">
              <div className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/60 border border-fuchsia-200 text-fuchsia-600 text-xs font-medium dark:bg-white/5 dark:border-fuchsia-500/30 dark:text-fuchsia-300">
                <Loader2 size={14} className="animate-spin" /> 正在解构描述、生成画布…
              </div>
            </div>
          )}

          {/* Input 输入区：自动增高，聚焦高亮；长内容可一键扩展为超大编辑区 */}
          <div className="p-4 pt-2">
            <div
              className={`flex items-end gap-1.5 bg-white/70 border rounded-2xl p-2 transition-colors dark:bg-white/10 ${
                focused
                  ? 'border-indigo-400/70 dark:border-indigo-400/50 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]'
                  : 'border-black/10 dark:border-white/15'
              }`}
            >
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="问我 / 让我创作画布…（Enter 发送，Shift+Enter 换行）"
                className={`flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed text-gray-700 placeholder:text-gray-400 px-1 py-0.5 dark:text-gray-200 dark:placeholder:text-gray-500 ${
                  expandedInput ? 'h-56 overflow-y-auto custom-scrollbar' : 'max-h-[160px] overflow-y-auto custom-scrollbar'
                }`}
              />
              <div className="flex flex-col items-center gap-1 shrink-0 self-end">
                <button
                  onClick={() => setExpandedInput((v) => !v)}
                  disabled={streaming || generating}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:text-gray-400 disabled:hover:bg-transparent dark:hover:text-indigo-300 dark:hover:bg-indigo-500/10"
                  title={expandedInput ? '收起输入框' : '扩展输入框，便于编辑长内容'}
                >
                  {expandedInput ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </button>
                {streaming ? (
                  <button onClick={stop} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/20" title="停止">
                    <Square size={15} />
                  </button>
                ) : (
                  <button onClick={() => send()} disabled={!input.trim()} className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-blue-500/20" title="发送">
                    {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                )}
              </div>
            </div>
            {/* 字数统计 + 扩展提示：帮助用户感知/管理长输入 */}
            <div className="mt-1.5 flex items-center justify-end gap-3 px-1 text-[10px] text-gray-400 dark:text-gray-500">
              {expandedInput ? (
                <button onClick={() => setExpandedInput(false)} className="inline-flex items-center gap-0.5 hover:text-indigo-500 dark:hover:text-indigo-300">
                  <ChevronDown size={12} /> 收起
                </button>
              ) : (
                input.trim().length > 80 && (
                  <button onClick={() => setExpandedInput(true)} className="inline-flex items-center gap-0.5 hover:text-indigo-500 dark:hover:text-indigo-300">
                    <ChevronUp size={12} /> 内容较多，点击扩展编辑
                  </button>
                )
              )}
              <span className="tabular-nums">{input.length} 字</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}