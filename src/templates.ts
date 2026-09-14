// 内置模板库：新建画布时可一键导入的常见场景模板。
// Built-in templates — common scenarios selectable when creating a new canvas.
import { NodeData, EdgeData } from './types';

export interface Template {
  id: string;
  name: string;
  description: string;
  /** 模板内节点（相对坐标，导入时做偏移） */
  nodes: NodeData[];
  edges: EdgeData[];
}

/** 空画布 */
const blank: Template = {
  id: 'blank',
  name: '空白画布',
  description: '从一个完全空白的画布开始，自由发挥。',
  nodes: [],
  edges: [],
};

const reading: Template = {
  id: 'reading',
  name: '读书笔记',
  description: '记录书名、核心观点、摘录与疑问，形成读书笔记卡片。',
  nodes: [
    { id: 't1', type: 'text', x: 0, y: 0, content: '<p><b>《书名》</b></p><p>作者 · 阅读日期</p>', color: 'rgba(238,242,255,0.95)', width: 260, zIndex: 1 },
    { id: 't2', type: 'text', x: 340, y: 0, content: '<p><b>核心观点</b></p><br><p>一句话总结本书核心思想。</p>', color: 'rgba(240,253,244,0.95)', width: 280, zIndex: 1 },
    { id: 't3', type: 'text', x: 700, y: 20, content: '<p><b>金句摘录</b></p><br><p>「引用的关键句子」</p>', color: 'rgba(255,251,235,0.95)', width: 260, zIndex: 1 },
    { id: 't4', type: 'text', x: 340, y: 260, content: '<p><b>我的思考</b></p><br><p>这本书给我的启发与反思。</p>', color: 'rgba(255,255,255,0.95)', width: 280, zIndex: 1 },
    { id: 't5', type: 'text', x: 700, y: 280, content: '<p><b>待办</b></p><br><p>☐ 重读某章<br>☐ 写一篇书评</p>', color: 'rgba(255,241,242,0.95)', width: 260, zIndex: 1 },
  ],
  edges: [
    { id: 'e1', source: 't1', target: 't2' },
    { id: 'e2', source: 't2', target: 't3' },
  ],
};

const brainstorm: Template = {
  id: 'brainstorm',
  name: '头脑风暴',
  description: '围绕一个主题发散想法，再分组归类。',
  nodes: [
    { id: 'b1', type: 'text', x: 300, y: 180, content: '<p><b style="font-size:15px">中心主题</b></p>', color: 'rgba(238,242,255,0.95)', width: 220, zIndex: 1 },
    { id: 'b2', type: 'text', x: 60, y: 60, content: '<p>想法 A</p>', color: 'rgba(255,241,242,0.95)', width: 200, zIndex: 1 },
    { id: 'b3', type: 'text', x: 60, y: 320, content: '<p>想法 B</p>', color: 'rgba(240,253,244,0.95)', width: 200, zIndex: 1 },
    { id: 'b4', type: 'text', x: 560, y: 80, content: '<p>想法 C</p>', color: 'rgba(255,251,235,0.95)', width: 200, zIndex: 1 },
    { id: 'b5', type: 'text', x: 560, y: 340, content: '<p>想法 D</p>', color: 'rgba(240,249,255,0.95)', width: 200, zIndex: 1 },
  ],
  edges: [
    { id: 'e1', source: 'b2', target: 'b1' },
    { id: 'e2', source: 'b3', target: 'b1' },
    { id: 'e3', source: 'b4', target: 'b1' },
    { id: 'e4', source: 'b5', target: 'b1' },
  ],
};

