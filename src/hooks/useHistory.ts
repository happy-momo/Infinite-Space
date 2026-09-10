// 撤销/重做历史栈（hook 形式）。配合 useRef 存储快照，避免在拖拽等高频操作时触发重渲染。
// Undo/redo history stack exposed as a hook.
import { useCallback, useRef, useState } from 'react';
import type { NodeData, EdgeData } from '../types';

export interface Snapshot {
  nodes: NodeData[];
  edges: EdgeData[];
}

const MAX_HISTORY = 100;

/**
 * Undo/redo stack for the canvas. The App keeps the hook's "current" ref in sync
 * with committed state (via an effect), then calls `snapshot()` at discrete
 * operation boundaries (drag start, delete, add, connect, edit-start, ...) so
 * mousemove churn never floods the stack.
 */
export function useHistory() {
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const currentRef = useRef<Snapshot>({ nodes: [], edges: [] });
  const [, force] = useState(0);

  const setCurrent = useCallback((s: Snapshot) => {
    currentRef.current = s;
  }, []);

  const snapshot = useCallback(() => {
    pastRef.current.push(currentRef.current);
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    force((v) => v + 1);
  }, []);

  const undo = useCallback((): Snapshot | null => {
    const prev = pastRef.current.pop();
    if (!prev) return null;
    futureRef.current.push(currentRef.current);
    currentRef.current = prev;
    force((v) => v + 1);
    return prev;
  }, []);

  const redo = useCallback((): Snapshot | null => {
    const next = futureRef.current.pop();
    if (!next) return null;
    pastRef.current.push(currentRef.current);
    currentRef.current = next;
    force((v) => v + 1);
    return next;
  }, []);

  return {
    setCurrent,
    snapshot,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
