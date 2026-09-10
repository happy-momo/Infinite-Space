// 连线渲染层：在画布世界坐标下用贝塞尔曲线绘制节点之间的连接，可点击选中/多选。
// Edge layer — draws bezier connections between nodes and handles edge selection.
import { NodeData, EdgeData } from '../types';
import { motion } from 'motion/react';

interface Props {
  nodes: NodeData[];
  edges: EdgeData[];
  selectedEdgeIds: Set<string>;
  onSelectEdge: (id: string, multi: boolean) => void;
}

export function EdgeLayer({ nodes, edges, selectedEdgeIds, onSelectEdge }: Props) {
  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible z-0">
      {edges.map(edge => {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        if (!source || !target) return null;
        
        const sx = source.x + (source.width || 300) / 2;
        const sy = source.y + (source.height || (source.type === 'image' ? 300 : 200)) / 2;
        const tx = target.x + (target.width || 300) / 2;
        const ty = target.y + (target.height || (target.type === 'image' ? 300 : 200)) / 2;
        
        // Bezier curve
        const dx = Math.abs(tx - sx) * 0.5;
        const path = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;

        const isSelected = selectedEdgeIds.has(edge.id);

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
              stroke={isSelected ? "#3b82f6" : "rgba(100, 116, 139, 0.4)"}
              strokeWidth={isSelected ? 4 : 3}
              fill="none"
              strokeLinecap="round"
              className="pointer-events-none transition-colors"
            />
          </g>
        );
      })}
    </svg>
  );
}
