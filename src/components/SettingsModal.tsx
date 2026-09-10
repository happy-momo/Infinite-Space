// LLM 设置弹窗：配置 OpenAI 兼容的 Base URL / 模型 / API Key，
// 支持常用服务商预设、连接测试。静态版(无后端)下配置存 localStorage，
// 密钥只保存在用户本机浏览器，前端仅显示掩码。
// LLM settings modal — configures an OpenAI-compatible endpoint. In the static
// (no-backend) build the config is stored in the user's own localStorage.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Loader2, CheckCircle2, XCircle, Plug, ChevronDown } from 'lucide-react';
import { loadConfig, saveConfig, publicConfig } from '../lib/config';
import { testConnection as testLlm } from '../lib/llm';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface TestResult {
  ok: boolean;
  msg: string;
}

const PRESETS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat' },
  { label: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5' },
];

export function SettingsModal({ open, onClose }: Props) {
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMask, setApiKeyMask] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setApiKey('');
    setResult(null);
    setPresetOpen(false);
    const cfg = publicConfig(loadConfig());
    setBaseUrl(cfg.baseUrl || '');
    setModel(cfg.model || '');
    setApiKeyMask(cfg.apiKeyMask || '');
    setHasKey(!!cfg.hasKey);
  }, [open]);

  // Escape to close, matching the canvas rename convention.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape can cancel the IME composition — don't close the modal then.
      if (e.isComposing) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Close the preset dropdown when clicking elsewhere.
  useEffect(() => {
    if (!presetOpen) return;
    const onDown = (e: PointerEvent) => {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setPresetOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [presetOpen]);

  const applyPreset = (label: string) => {
    const p = PRESETS.find((x) => x.label === label);
    if (p) {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const stored = loadConfig() || { baseUrl: '', model: '', apiKey: '' };
      const cfg = {
        baseUrl: baseUrl.trim() || stored.baseUrl,
        model: model.trim() || stored.model,
        apiKey: apiKey.trim() || stored.apiKey,
      };
      if (!cfg.baseUrl) { setResult({ ok: false, msg: '请填写 Base URL' }); setTesting(false); return; }
      if (!cfg.model) { setResult({ ok: false, msg: '请填写模型名称' }); setTesting(false); return; }
      if (!cfg.apiKey) { setResult({ ok: false, msg: '请填写 API Key 后再测试' }); setTesting(false); return; }
      const reply = await testLlm(cfg);
      setResult({ ok: true, msg: `连接成功：${String(reply).slice(0, 200)}` });
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message || '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    setSaving(true);
    setResult(null);
    try {
      saveConfig({
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
      });
      const pub = publicConfig(loadConfig());
      setApiKeyMask(pub.apiKeyMask || '');
      setHasKey(!!pub.hasKey);
      setApiKey('');
      setResult({ ok: true, msg: '设置已保存（保存在本机浏览器）' });
    } catch {
      setResult({ ok: false, msg: '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full px-3.5 py-2.5 rounded-xl bg-white border border-black/10 text-sm text-gray-700 outline-none transition-shadow placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:bg-gray-800 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500';

  const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const currentPresetLabel =
    PRESETS.find((p) => p.baseUrl === baseUrl && p.model === model)?.label || '';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] bg-black/20 dark:bg-black/50 flex items-center justify-center p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          // Don't let wheel events reach the canvas zoom handler underneath.
          onWheel={(e) => e.stopPropagation()}
        >
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{
              opacity: { duration: 0.16 },
              scale: { type: 'spring', stiffness: 380, damping: 28 },
              y: { type: 'spring', stiffness: 380, damping: 28 },
            }}
            className="w-full max-w-md bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-2xl flex flex-col overflow-hidden dark:bg-gray-900/85 dark:border-white/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shadow-sm">
                  <Plug size={15} />
                </span>
                <div className="leading-tight">
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">LLM 设置</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">配置 AI Organize 使用的模型</p>
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

            {/* Body */}
            <div className="flex flex-col gap-4 px-5 py-4 max-h-[min(62vh,560px)] overflow-y-auto custom-scrollbar">
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>服务商预设（自动填充）</label>
                {/* Custom dropdown, matching the node font picker pattern. */}
                <div className="relative" ref={presetRef}>
                  <button
                    type="button"
                    onClick={() => setPresetOpen((o) => !o)}
                    className={`${inputCls} flex items-center justify-between cursor-pointer text-left ${
                      currentPresetLabel ? 'text-gray-700' : 'text-gray-400'
                    }`}
                  >
                    <span className="truncate">{currentPresetLabel || '选择预设…'}</span>
                    <ChevronDown
                      size={15}
                      className={`shrink-0 ml-2 text-gray-400 transition-transform ${
                        presetOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {presetOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full mt-2 left-0 right-0 bg-white shadow-xl border border-black/10 rounded-xl py-1.5 flex flex-col z-50 overflow-hidden"
                    >
                      {PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            applyPreset(p.label);
                            setPresetOpen(false);
                          }}
                          className={`px-4 py-2 text-left text-sm font-medium transition-colors ${
                            p.label === currentPresetLabel
                              ? 'text-blue-600 bg-blue-50'
                              : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Base URL（OpenAI 兼容）</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className={inputCls}
                  spellCheck={false}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>模型名称</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini / deepseek-chat / ..."
                  className={inputCls}
                  spellCheck={false}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasKey ? `已配置（${apiKeyMask}），留空保持不变` : 'sk-...'}
                  className={inputCls}
                />
              </div>

              {result && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 border ${
                    result.ok
                      ? 'bg-green-50 border-green-500/20 text-green-700 dark:bg-green-500/15 dark:border-green-500/30 dark:text-green-300'
                      : 'bg-red-50 border-red-500/20 text-red-600 dark:bg-red-500/15 dark:border-red-500/30 dark:text-red-300'
                  }`}
                >
                  {result.ok ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={15} className="mt-0.5 shrink-0" />
                  )}
                  <span className="break-all">{result.msg}</span>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-5 pb-4 pt-3 border-t border-black/5 dark:border-white/10">
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-200"
              >
                {testing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Plug size={15} className="text-blue-500" />
                )}
                {testing ? '测试中…' : '测试连接'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-black/5 transition-colors dark:text-gray-400 dark:hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  保存
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
