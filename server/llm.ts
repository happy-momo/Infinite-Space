// 服务端 LLM 封装：调用任意 OpenAI 兼容的 /chat/completions 接口，
// 提供 AI 分组整理（organizeNodes）、看板总结/故事线（summarizeBoard）与连接测试。
// Server-side LLM wrapper — talks to any OpenAI-compatible endpoint.
import { LlmConfig } from './storage';

const DEFAULT_TIMEOUT = 60_000;

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function normalizeUrl(base: string): string {
  let url = base.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    throw new LlmError('Base URL 必须以 http(s):// 开头');
  }
  if (!/\/chat\/completions$/i.test(url)) {
    url = `${url}/chat/completions`;
  }
  return url;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new LlmError(`请求超时（超过 ${Math.round(timeoutMs / 1000)}s）`);
    }
    throw new LlmError(`网络请求失败: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function callLlm(
  cfg: LlmConfig,
  system: string,
  user: string,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<string> {
  if (!cfg?.apiKey) throw new LlmError('未配置 API Key');
  if (!cfg?.model) throw new LlmError('未配置模型名称');
  const url = normalizeUrl(cfg.baseUrl);

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    },
    timeoutMs,
  );

  let raw = '';
  try {
    raw = await res.text();
  } catch {
    // keep empty
  }

  if (!res.ok) {
    let msg = `LLM 服务返回 HTTP ${res.status}`;
    try {
      const body = JSON.parse(raw);
      if (body?.error?.message) msg = `${msg}: ${body.error.message}`;
      else if (body?.message) msg = `${msg}: ${body.message}`;
    } catch {
      // non-json error body
    }
    throw new LlmError(msg, res.status);
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new LlmError('LLM 返回了无法解析的内容');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (content == null) {
    throw new LlmError('LLM 响应缺少 choices[0].message.content');
  }
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('');
  }
  return String(content);
}

export function extractJson(text: string): unknown {
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = Math.min(
    t.indexOf('[') === -1 ? Infinity : t.indexOf('['),
    t.indexOf('{') === -1 ? Infinity : t.indexOf('{'),
  );
  if (start === Infinity) throw new LlmError('模型返回内容中没有找到 JSON');
  t = t.slice(start);
  try {
    return JSON.parse(t);
  } catch (e: any) {
    throw new LlmError(`模型返回的不是合法 JSON: ${e?.message || e}`);
  }
}

export interface NodeInput {
  id: string;
  type: string;
  content?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface Position {
  id: string;
  x: number;
  y: number;
}

const MAX_NODES = 60;
const MAX_CONTENT = 500;

function serializeNodes(nodes: NodeInput[]) {
  const shown = nodes.slice(0, MAX_NODES);
  return {
    list: shown.map((n) => ({
      id: n.id,
      type: n.type,
      content:
        n.type === 'image'
          ? typeof n.content === 'string' && n.content.startsWith('http')
            ? `[image url] ${n.content.slice(0, 120)}`
            : '[image]'
          : (n.content || '').slice(0, MAX_CONTENT),
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    })),
    truncated: nodes.length > MAX_NODES,
  };
}

export interface Group {
  name: string;
  nodeIds: string[];
}

// Fallback grouping from connected components of the edge graph, so the button
// always produces a sensible layout even if the LLM grouping is invalid.
function componentGroups(nodes: NodeInput[], edges: EdgeInput[], byId: Map<string, NodeInput>): Group[] {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  (edges || []).forEach((e) => {
    if (!byId.has(e.source) || !byId.has(e.target)) return;
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  });
  const visited = new Set<string>();
  const groups: Group[] = [];
  nodes.forEach((n) => {
    if (visited.has(n.id)) return;
    const comp: string[] = [];
    const stack = [n.id];
    visited.add(n.id);
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      for (const nb of adj.get(id) || []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    groups.push({ name: `组 ${groups.length + 1}`, nodeIds: comp });
  });
  return groups;
}

// Normalize the LLM's {"groups":[...]} response: drop unknown/duplicate ids and
// put every unassigned node into its own group so all nodes get placed.
function normalizeGroups(parsed: unknown, all: NodeInput[]): Group[] | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = (parsed as { groups?: unknown }).groups;
  if (!Array.isArray(raw)) return null;
  const used = new Set<string>();
  const groups: Group[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object' || !Array.isArray((g as any).nodeIds)) continue;
    const ids = ((g as any).nodeIds as unknown[]).filter(
      (id): id is string => typeof id === 'string' && !used.has(id),
    );
    if (!ids.length) continue;
    ids.forEach((id) => used.add(id));
    groups.push({ name: typeof (g as any).name === 'string' ? (g as any).name : '组', nodeIds: ids });
  }
  const leftover = all.filter((n) => !used.has(n.id));
  leftover.forEach((n) => groups.push({ name: '其他', nodeIds: [n.id] }));
  return groups.length ? groups : null;
}

// Enforce that edge-connected nodes always stay in one group: union any two
// groups that share an edge, so connected components are never split (the LLM
// still decides how to group unconnected-but-related nodes).
function mergeByEdges(groups: Group[], edges: EdgeInput[]): Group[] {
  if (!groups.length) return groups;
  const idxOf = new Map<string, number>();
  groups.forEach((g, gi) => g.nodeIds.forEach((id) => idxOf.set(id, gi)));
  const parent = groups.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  (edges || []).forEach((e) => {
    const a = idxOf.get(e.source);
    const b = idxOf.get(e.target);
    if (a != null && b != null) union(a, b);
  });
  const merged = new Map<number, Group>();
  groups.forEach((g, gi) => {
    const root = find(gi);
    const existing = merged.get(root);
    if (existing) existing.nodeIds.push(...g.nodeIds);
    else merged.set(root, { ...g, nodeIds: [...g.nodeIds] });
  });
  return [...merged.values()];
}

export interface GroupAnchor {
  name: string;
  x: number;
  y: number;
}

// Deterministic tidy layout: each group is a grid sized to its largest node (so
// nothing overlaps), groups flow left→right and wrap to a new row band, giving
// clear structure instead of a pile. Also returns each group's anchor so the
// client can place a label node above it.
function layoutGroups(
  groups: Group[],
  byId: Map<string, NodeInput>,
): { positions: Position[]; groups: GroupAnchor[] } {
  const CELL_PAD_X = 40;
  const CELL_PAD_Y = 40;
  const GROUP_GAP_X = 420;
  const GROUP_GAP_Y = 380;
  const MAX_GROUP_COLS = 4;
  const MAX_ROW_WIDTH = 2600;

  const out = new Map<string, Position>();
  const anchors: GroupAnchor[] = [];
  let x = 0;
  let y = 0;
  let bandH = 0;

  for (const g of groups) {
    const ids = g.nodeIds.filter((id) => byId.has(id));
    if (!ids.length) continue;
    let maxW = 0;
    let maxH = 0;
    ids.forEach((id) => {
      const n = byId.get(id)!;
      maxW = Math.max(maxW, n.width || (n.type === 'image' ? 400 : 300));
      maxH = Math.max(maxH, n.height || (n.type === 'image' ? 300 : 200));
    });
    const cellW = maxW + CELL_PAD_X;
    const cellH = maxH + CELL_PAD_Y;
    const cols = Math.min(MAX_GROUP_COLS, Math.max(1, Math.ceil(Math.sqrt(ids.length))));
    const rows = Math.ceil(ids.length / cols);
    const gw = cols * cellW;

    if (x > 0 && x + gw > MAX_ROW_WIDTH) {
      x = 0;
      y += bandH + GROUP_GAP_Y;
      bandH = 0;
    }

    anchors.push({ name: g.name, x, y });
    ids.forEach((id, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      out.set(id, { id, x: x + c * cellW, y: y + r * cellH });
    });

    bandH = Math.max(bandH, rows * cellH);
    x += gw + GROUP_GAP_X;
  }

  return { positions: Array.from(out.values()), groups: anchors };
}

export async function organizeNodes(
  nodes: NodeInput[],
  edges: EdgeInput[],
  cfg: LlmConfig,
): Promise<{ positions: Position[]; groups: GroupAnchor[] }> {
  const { list, truncated } = serializeNodes(nodes);
  const byId = new Map<string, NodeInput>(list.map((n) => [n.id, n]));
  const edgeLines = (edges || [])
    .slice(0, 200)
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => `- ${e.source} → ${e.target}`)
    .join('\n');

  const system =
    'You are a spatial grouping AI. Return ONLY a valid JSON object. No markdown, no explanation.';
  const user = `
你是一个看板分组 AI。我会给你节点(id,type,content)和它们之间的连接关系，请把它们分成若干语义分组，供后续自动排版。

分组规则：
1. 有连接关系（直接或间接相连）的节点归入同一组。
2. 无连接但语义相关、属于同一主题的节点可以归入同一组。
3. 每个节点必须且只能出现一次，禁止重复或遗漏。
4. 组之间语义差异要大，不要把互不相关的节点硬凑成一组。
5. 组按阅读顺序排列：核心/总主题组在前，延伸或次要组在后。
6. 每组给一个简短中文标签（不超过 6 个字）。

只返回一个 JSON 对象，格式：
{"groups":[{"name":"核心","nodeIds":["id1","id2"]},{"name":"背景","nodeIds":["id3"]}]}

节点数据：
${list.map((n) => `- ${n.id}(${n.type}) ${n.content}`).join('\n')}
${truncated ? `\n(注：节点过多，以上仅为前 ${list.length} 个。未列出的节点忽略即可。)` : ''}

连接关系：
${edgeLines || '（无连接）'}
`;

  let parsed: unknown;
  let text = await callLlm(cfg, system, user);
  try {
    parsed = extractJson(text);
  } catch {
    // One retry with a stricter instruction when the model emits non-JSON.
    text = await callLlm(cfg, system, `${user}\n\n你上一次的输出不是合法 JSON。请只输出上述 {"groups":[...]} 格式的 JSON，不要任何多余内容。`);
    parsed = extractJson(text);
  }

  const grouped =
    normalizeGroups(parsed, list) ?? componentGroups(list, edges || [], byId);
  const groups = mergeByEdges(grouped, edges || []);
  return layoutGroups(groups, byId);
}

export interface EdgeInput {
  id?: string;
  source: string;
  target: string;
}

// Strip control characters and emoji from LLM text so canvas nodes render cleanly.
function sanitizeText(text: string): string {
  // Code-point filtering (no regex escapes) so the source stays clean.
  return text
    .split('')
    .filter((ch) => {
      const c = ch.codePointAt(0) as number;
      const isControl =
        c <= 0x08 || c === 0x0b || c === 0x0c || (c >= 0x0e && c <= 0x1f) || c === 0x7f;
      const isEmoji =
        (c >= 0x1f000 && c <= 0x1faff) ||
        (c >= 0x2600 && c <= 0x27bf) ||
        c === 0xfe0f ||
        c === 0x200d ||
        (c >= 0x1f1e6 && c <= 0x1f1ff);
      return !isControl && !isEmoji;
    })
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
export async function summarizeBoard(
  nodes: NodeInput[],
  edges: EdgeInput[],
  cfg: LlmConfig,
  opts: { instruction?: string; style?: string } = {},
): Promise<string> {
  const { list, truncated } = serializeNodes(nodes);

  // Bind real edges to both endpoints' content so the model can only reference
  // relationships that actually exist, and mark every isolated node explicitly.
  const byId = new Map(list.map((n) => [n.id, n]));
  const realEdges = (edges || []).filter((e) => byId.has(e.source) && byId.has(e.target));
  const edgeLines = realEdges
    .slice(0, 200)
    .map((e) => {
      const s = byId.get(e.source)!;
      const t = byId.get(e.target)!;
      return `- ${e.source}(${JSON.stringify(s.content)}) → ${e.target}(${JSON.stringify(t.content)})`;
    })
    .join('\n');

  const connectedIds = new Set<string>();
  realEdges.forEach((e) => {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  });
  const isolated = list.filter((n) => !connectedIds.has(n.id));
  const isolatedLines = isolated.length
    ? isolated.map((n) => `- ${n.id}(${JSON.stringify(n.content)})`).join('\n')
    : '（无）';

  const system =
    "You are a strict, faithful canvas summarizer. NEVER invent facts, relationships, people, or events — only use the provided node contents and the explicit connection list. Every '我' in a node belongs to that node alone; different nodes are different entities even if they all say '我'. Never merge entities or attribute one node's content to another node. Reply in the user's language, plain text only (no markdown, no emoji, no list markers).";

  const user = `
你是一个无限画布看板的分析师。你的第一原则是【绝对忠实于数据】：只使用下面明确给出的节点内容与连接关系，严禁编造任何内容、关系、人物或事件。

节点数据（每个节点的内容都只属于它自己；即使多个节点都用“我”，它们也是不同的实体，禁止合并）：
${list.map((n) => `- ${n.id}(${JSON.stringify(n.content)})`).join('\n')}
${truncated ? `\n(注：节点过多，以上仅为前 ${list.length} 个。)` : ''}

唯一真实存在的连接（除以下之外不存在任何关系）：
${edgeLines || '（没有任何连接）'}

与其他节点没有任何连接的孤立节点：
${isolatedLines}
${opts.style ? `\n改写要求：请以「${opts.style}」的风格重写第 5 部分故事线，仍须严格忠实于上述节点内容与连接，不得虚构。` : ''}
${opts.instruction ? `\n用户的额外要求：${opts.instruction}（在保持真实的前提下尽量满足，但严禁虚构数据中不存在的关系或事实）。` : ''}

请严格按以下结构输出（用纯文本，不要 Markdown 标记，不要 emoji）：
1. 看板主题：一句话概括。
2. 各节点内容：逐个节点独立描述，只描述该节点自身的内容，绝不把某节点的内容说成是另一个节点的。
3. 真实连接关系：只复述上面给出的连接，逐一说明相连两个节点各自的内容；禁止添加任何连接之外的关系。
4. 未连接节点：列出上面的孤立节点，说明它们与看板其他节点无直接连接。
5. 故事线：在【不虚构任何关系与事实】的前提下串联。只把有真实连接的内容自然串起来；不同实体、无连接的节点之间禁止编造关系（如“同事”“同学”“好友”），必须分开段落分别叙述。宁可分段，也不要虚构。不要把只属于某个节点的内容（如“毕业于北京大学”）安到别的节点上。总字数控制在 800 字以内。
`;
  return sanitizeText(await callLlm(cfg, system, user));
}

export async function testConnection(cfg: LlmConfig): Promise<string> {
  const reply = await callLlm(
    cfg,
    'You are a connectivity test. Reply with the single word OK and nothing else.',
    'ping',
    30_000,
  );
  return reply;
}
