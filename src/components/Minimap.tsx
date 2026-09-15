// 右下角小地图：概览整个画布范围，点击/拖拽即可快速定位视口。
// Minimap — overview of the whole canvas; click or drag to teleport the viewport.
import { motion, MotionValue } from "motion/react";
import { NodeData } from "../types";
import { memo, useEffect, useMemo, useRef, useState } from "react";

interface Props {
  nodes: NodeData[];
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
}

export const Minimap = memo(function Minimap({ nodes, x, y, scale }: Props) {
  const [viewState, setViewState] = useState({ x: x.get(), y: y.get(), s: scale.get() });
  const pendingRef = useRef({ x: x.get(), y: y.get(), s: scale.get() });
  // 节点点阵也用 RAF 合帧：拖拽时 setNodes 每秒数十次，这里合到 ≤60fps 再重绘点阵。
  const [minimapNodes, setMinimapNodes] = useState(nodes);
  useEffect(() => {
    let raf = 0;
    raf = requestAnimationFrame(() => setMinimapNodes(nodes));
    return () => cancelAnimationFrame(raf);
  }, [nodes]);

  // 性能：把高频的 pan/zoom change 事件合帧到下一帧再更新，避免以 60fps 触发 React 渲染。
  useEffect(() => {
    const pending = pendingRef.current;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const { x: px, y: py, s: ps } = pending;
        setViewState({ x: px, y: py, s: ps });
      });
    };
    const unsubX = x.on("change", (v) => { pending.x = v; schedule(); });
    const unsubY = y.on("change", (v) => { pending.y = v; schedule(); });
    const unsubS = scale.on("change", (v) => { pending.s = v; schedule(); });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsubX(); unsubY(); unsubS();
    };
  }, [x, y, scale]);

  // Map limits（含点阵与视口），只在点阵或视口变化时重算。
  const layout = useMemo(() => {
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    for (const n of minimapNodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + (n.width || 300) > maxX) maxX = n.x + (n.width || 300);
      if (n.y + 300 > maxY) maxY = n.y + 300;
    }
    // Include current viewport in calculation
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth / viewState.s : 1000;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight / viewState.s : 1000;
    const vx = -viewState.x / viewState.s;
    const vy = -viewState.y / viewState.s;
    if (vx < minX) minX = vx;
    if (vy < minY) minY = vy;
    if (vx + viewportWidth > maxX) maxX = vx + viewportWidth;
    if (vy + viewportHeight > maxY) maxY = vy + viewportHeight;
    // Add padding
    minX -= 500; minY -= 500; maxX += 500; maxY += 500;
    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;
    const minimapScale = 150 / Math.max(totalWidth, totalHeight);
    return { minX, minY, minimapScale, viewportWidth, viewportHeight, vx, vy };
  }, [minimapNodes, viewState]);

  const { minX, minY, minimapScale, viewportWidth, viewportHeight, vx, vy } = layout;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    
    const containerRect = e.currentTarget.getBoundingClientRect();
    const updateViewport = (clientX: number, clientY: number) => {
      const cx = clientX - containerRect.left;
      const cy = clientY - containerRect.top;
      
      const mapX = (cx / minimapScale) + minX;
      const mapY = (cy / minimapScale) + minY;
      
      const newCanvasX = window.innerWidth / 2 - mapX * viewState.s;
      const newCanvasY = window.innerHeight / 2 - mapY * viewState.s;
      
      x.set(newCanvasX);
      y.set(newCanvasY);
    };

    updateViewport(e.clientX, e.clientY);

    const onMove = (moveEv: PointerEvent) => updateViewport(moveEv.clientX, moveEv.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove as EventListener);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove as EventListener);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div 
      className="fixed bottom-8 right-8 w-[150px] h-[150px] bg-white/80 backdrop-blur-md border border-black/10 rounded-2xl shadow-lg overflow-hidden z-50 cursor-pointer dark:bg-gray-900/80 dark:border-white/10"
      onPointerDown={handlePointerDown}
    >
      <div
        className="absolute"
        style={{
          transform: `translate(${-minX * minimapScale}px, ${-minY * minimapScale}px)`
        }}
      >
        {minimapNodes.map(n => (
          <div
            key={n.id}
            className="absolute bg-indigo-500/50 rounded-sm border border-indigo-600/50"
            style={{
              left: n.x * minimapScale,
              top: n.y * minimapScale,
              width: (n.width || 300) * minimapScale,
              height: 150 * minimapScale,
            }}
          />
        ))}
        {/* Viewport Box */}
        <div
          className="absolute border-2 border-red-500 bg-red-500/10"
          style={{
            left: vx * minimapScale,
            top: vy * minimapScale,
            width: viewportWidth * minimapScale,
            height: viewportHeight * minimapScale,
          }}
        />
      </div>
    </div>
  );
});
