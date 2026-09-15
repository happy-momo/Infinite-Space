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
  tableData?: { text?: string; isHeader?: boolean }[][];
  chartConfig?: {
    chartType?: string;
    title?: string;
    data?: { label: string; value: number; series?: string }[];
  };
}

export interface Position {
  id: string;
  x: number;
  y: number;
}

const MAX_NODES = 60;
const MAX_CONTENT = 500;

function serializeContent(n: NodeInput): string {
  if (n.type === 'image') {
    return typeof n.content === 'string' && n.content.startsWith('http')
      ? `[image url] ${n.content.slice(0, 120)}`
      : '[image]';
  }
  // 表格节点：把 tableData 转成 `|` 分隔的文本行，供 LLM 理解表格内容
  if (n.type === 'table' && Array.isArray(n.tableData)) {
    const rows = n.tableData
      .slice(0, 20)
      .map((row) => row.slice(0, 10).map((c) => String(c?.text ?? '')).join(' | '));
    const suffix = n.tableData.length > 20 ? `\n...(共 ${n.tableData.length} 行)` : '';
    return `[table]\n${rows.join('\n')}${suffix}`.slice(0, MAX_CONTENT * 2);
  }
  // 图表节点：输出标题 + 数据摘要
  if (n.type === 'chart' && n.chartConfig) {
    const cfg = n.chartConfig;
    const points = (cfg.data || [])
      .slice(0, 20)
      .map((d) => `${d.label}: ${d.value}`)
      .join(', ');
    return `[chart ${cfg.chartType || ''}] ${cfg.title || ''} | ${points}`.slice(0, MAX_CONTENT);
  }
  return (n.content || '').slice(0, MAX_CONTENT);
}

