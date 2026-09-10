// 服务端持久化：把画布状态与 LLM 配置以 JSON 形式落在 data/ 目录。
// 所有文件读写均带原子替换（tmp + rename），配置与密钥以 0600 权限落盘。
// Server-side persistence — saves canvas state and LLM config as JSON under data/.
import fs from 'fs';
import path from 'path';

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ViewportState {
  vx: number;
  vy: number;
  vs: number;
}

export interface AppState {
  pages: { id: string; name: string }[];
  currentPageId: string;
  nodes: Record<string, unknown[]>;
  edges: Record<string, unknown[]>;
  viewports: Record<string, ViewportState>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CONFIG_FILE = path.join(DATA_DIR, 'llm-config.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(DATA_DIR, 0o700);
  } catch {
    // best effort
  }
}

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, data: unknown) {
  ensureDir();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    // best effort
  }
  fs.renameSync(tmp, file);
}

export function loadState(): AppState | null {
  const s = readJson<AppState>(STATE_FILE);
  return s && typeof s === 'object' ? s : null;
}

export function saveState(state: AppState) {
  writeJson(STATE_FILE, state);
}

export function loadLlmConfig(): LlmConfig | null {
  const c = readJson<LlmConfig>(CONFIG_FILE);
  if (!c || typeof c !== 'object') return null;
  return {
    baseUrl: typeof c.baseUrl === 'string' ? c.baseUrl : '',
    model: typeof c.model === 'string' ? c.model : '',
    apiKey: typeof c.apiKey === 'string' ? c.apiKey : '',
  };
}

export function saveLlmConfig(cfg: LlmConfig) {
  writeJson(CONFIG_FILE, cfg);
}

export function maskKey(key?: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function publicConfig(cfg: LlmConfig | null) {
  if (!cfg) return { baseUrl: '', model: '', apiKeyMask: '', hasKey: false };
  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKeyMask: maskKey(cfg.apiKey),
    hasKey: !!cfg.apiKey,
  };
}
