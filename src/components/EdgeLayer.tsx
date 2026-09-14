// 连线渲染层：在画布世界坐标下用贝塞尔曲线绘制节点之间的连接。
// 支持箭头（directed）、连线标签文字、选中高亮，以及"从节点边缘拖出"的预览线。
// Edge layer — draws bezier connections between nodes, with arrows, labels and drag-preview support.
import { NodeData, EdgeData } from '../types';
import { motion } from 'motion/react';

interface Props {
  nodes: NodeData[];
  edges: EdgeData[];
  selectedEdgeIds: Set<string>;
  onSelectEdge: (id: string, multi: boolean) => void;
  /** 拖拽连线预览：起点 = 源节点 id，终点 = 鼠标世界坐标 */
  dragEdge?: { sourceId: string; curX: number; curY: number } | null;
}

const NODE_W = 300;
const NODE_H = 200;
const IMG_H = 300;

const getNodeSize = (n: NodeData) => ({
  w: n.width || (n.type === 'table' || n.type === 'chart' ? 480 : n.type === 'markdown' ? 420 : NODE_W),
  h: n.height || (n.type === 'image' || n.type === 'table' ? (n.type === 'image' ? IMG_H : 360) : n.type === 'markdown' ? 320 : NODE_H),
});

export function EdgeLayer({ nodes, edges, selectedEdgeIds, onSelectEdge, dragEdge }: Props) {
  const center = (n: NodeData) => {
    const { w, h } = getNodeSize(n);
    return { x: n.x + w / 2, y: n.y + h / 2 };
  };

  const preview = dragEdge ? (() => {
    const src = nodes.find((n) => n.id === dragEdge.sourceId);
    if (!src) return null;
    const s = center(src);
    return { sx: s.x, sy: s.y, tx: dragEdge.curX, ty: dragEdge.curY };
  })() : null;

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible z-0" style={{ width: '100vw', height: '100vh' }}>
      <defs>
        {/* 箭头：orient="auto" 自动沿路径末端方向 */}
        <marker id="arrowhead_gl" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L8,4.5 L0,9 Z" fill="rgba(100,116,139,0.5)" />
        </marker>
        <marker id="arrowhead_sel" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L8,4.5 L0,9 Z" fill="#3b82f6" />
        </marker>
      </defs>

      {edges.map(edge => {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        if (!source || !target) return null;

        const s = center(source);
        const t = center(target);

        // Bezier curve
        const dx = Math.abs(t.x - s.x) * 0.5;
        const path = `M ${s.x} ${s.y} C ${s.x + dx} ${s.y}, ${t.x - dx} ${t.y}, ${t.x} ${t.y}`;

        const isSelected = selectedEdgeIds.has(edge.id);
        const directed = edge.directed !== false; // 缺省视为有箭头
        const stroke = isSelected ? '#3b82f6' : 'rgba(100, 116, 139, 0.4)';

        // 曲线中点（两端点连线中点，因二次贝塞尔控制点对称）
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;

        return (
          <g key={edge.id} className="pointer-events-auto">
            {/* Invisible wider path for easier clicking */}
            <path
              d={path}
              stroke="transparent"
              strokeWidth={20}
              fill="none"
              className="cursor-pointer"
              onPointerDown={(e: React.PointerEvent) => {
                e.stopPropagation();
                onSelectEdge(edge.id, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
            />
            {/* Visible path */}
            <path
              d={path}
              stroke={stroke}
              strokeWidth={isSelected ? 4 : 3}
              fill="none"
              strokeLinecap="round"
              markerEnd={directed ? `url(#${isSelected ? 'arrowhead_sel' : 'arrowhead_gl'})` : undefined}
              className="pointer-events-none transition-colors"
            />
            {/* 连线标签 */}
            {edge.label && (
              <g className="pointer-events-none">
                <rect
                  x={mx - 22} y={my - 14}
                  width={44} height={28} rx={7}
                  fill="rgba(255,255,255,0.92)"
                  stroke={isSelected ? '#3b82f6' : 'rgba(100,116,139,0.3)'}
                />
                <text
                  x={mx} y={my + 2}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isSelected ? '#2563eb' : '#475569'}
                  className="select-none"
                >
                  {edge.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 拖拽连线预览 */}
      {preview && (
        <g className="pointer-events-none">
          <path
            d={`M ${preview.sx} ${preview.sy} C ${preview.sx} ${preview.sy}, ${preview.tx} ${preview.ty}, ${preview.tx} ${preview.ty}`}
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="6 4"
            fill="none"
          />
        </g>
      )}
    </svg>
  );
}