function serializeNodes(nodes: NodeInput[]) {
  const shown = nodes.slice(0, MAX_NODES);
  return {
    list: shown.map((n) => ({
      id: n.id,
      type: n.type,
      content: serializeContent(n),
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
  /** 该分组包含的节点 id，供客户端按组打标签 */
  nodeIds: string[];
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

    anchors.push({ name: g.name, x, y, nodeIds: ids });
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
  opts: { instruction?: string; style?: string; mode?: 'board' | 'subset'; subsetLabel?: string } = {},
): Promise<string> {
  const { list, truncated } = serializeNodes(nodes);

  // 子集总结：与看板故事线不同的简短提示词，聚焦"这组筛选出的节点"的共同主题与信息。
  if (opts.mode === 'subset') {
    const label = opts.subsetLabel?.trim() || '筛选';
    const nodeLines = list.map((n) => `- ${n.id}(${n.type}) ${n.content}`).join('\n');
    const system =
      'You are a faithful canvas summarizer. NEVER invent facts. Only use the provided node contents. Reply in the user\'s language, concise plain text, no markdown, no emoji, no list markers.';
    const user = `
这是无限画布中经过标签筛选得到的「${label}」子集，属于同一主题的节点。请用简洁中文总结：
1. 这个子集共同的「主题 / 话题」是什么：一句话。
2. 子集内各节点的关键信息：逐条简短列出。
3. 这些节点合在一起能得出什么结论或整体印象。

要求：
- 只描述下面给出的节点内容，严禁编造节点中不存在的信息。
- 每个节点内容只属于它自己，不要混淆或张冠李戴。
- 开头务必注明「以下是「${label}」子集的总结：」，表明这是子集总结。
- 中文纯文本，不用 Markdown / emoji，总字数不超过 400 字。
${opts.instruction ? `\n额外要求：${opts.instruction}` : ''}

子集节点：
${nodeLines}
${truncated ? `\n(注：节点过多，以上仅为前 ${list.length} 个。)` : ''}
`;
    return sanitizeText(await callLlm(cfg, system, user));
  }

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

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 流式调用 LLM（SSE + stream:true），把增量文本逐个交给 onDelta 回调。
// 返回值为完成；错误统一抛 LlmError。供服务端 /api/llm/chat 使用。
export async function streamLlm(
  cfg: LlmConfig,
  messages: ChatTurn[],
  onDelta: (delta: string) => void,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<void> {
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
        stream: true,
        messages,
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    let msg = `LLM 服务返回 HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg = `${msg}: ${body.error.message}`;
    } catch { /* ignore non-json body */ }
    throw new LlmError(msg, res.status);
  }

  if (!res.body) throw new LlmError('LLM 响应缺少流式 body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.replace(/^data:\s*/, '').trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) onDelta(delta);
      } catch { /* skip malformed lines */ }
    }
  }
}

export interface ChartResult {
  chartType: 'bar' | 'line' | 'pie';
  title: string;
  xAxis: string;
  yAxis: string;
  data: { label: string; value: number }[];
  reason: string;
}

// AI 分析表格数据，决定图表类型并清洗出数值数据。
// 只允许返回 bar/line/pie 三种类型；数值由模型从表格中提取。
export async function analyzeChart(
  cfg: LlmConfig,
  rows: string[][],
  instruction?: string,
): Promise<ChartResult> {
  if (!rows.length) throw new LlmError('表格为空，无法生成图表');
  const tableText = rows.slice(0, 50).map((r) => r.join(' | ')).join('\n');

  const system =
    '你是一个数据可视化助手。只返回 JSON，不要多余文字，不要 markdown。';
  const user = `
下面是用户表格数据（第一行通常是表头）：
${tableText}
${instruction ? `\n用户的额外要求：${instruction}` : ''}

请分析这些数据，并决定用哪种图表展示最合适（bar=柱状图 / line=折线图 / pie=饼图）。
要求：
1. chartType 只能取 "bar"、"line"、"pie" 三者之一。
2. title 用简短中文标题（不超过 20 字）。
3. 选择一个合适的"类别"列作为 label（如名称、月份、类型），选择一个"数值"列作为 value（必须是数字；若是百分比、货币、千分位等，请先转换为纯数字，例如 85.5% → 85.5，¥1,200 → 1200）。
4. data 数组：每个条目 {label, value}，label 取类别值，value 取对应数值。不要遗漏数据行。
5. reason 用一句话说明为什么选这种图表（不超过 40 字）。

只返回 JSON，格式：
{"chartType":"bar","title":"标题","xAxis":"列名","yAxis":"列名","data":[{"label":"...","value":123}],"reason":"..."}
`;

  const text = await callLlm(cfg, system, user);
  const parsed = extractJson(text) as any;

  if (!parsed || typeof parsed !== 'object') throw new LlmError('图表分析返回格式非法');
  const ct = parsed.chartType;
  if (ct !== 'bar' && ct !== 'line' && ct !== 'pie') throw new LlmError(`不支持的图表类型: ${ct}`);

  const data: { label: string; value: number }[] = Array.isArray(parsed.data)
    ? parsed.data
        .filter((d: any) => d && typeof d.label === 'string' && typeof d.value === 'number' && isFinite(d.value))
        .map((d: any) => ({ label: d.label, value: d.value }))
    : [];

  if (data.length === 0) throw new LlmError('未能从表格中提取到有效的数值数据');

  return {
    chartType: ct,
    title: typeof parsed.title === 'string' ? parsed.title : '数据图表',
    xAxis: typeof parsed.xAxis === 'string' ? parsed.xAxis : '',
    yAxis: typeof parsed.yAxis === 'string' ? parsed.yAxis : '',
    data,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

export interface AssociateSuggestion {
  nodeId: string;
  reason: string;
  confidence: number; // 0-1，由 LLM 给出的相关度评分
}

// AI 自动联想：给定源节点 id 和全部节点，找出语义上最相关的 N 个节点。
export async function associateNodes(
  cfg: LlmConfig,
  allNodes: NodeInput[],
  sourceId: string,
  limit: number = 5,
): Promise<{ suggestions: AssociateSuggestion[] }> {
  const source = allNodes.find((n) => n.id === sourceId);
  if (!source) return { suggestions: [] };
  const others = allNodes.filter((n) => n.id !== sourceId).slice(0, 100);
  if (others.length === 0) return { suggestions: [] };

  const listText = others
    .map((n) => `- ${n.id}(${n.type}) ${(n.content || '').slice(0, 300).replace(/\s+/g, ' ')}`)
    .join('\n');

  const system = '你是一个语义联想助手。只返回 JSON，不要多余文字。';
  const user = `
源节点（id=${source.id}，类型：${source.type}）的内容：
"${(source.content || '').slice(0, 500).replace(/\s+/g, ' ')}"

候选节点列表：
${listText}

请从上面的候选节点中找出与源节点语义上最相关的 ${Math.min(limit, others.length)} 个，按相关性从高到低排序。
每个建议给出：nodeId（候选节点 id）、reason（一句话说明为什么相关，不超过 40 字）、confidence（0-1 之间的相关性评分）。

只返回 JSON，格式：
{"suggestions":[{"nodeId":"...","reason":"...","confidence":0.85}]}
`;

  const text = await callLlm(cfg, system, user);
  const parsed = extractJson(text);
  const raw = Array.isArray((parsed as any)?.suggestions) ? (parsed as any).suggestions : [];

  const suggestions: AssociateSuggestion[] = raw
    .filter((s: any) => s && typeof s.nodeId === 'string' && others.some((o) => o.id === s.nodeId))
    .slice(0, limit)
    .map((s: any) => ({
      nodeId: s.nodeId,
      reason: typeof s.reason === 'string' ? s.reason : '',
      confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0.5,
    }));

  return { suggestions };
}

export interface GeneratedNode {
  type: 'text' | 'markdown';
  title?: string;
  content: string;
}
export interface GeneratedEdge {
  from: number; // 索引进 nodes
  to: number;
  label?: string;
}
export interface GeneratedBoard {
  title?: string;
  nodes: GeneratedNode[];
  edges: GeneratedEdge[];
}

// AI 根据用户给的文字描述，自动拆解成一组概念节点 + 它们之间的关系连线，
// 客户端负责把这两个结果落到无限画布上（排版由客户端控制）。
// 描述可以是一大段具体内容，也可以是"帮我创作一个画布"这类简短的创作请求——
// 后者由模型发挥创意、自主构思主题（可选参考当前看板的已有主题）。
export async function generateBoard(
  cfg: LlmConfig,
  description: string,
  maxNodes: number = 30,
  context?: { pageName?: string; titles?: string[] },
): Promise<GeneratedBoard> {
  const desc = String(description || '').trim();
  if (!desc) throw new LlmError('描述不能为空');

  const system = 'You are a canvas content designer. Return ONLY a valid JSON object. No markdown, no explanation.';
  const user = `
你是「无限画布」的内容解构器。用户会输入一段文字/想法描述，请把它拆解成一组概念节点，并标注节点之间的关系连线，供自动排版到无限画布上。

拆解规则：
1. 从描述中提取 ${maxNodes} 个以内（最少 3 个）关键概念、条目、观点或事实，每个成为一个节点。信息量大就多拆，量小就少拆。
2. 每个节点给一个短标题（title，不超过 12 字）和一段要点式内容（content，要点化、保留关键细节，不超过 120 字；普通要点/一句话用 text，需要列表/代码/小组件结构时用 markdown）。
3. type 只允许 "text" 或 "markdown"。
4. 用节点数组的索引表达关系（from/to，从 0 开始）：包含、因果、步骤、递进、举例、对比、相关等。为每条连线给一个简短关系标签（label，不超过 10 字），如「包含」「因果」「步骤」「举例」「对比」。不要产生自身环，避免重复连线。
5. 若存在一个核心主题，请在顶层给出 title（看板主题，不超过 20 字）。

【重要】当用户的描述只是一句"帮我创作/设计/生成一个画布或看板"这类创建请求、而没有具体内容时：
- 请发挥创意，自主构思一个有意义、可落地的看板主题，再按上面规则为这个自创主题拆出节点和连线；不要返回空，也不要报错。
- 优先从当前看板已有主题延伸（见下方"当前看板参考"，若能基于其中某个主题创作会更贴合）；否则自创新主题。
- 这属于创作场景，允许合理构思；但若描述里含有需要忠实转述的具体文字内容，则仍须忠于原文、不要编造。

当前看板参考（可选，创作无明确主题时可借鉴）：
页面「${context?.pageName || '未命名'}」；已有节点标题：${(context?.titles || []).slice(0, 15).join('、') || '（无）'}

用户的描述/请求：
${desc.slice(0, 12000)}

只返回 JSON，不要任何多余文字，格式：
{"title":"主题","nodes":[{"type":"text","title":"短标题","content":"要点内容"}],"edges":[{"from":0,"to":1,"label":"关系"}]}
`;

  let text = await callLlm(cfg, system, user);
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    text = await callLlm(cfg, system, `${user}\n\n你上一次的输出不是合法 JSON。请只输出上述 JSON 格式，不要任何多余内容。`);
    parsed = extractJson(text);
  }

  const raw = parsed as any;
  const title = typeof raw?.title === 'string' ? raw.title.replace(/["“”‘’《》]/g, '').trim().slice(0, 40) : '';

  const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const nodes: GeneratedNode[] = [];
  for (const n of rawNodes) {
    if (!n || typeof n !== 'object') continue;
    const content = typeof n.content === 'string' ? n.content.trim() : '';
    if (!content) continue;
    const type = n.type === 'markdown' ? 'markdown' : 'text';
    nodes.push({
      type,
      content: content.slice(0, 400),
      title: typeof n.title === 'string' ? n.title.trim().slice(0, 30) : undefined,
    });
    if (nodes.length >= maxNodes) break;
  }
  if (nodes.length === 0) {
    throw new LlmError('模型未能从描述中解构出有效节点，请换一种描述方式再试');
  }

  // 关系连线：索引必须在合法范围内、非自环、去重。
  const seen = new Set<string>();
  const edges: GeneratedEdge[] = [];
  const rawEdges = Array.isArray(raw?.edges) ? raw.edges : [];
  for (const e of rawEdges) {
    if (!e || typeof e !== 'object') continue;
    // 接受数字或字符串索引（部分模型把数字序列化成字符串）
    let from = Number(e.from ?? NaN);
    let to = Number(e.to ?? NaN);
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    if (from < 0 || to < 0 || from >= nodes.length || to >= nodes.length || from === to) continue;
    const key = `${from}:${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      from,
      to,
      label: typeof e.label === 'string' ? e.label.trim().slice(0, 10) : undefined,
    });
    if (edges.length >= 200) break;
  }

  return { title, nodes, edges };
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

export interface EdgeRelation {
  edgeId: string;
  label: string;
}

// 去除 HTML 标签与多余空白，得到便于 LLM 阅读的纯文本。
function toPlainText(s: string, max: number): string {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// AI 关系标注：为每一条连线读出两端节点内容，生成简短中文关系说明。
// 只标注两端都在 nodes 内的边；未成功标注的边会被跳过。
export async function llmProposeEdgeRelations(
  cfg: LlmConfig,
  nodes: NodeInput[],
  edges: EdgeInput[],
): Promise<{ relations: EdgeRelation[] }> {
  if (!Array.isArray(edges) || edges.length === 0) return { relations: [] };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const valid = edges
    .filter((e) => e && typeof e.id === 'string' && byId.has(e.source) && byId.has(e.target))
    .slice(0, 100);
  if (valid.length === 0) return { relations: [] };

  const describe = (n: NodeInput) => {
    const t = n.type || 'text';
    if (t === 'image') return '[图片]';
    return `[${t}] ${toPlainText(serializeContent(n), 120)}`;
  };

  const listText = valid
    .map((e) => {
      const s = byId.get(e.source)!;
      const t = byId.get(e.target)!;
      return `- ${e.id}: ${describe(s)} → ${describe(t)}`;
    })
    .join('\n');

  const system = '你是一个关系标注助手。只返回 JSON，不要多余文字。';
  const user = `
看板中有以下连线，每条都是「源节点 → 目标节点」。请为每条连线生成一个简短的中文关系说明（2-20 字），
说明源节点与目标节点之间的关系，例如：「原因」「属于」「引用于」「包含」「支持」「反对」「前置条件」等。
关系说明要与两端节点的内容相关。

连线列表：
${listText}

只返回 JSON，格式：
{"relations":[{"edgeId":"<连线的 id>","label":"<关系说明>"}]}
必须为上面列出的每条连线都返回一项，edgeId 必须与列表中的 id 完全一致。
`;

  const text = await callLlm(cfg, system, user);
  const parsed = extractJson(text);
  const raw = Array.isArray((parsed as any)?.relations) ? (parsed as any).relations : [];
  const allowed = new Set(valid.map((e) => e.id));

  const relations: EdgeRelation[] = raw
    .filter(
      (r: any) =>
        r && typeof r.edgeId === 'string' && allowed.has(r.edgeId) && typeof r.label === 'string',
    )
    .map((r: any) => ({
      edgeId: r.edgeId,
      label: r.label.trim().slice(0, 40),
    }))
    .filter((r: EdgeRelation) => r.label.length > 0);

  return { relations };
}
