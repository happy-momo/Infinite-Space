// 浏览器端 LLM 配置存储:在静态(无后端)版本下,把 Base URL / 模型 / API Key
// 保存在用户本机的 localStorage,key 只存在于浏览器,与本地优先的隐私目标一致。
// Browser-side LLM config — stored in the user's own localStorage (no backend).

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const STORAGE_KEY = 'canvas_llm_config';

export function maskKey(key?: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function loadConfig(): LlmConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || typeof c !== 'object') return null;
    return {
      baseUrl: typeof c.baseUrl === 'string' ? c.baseUrl : '',
      model: typeof c.model === 'string' ? c.model : '',
      apiKey: typeof c.apiKey === 'string' ? c.apiKey : '',
    };
  } catch {
    return null;
  }
}

// 空 apiKey 保留已存值(localStorage 版相当于服务端的“留空保持不变”)。
export function saveConfig(cfg: LlmConfig) {
  const prev = loadConfig();
  const apiKey =
    typeof cfg.apiKey === 'string' && cfg.apiKey.trim() ? cfg.apiKey.trim() : prev?.apiKey || '';
  const next: LlmConfig = {
    baseUrl: cfg.baseUrl.trim(),
    model: cfg.model.trim(),
    apiKey,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

// 回读只对外暴露掩码,与 server/storage.ts 的 publicConfig 语义一致。
export function publicConfig(cfg: LlmConfig | null) {
  if (!cfg) return { baseUrl: '', model: '', apiKeyMask: '', hasKey: false };
  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKeyMask: maskKey(cfg.apiKey),
    hasKey: !!cfg.apiKey,
  };
}