const project: Template = {
  id: 'project',
  name: '项目规划',
  description: '愿景 → 目标 → 任务拆解 → 风险，把项目铺成一张图。',
  nodes: [
    { id: 'p1', type: 'text', x: 260, y: 0, content: '<p><b>项目愿景</b></p>', color: 'rgba(238,242,255,0.95)', width: 240, zIndex: 1 },
    { id: 'p2', type: 'text', x: 0, y: 200, content: '<p><b>目标 1</b></p><br><p>- 里程碑<br>- 负责人</p>', color: 'rgba(240,253,244,0.95)', width: 260, zIndex: 1 },
    { id: 'p3', type: 'text', x: 340, y: 200, content: '<p><b>目标 2</b></p><br><p>- 里程碑<br>- 负责人</p>', color: 'rgba(240,253,244,0.95)', width: 260, zIndex: 1 },
    { id: 'p4', type: 'text', x: 680, y: 200, content: '<p><b>风险</b></p><br><p>- 潜在阻碍<br>- 应对策略</p>', color: 'rgba(255,241,242,0.95)', width: 260, zIndex: 1 },
    { id: 'p5', type: 'text', x: 340, y: 480, content: '<p><b>下一步</b></p><br><p>☐ …</p>', color: 'rgba(255,251,235,0.95)', width: 260, zIndex: 1 },
  ],
  edges: [
    { id: 'e1', source: 'p1', target: 'p2' },
    { id: 'e2', source: 'p1', target: 'p3' },
    { id: 'e3', source: 'p1', target: 'p4' },
    { id: 'e4', source: 'p2', target: 'p5' },
    { id: 'e5', source: 'p3', target: 'p5' },
  ],
};

const people: Template = {
  id: 'people',
  name: '人物关系图',
  description: '用节点表示人物，用连线表示关系，梳理人际网络。',
  nodes: [
    { id: 'm1', type: 'text', x: 320, y: 140, content: '<p><b>主角</b></p>', color: 'rgba(238,242,255,0.95)', width: 180, zIndex: 1 },
    { id: 'm2', type: 'text', x: 40, y: 40, content: '<p>人物 A<br><span style="color:#64748b">关系：</span></p>', color: 'rgba(240,249,255,0.95)', width: 180, zIndex: 1 },
    { id: 'm3', type: 'text', x: 40, y: 300, content: '<p>人物 B</p>', color: 'rgba(240,253,244,0.95)', width: 180, zIndex: 1 },
    { id: 'm4', type: 'text', x: 620, y: 60, content: '<p>人物 C</p>', color: 'rgba(255,251,235,0.95)', width: 180, zIndex: 1 },
    { id: 'm5', type: 'text', x: 620, y: 320, content: '<p>人物 D</p>', color: 'rgba(255,241,242,0.95)', width: 180, zIndex: 1 },
  ],
  edges: [
    { id: 'e1', source: 'm1', target: 'm2', label: '好友' },
    { id: 'e2', source: 'm1', target: 'm3', label: '同事' },
    { id: 'e3', source: 'm1', target: 'm4', label: '导师' },
    { id: 'e4', source: 'm1', target: 'm5', label: '家人' },
  ],
};

// 模板的第三个节点用 markdown 展示，让用户一进来就看到新节点类型的能力
const knowledge: Template = {
  id: 'knowledge',
  name: '知识卡片',
  description: '结构化记录一个知识主题：概念、示例、关联与延伸阅读。',
  nodes: [
    { id: 'k1', type: 'markdown', x: 0, y: 0, content: '# 知识主题\n\n一句话界定这个主题。\n\n- 概念要点\n- 关键原则', width: 320, zIndex: 1 },
    { id: 'k2', type: 'text', x: 380, y: 0, content: '<p><b>示例</b></p><br><p>贴一个具体例子或代码片段。</p>', color: 'rgba(240,249,255,0.95)', width: 300, zIndex: 1 },
    { id: 'k3', type: 'text', x: 380, y: 260, content: '<p><b>关联</b></p><br><p>相关的其他主题 / 卡片。</p>', color: 'rgba(240,253,244,0.95)', width: 300, zIndex: 1 },
    { id: 'k4', type: 'text', x: 0, y: 300, content: '<p><b>延伸阅读</b></p><br><p>- 来源 1<br>- 来源 2</p>', color: 'rgba(255,251,235,0.95)', width: 320, zIndex: 1 },
  ],
  edges: [
    { id: 'e1', source: 'k1', target: 'k2' },
    { id: 'e2', source: 'k1', target: 'k4' },
  ],
};

export const TEMPLATES: Template[] = [blank, reading, brainstorm, project, people, knowledge];