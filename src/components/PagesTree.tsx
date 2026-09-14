// 左侧页面树：文件夹 → 画布 两层嵌套结构，支持新建、重命名、删除、拖拽移入文件夹。
// Left pages tree — folder → canvas two-level hierarchy with create, rename, delete and drag-to-folder.
import React, { useState } from 'react';
import { Folder, FolderOpen, FolderPlus, Trash2, ChevronDown, ChevronRight, Layout, GripVertical } from 'lucide-react';
import { Page } from '../types';

interface Props {
  pages: Page[];
  currentPageId: string;
  isOpen: boolean;
  onToggle: () => void;
  expanded: Set<string>;
  onToggleExpand: (folderId: string) => void;
  onSwitch: (id: string) => void;
  onAddPage: (parentId?: string) => void;
  onAddFolder: (parentId?: string) => void;
  onMovePage: (pageId: string, targetFolderId: string | null) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

// 顶层画布唯一 parentId 标记（用于把画布拖回顶层）
const TOP_PARENT = '__top__';

export function PagesTree(
  { pages, currentPageId, isOpen, onToggle, expanded, onToggleExpand, onSwitch, onAddPage, onAddFolder, onMovePage, onDelete }: Props
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const folders = pages.filter((p) => p.type === 'folder');
  const topLevel = pages.filter((p) => p.type !== 'folder' && !p.parentId);
  const childrenOf = (folderId: string) => pages.filter((p) => p.type !== 'folder' && p.parentId === folderId);

  const handleDrop = (targetFolderId: string) => {
    if (draggingId && draggingId !== targetFolderId) {
      onMovePage(draggingId, targetFolderId === TOP_PARENT ? null : targetFolderId);
    }
    setDraggingId(null);
    setDragOver(null);
  };

  const rowCls = (active: boolean, isOver: boolean) =>
    `group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left w-full ${
      isOver ? 'bg-indigo-100 dark:bg-indigo-500/25'
      : active ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-300'
      : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10'
    }`;

  const iconBtnCls = 'p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-white/10';

  const pageRow = (p: Page, depth: number) => (
    <div
      key={p.id}
      draggable
      onDragStart={() => setDraggingId(p.id)}
      onDragEnd={() => { setDraggingId(null); setDragOver(null); }}
      onDragOver={() => setDragOver(TOP_PARENT)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(TOP_PARENT); }}
      className="relative"
      style={{ paddingLeft: depth * 16 }}
    >
      <button onClick={() => onSwitch(p.id)} className={rowCls(p.id === currentPageId, dragOver === TOP_PARENT && draggingId === p.id)} title={p.name}>
        <GripVertical size={12} className="text-gray-300 shrink-0 cursor-grab" />
        <Layout size={14} className="text-gray-400 shrink-0" />
        <span className="truncate flex-1">{p.name}</span>
        {p.id !== currentPageId && (
          <button onClick={(e) => onDelete(e, p.id)} className={iconBtnCls} title="删除画布">
            <Trash2 size={13} />
          </button>
        )}
      </button>
    </div>
  );

  const folderRow = (folder: Page, depth: number) => {
    const isExpanded = expanded.has(folder.id);
    const isOver = dragOver === folder.id;
    return (
      <div key={folder.id}>
        <div
          className="relative"
          style={{ paddingLeft: depth * 16 }}
          draggable
          onDragStart={() => setDraggingId(folder.id)}
          onDragEnd={() => { setDraggingId(null); setDragOver(null); }}
          onDragOver={() => setDragOver(folder.id)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(folder.id); }}
        >
          <button
            onClick={() => onToggleExpand(folder.id)}
            className={rowCls(false, isOver)}
          >
            {isExpanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
            {isExpanded ? <FolderOpen size={14} className="text-amber-500 shrink-0" /> : <Folder size={14} className="text-amber-500 shrink-0" />}
            <span className="truncate flex-1">{folder.name}</span>
            <span onClick={(e) => e.stopPropagation()} className="flex items-center shrink-0">
              <button onClick={() => onAddPage(folder.id)} className={`${iconBtnCls} hover:text-blue-500 hover:bg-blue-50`} title="在文件夹内新建画布">
                <Layout size={13} />
              </button>
              <button onClick={(e) => onDelete(e, folder.id)} className={iconBtnCls} title="删除文件夹">
                <Trash2 size={13} />
              </button>
            </span>
          </button>
        </div>
        {isExpanded && (
          <div className="border-l border-black/5 ml-4 dark:border-white/10">
            {childrenOf(folder.id).map((c) => pageRow(c, 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed bottom-8 left-8 z-50 flex flex-col items-start gap-2 w-52">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 mb-0.5 px-3 py-2 bg-white/80 backdrop-blur-md rounded-xl text-gray-700 font-medium text-xs uppercase tracking-wider shadow-sm border border-black/5 hover:bg-white transition-colors dark:bg-gray-900/80 dark:border-white/10 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Layout size={14} /> Canvases {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
      </button>

      {isOpen && (
        <>
          <div className="max-h-[300px] w-full overflow-y-auto overflow-x-hidden rounded-xl custom-scrollbar">
            {folders.map((f) => folderRow(f, 0))}
            {topLevel.map((p) => pageRow(p, 0))}
            {folders.length === 0 && topLevel.length === 0 && (
              <div className="text-xs text-gray-400 px-2 py-3">暂无画布，点击下方新建</div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 w-full">
            <button
              onClick={() => onAddPage()}
              className="flex-1 px-3 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 text-gray-600 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-300"
            >
              <Layout size={13} /> 新建画布
            </button>
            <button
              onClick={() => onAddFolder()}
              className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-300"
              title="新建文件夹"
            >
              <FolderPlus size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}