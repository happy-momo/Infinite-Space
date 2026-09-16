// 核心数据模型：节点、连线、页面、对话消息。节点坐标均为画布世界坐标（未缩放）。
// Core data model: nodes, edges, pages and chat messages. Node positions are in world (unzoomed) coordinates.

// 节点类型：
//   text     富文本节点（内容为 HTML）
//   image    图片节点（内容为 base64 或 URL）
//   link     链接卡片节点（内容为 LinkItem[] 的 JSON）
//   markdown Markdown 节点（内容为 Markdown 原文）
//   table    表格节点（内容为空，数据存于 tableData）
//   chart    图表节点（数据存于 chartConfig，由 AI 从表格生成）
export type NodeType = 'text' | 'image' | 'link' | 'markdown' | 'table' | 'chart';

export interface NodeData {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  content: string;
  url?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  color?: string;
  width?: number;
  height?: number;
  zIndex?: number;
  /** 标签（P1 标签系统，嵌入节点） */
  tags?: string[];
  /** 表格节点数据（P2） */
  tableData?: TableCell[][];
  /** 图表节点配置（P2） */
  chartConfig?: ChartConfig;
}

/** 表格单元格 */
export interface TableCell {
  text: string;
  align?: 'left' | 'center' | 'right';
  isHeader?: boolean;
}

/** 图表类型：bar 柱状 / line 折线 / pie 饼图；auto 表示待 AI 决定 */
export type ChartType = 'bar' | 'line' | 'pie' | 'auto';

/** 图表节点配置 */
export interface ChartConfig {
  /** 实际渲染类型（bar/line/pie），'auto' 在生成前使用 */
  chartType: ChartType;
  /** 来源表格节点 id（记录数据来源，可跳转） */
  sourceTableId?: string;
  /** 来源表格节点名称 */
  sourceTableName?: string;
  /** 图表标题 */
  title?: string;
  /** X 轴字段名（表头） */
  xAxis?: string;
  /** Y 轴字段名 */
  yAxis?: string;
  /** 系列字段（多系列时） */
  series?: string[];
  /** 主数值列单位（% / 万元 / 元 / 件…），供轴与数值标注 */
  unit?: string;
  /** AI 数据洞察一句结论（基于真实数据） */
  insight?: string;
  /** 自定义配色（可选，缺省用内置色板） */
  colors?: string[];
  /** 图表数据快照（来源表格的清洗后数据） */
  data: ChartDataPoint[];
}

/** 图表数据点 */
export interface ChartDataPoint {
  label: string;
  value: number;
  series?: string;
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  /** 连线标签文字 */
  label?: string;
  /** 是否带箭头，缺省视为 true */
  directed?: boolean;
}

// ---- 页面层级（两层嵌套：folder → canvas）----
export type PageType = 'folder' | 'canvas';

export interface Page {
  id: string;
  name: string;
  /** 'folder' 或 'canvas'，缺省 'canvas'（向后兼容） */
  type?: PageType;
  /** 父文件夹 id，顶层缺省 */
  parentId?: string;
}

// ---- AI 对话消息 ----
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}