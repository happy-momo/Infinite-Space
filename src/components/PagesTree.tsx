// 左侧页面树：文件夹 → 画布 两层嵌套结构，支持新建、重命名、删除、拖拽移入文件夹。
// 采用与全局一致的玻璃拟态 + indigo→violet 渐变强调风格。
// Left pages tree — folder → canvas two-level hierarchy with create, rename, delete and drag-to-folder.
// Styled to match the app's glassmorphism + indigo→violet gradient identity.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Folder, FolderOpen, FolderPlus, FolderTree, Trash2, Plus, ChevronDown, Layout, GripVertical,
} from 'lucide-react';
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
  const pageCount = pages.filter((p) => p.type !== 'folder').length;

  const handleDrop = (targetFolderId: string) => {
    if (draggingId && draggingId !== targetFolderId) {
      onMovePage(draggingId, targetFolderId === TOP_PARENT ? null : targetFolderId);
    }
    setDraggingId(null);
    setDragOver(null);
  };

  // 行通用样式：激活态用渐变强调，静止态用柔和玻璃 hover
  const rowCls = (active: boolean, isOver: boolean) =>
    `group flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-all w-full ${
      isOver
        ? 'bg-amber-100/70 ring-1 ring-amber-300/60 dark:bg-amber-500/20 dark:ring-amber-400/40'
        : active
          ? 'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200/60 dark:from-indigo-500/20 dark:to-violet-500/15 dark:text-indigo-200 dark:ring-indigo-400/30'
          : 'text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
    }`;

  // 删除/新建小按钮（hover 显示）
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
        <span
          className={`w-1 h-4 rounded-full shrink-0 transition-colors ${
            p.id === currentPageId
              ? 'bg-gradient-to-b from-indigo-500 to-violet-500'
              : 'bg-transparent group-hover:bg-black/10 dark:group-hover:bg-white/15'
          }`}
        />
        <GripVertical size={12} className="text-gray-300 shrink-0 cursor-grab" />
        <Layout
          size={14}
          className={`shrink-0 ${p.id === currentPageId ? 'text-indigo-500 dark:text-indigo-300' : 'text-gray-400'}`}
        />
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
    // 空文件夹没有可展开的内容，跳过展开动画块，避免高度 0↔padding 造成的漂移
    const kids = childrenOf(folder.id);
    const hasKids = kids.length > 0;
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
            {/* 同一 chevron 旋转，避免图标宽差位移。空文件夹无展开箭头，用同宽空白占位保持对齐 */}
            {hasKids ? (
              <span className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400">
                <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
              </span>
            ) : (
              <span className="shrink-0 w-4 h-4" />
            )}
            <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-md bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              {isExpanded && hasKids ? <FolderOpen size={12} /> : <Folder size={12} />}
            </span>
            <span className="truncate flex-1">{folder.name}</span>
            <span onClick={(e) => e.stopPropagation()} className="flex items-center shrink-0">
              <button onClick={() => onAddPage(folder.id)} className={`${iconBtnCls} hover:text-blue-500 hover:bg-blue-50`} title="在文件夹内新建画布">
                <Plus size={13} />
              </button>
              <button onClick={(e) => onDelete(e, folder.id)} className={iconBtnCls} title="删除文件夹">
                <Trash2 size={13} />
              </button>
            </span>
          </button>
        </div>
        <AnimatePresence initial={false}>
          {hasKids && isExpanded && (
            <motion.div
              key="children"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { duration: 0.22, ease: 'easeInOut' }, opacity: { duration: 0.16 } }}
              className="overflow-hidden border-l border-black/5 ml-[21px] dark:border-white/10"
            >
              <div className="pl-1 pr-1 pb-0.5">
                {kids.map((c) => pageRow(c, 1))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div data-panel="pages" className="fixed bottom-8 left-8 z-50 w-60">
      {/* 卡片整体：玻璃拟态，与 Toolbar/弹窗一致。用非过冲 tween 入场，避免弹簧回弹造成的漂移 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'tween', duration: 0.28, ease: 'easeOut', delay: 0.1 }}
        className="bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-2xl overflow-hidden dark:bg-gray-900/80 dark:border-white/10"
      >
        {/* 头部：渐变图标 + 标题 + 数量 + 收起/展开 */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
          title={isOpen ? '收起面板' : '展开面板'}
        >
          <span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-sm">
            <FolderTree size={16} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold text-gray-800 leading-tight dark:text-gray-100">Canvases</span>
            <span className="block text-[10px] text-gray-400 leading-tight dark:text-gray-500">{pageCount} pages</span>
          </span>
          {/* 固定尺寸容器内旋转同一 chevron，展开/收起不产生图标宽度差异导致的位移 */}
          <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors dark:hover:text-gray-200 dark:hover:bg-white/10">
            <ChevronDown size={15} className={`transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
          </span>
        </button>

        {/* 展开体：列表 + 底部操作，高度动画 */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { duration: 0.28, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className="h-px bg-black/[0.06] dark:bg-white/10" />

              {/* 页面列表 */}{/* pages-list 供 App 层 wheel 处理识别并导向滚动 */}
              <div className="pages-list max-h-[260px] overflow-y-auto overflow-x-hidden p-1.5 custom-scrollbar">
                {folders.map((f) => folderRow(f, 0))}
                {topLevel.map((p) => pageRow(p, 0))}
                {folders.length === 0 && topLevel.length === 0 && (
                  <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                    <span className="w-10 h-10 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] flex items-center justify-center text-gray-300 dark:text-gray-600">
                      <FolderTree size={18} />
                    </span>
                    <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                      No canvases yet.<br />Create one below.
                    </p>
                  </div>
                )}
              </div>

              <div className="h-px bg-black/[0.06] dark:bg-white/10" />

              {/* 底部操作：新建画布（渐变主按钮）+ 新建文件夹 */}
              <div className="flex items-center gap-1.5 px-2.5 py-2.5">
                <button
                  onClick={() => onAddPage()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-semibold shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <Plus size={13} /> New Canvas
                </button>
                <button
                  onClick={() => onAddFolder()}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 text-amber-600 border border-black/5 shadow-sm hover:bg-amber-50 hover:text-amber-700 active:scale-[0.98] transition-all dark:bg-white/5 dark:border-white/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
                  title="新建文件夹"
                >
                  <FolderPlus size={15} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}