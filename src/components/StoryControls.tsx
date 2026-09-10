// 故事线控制条：AI 故事生成结果节点上方浮现，可选择风格、追加要求并重新生成。
// Story control bar — floats above the AI-generated storyline node for style/instruction regeneration.
import { useState } from 'react';
import { X, RefreshCw, Loader2, Wand2 } from 'lucide-react';

const STYLES = ['详细', '简洁', '讲故事', '正式', 'English'];

interface Props {
  busy: boolean;
  onRegenerate: (opts: { style?: string; instruction?: string }) => void;
  onClose: () => void;
}

export function StoryControls({ busy, onRegenerate, onClose }: Props) {
  const [style, setStyle] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const submit = () =>
    onRegenerate({
      style: style || undefined,
      instruction: instruction.trim() || undefined,
    });

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-2xl dark:bg-gray-900/85 dark:border-white/10">
      <Wand2 size={15} className="text-emerald-500 shrink-0" />
      <div className="flex items-center gap-1">
        {STYLES.map((s) => (
          <button
            key={s}
            onClick={() => setStyle(style === s ? null : s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              style === s
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300'
                : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="w-px h-5 bg-gray-200 dark:bg-white/10" />
      <input
        type="text"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          // Enter confirms the IME candidate; don't submit mid-composition.
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') submit();
        }}
        placeholder="追加要求，如：突出 lilei…"
        className="w-48 bg-white/70 rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-emerald-400 placeholder:text-gray-400 dark:bg-gray-800/80 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500"
      />
      <button
        onClick={submit}
        disabled={busy || (!style && !instruction.trim())}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        重新生成
      </button>
      <button
        onClick={onClose}
        className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10"
        title="关闭"
      >
        <X size={14} />
      </button>
    </div>
  );
}
