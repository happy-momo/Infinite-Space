// 连线渲染层：在画布世界坐标下用贝塞尔曲线绘制节点之间的连接。
// 连线起点/终点附着在节点的「边框」上（而非中心），让线条与箭头始终清晰可见。
// 支持箭头（directed）、连线标签文字、选中高亮，以及"从节点边缘拖出"的预览线。
// Edge layer — bezier connections in world coords. Endpoints attach to the node PERIMETER
// (not center) so lines and arrowheads stay visible above the node boxes.
import { memo, useMemo } from 'react';
import { NodeData, EdgeData } from '../types';

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

const center = (n: NodeData) => {
  const { w, h } = getNodeSize(n);
  return { x: n.x + w / 2, y: n.y + h / 2 };
};

// 从矩形中心沿单位方向 (dx,dy) 射到其边框交点，再沿同向「向外」推 margin px。
// 这样线条在节点框外收尾，箭头能清楚落在目标节点边缘上。
const rectBorder = (cx: number, cy: number, halfW: number, halfH: number, dx: number, dy: number, margin: number) => {
  const tX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const tY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  return { x: cx + dx * t + dx * margin, y: cy + dy * t + dy * margin };
};

export const EdgeLayer = memo(function EdgeLayer({ nodes, edges, selectedEdgeIds, onSelectEdge, dragEdge }: Props) {
  // 索引 O(N)→O(1) 查找端点；每条边的路径/标签几何只在「nodes/edges」变化时重算，
  // 选中态变化（仅改 stroke 颜色）不触发几何重算。
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const geometry = useMemo(
    () =>
      edges
        .map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          const s = center(source);
          const t = center(target);
          const sw = getNodeSize(source);
          const tw = getNodeSize(target);
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const sp = rectBorder(s.x, s.y, sw.w / 2, sw.h / 2, ux, uy, 2);
          const tp = rectBorder(t.x, t.y, tw.w / 2, tw.h / 2, -ux, -uy, 2);
          return {
            edge,
            len,
            path: `M ${sp.x} ${sp.y} L ${tp.x} ${tp.y}`,
            mx: (sp.x + tp.x) / 2,
            my: (sp.y + tp.y) / 2,
          };
        })
        .filter((g): g is { edge: EdgeData; len: number; path: string; mx: number; my: number } => Boolean(g)),
    [edges, byId],
  );

  const preview = dragEdge ? (() => {
    const src = nodes.find((n) => n.id === dragEdge.sourceId);
    if (!src) return null;
    const s = center(src);
    const { w, h } = getNodeSize(src);
    const dx = dragEdge.curX - s.x, dy = dragEdge.curY - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const sp = rectBorder(s.x, s.y, w / 2, h / 2, dx / len, dy / len, 2);
    return { sx: sp.x, sy: sp.y, tx: dragEdge.curX, ty: dragEdge.curY };
  })() : null;

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible z-0" style={{ width: '100vw', height: '100vh' }}>
      <defs>
        {/* 箭头：orient="auto" 自动沿路径末端方向 */}
        <marker id="arrowhead_gl" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L9,5 L0,10 Z" fill="rgba(100,116,139,0.6)" />
        </marker>
        <marker id="arrowhead_sel" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L9,5 L0,10 Z" fill="#3b82f6" />
        </marker>
      </defs>

      {geometry.map(({ edge, len, path, mx, my }) => {
        const isSelected = selectedEdgeIds.has(edge.id);
        const directed = edge.directed !== false; // 缺省视为有箭头
        const stroke = isSelected ? '#3b82f6' : 'rgba(100, 116, 139, 0.5)';

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
            {/* 连线标签（自适应宽度，超长省略，悬停显示全文） */}
            {edge.label && (
              ((len: number) => {
                const w = Math.min(168, Math.max(44, len * 7 + 24));
                return (
                  <g className="pointer-events-none">
                    <rect
                      x={mx - w / 2} y={my - 14}
                      width={w} height={28} rx={7}
                      fill="rgba(255,255,255,0.92)"
                      stroke={isSelected ? '#3b82f6' : 'rgba(100,116,139,0.3)'}
                    />
                    <text
                      x={mx} y={my + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fill={isSelected ? '#2563eb' : '#475569'}
                      className="select-none"
                    >
                      <title>{edge.label}</title>
                      {len * 7 > 168 ? `${edge.label.slice(0, 20)}…` : edge.label}
                    </text>
                  </g>
                );
              })(edge.label.length)
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
});