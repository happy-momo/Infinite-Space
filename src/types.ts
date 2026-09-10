// 核心数据模型：节点、连线、页面。节点坐标均为画布世界坐标（未缩放）。
// Core data model: nodes, edges and pages. Node positions are in world (unzoomed) coordinates.
export type NodeType = 'text' | 'image' | 'link';

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
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
}

export interface Page {
  id: string;
  name: string;
}

