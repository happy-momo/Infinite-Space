// 底部工具栏：新增节点（文字/图片/链接）、撤销重做、连线工具、
// AI 整理、AI 故事、删除、导入导出与 LLM 设置入口。
// Bottom toolbar — node creation, undo/redo, linking, AI actions, import/export and settings.
import React from 'react';
import { motion } from 'motion/react';
import { Type, Image as ImageIcon, Link, Sparkles, Link2, Trash2, Settings, BookOpenText, Undo2, Redo2, Download, Upload } from 'lucide-react';
import { NodeType } from '../types';

interface Props {
  onAdd: (type: NodeType) => void;
  isLinking: boolean;
  onToggleLink: () => void;
  onAiOrganize: () => void;
  isOrganizing: boolean;
  onAiSummarize: () => void;
  isSummarizing: boolean;
  onClear: () => void;
  hasSelection?: boolean;
  onOpenSettings: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExport: () => void;
  onImport: () => void;
}

export function Toolbar({ onAdd, isLinking, onToggleLink, onAiOrganize, isOrganizing, onAiSummarize, isSummarizing, onClear, hasSelection, onOpenSettings, onUndo, onRedo, canUndo, canRedo, onExport, onImport }: Props) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-2xl z-50 dark:bg-gray-900/80 dark:border-white/10"
    >
      <ToolButton icon={<Type size={20} />} label="Text" onClick={() => onAdd('text')} />
      <ToolButton icon={<ImageIcon size={20} />} label="Image" onClick={() => onAdd('image')} />
      <ToolButton icon={<Link size={20} />} label="Link" onClick={() => onAdd('link')} />

      <div className="w-px h-6 bg-gray-200 mx-2 dark:bg-white/10" />

      <ToolButton icon={<Undo2 size={20} />} label="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
      <ToolButton icon={<Redo2 size={20} />} label="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo} />

      <div className="w-px h-6 bg-gray-200 mx-2 dark:bg-white/10" />
      
      <ToolButton 
        icon={<Link2 size={20} />} 
        label="Connect Nodes" 
        onClick={onToggleLink} 
        active={isLinking}
        activeColor="text-blue-500 bg-blue-50"
      />
      
      <div className="w-px h-6 bg-gray-200 mx-2 dark:bg-white/10" />

      <button 
        onClick={onAiOrganize}
        disabled={isOrganizing}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50"
      >
        <Sparkles size={16} className={isOrganizing ? "animate-pulse" : ""} />
        {isOrganizing ? "Organizing..." : "AI Organize"}
      </button>

      <button
        onClick={onAiSummarize}
        disabled={isSummarizing}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50"
      >
        <BookOpenText size={16} className={isSummarizing ? "animate-pulse" : ""} />
        {isSummarizing ? "Summarizing..." : "AI Story"}
      </button>

      <div className="w-px h-6 bg-gray-200 mx-2 dark:bg-white/10" />

      <ToolButton
        icon={<Trash2 size={20} />}
        label={hasSelection ? "Delete Selected" : "Clear All"}
        onClick={onClear}
        hoverColor="hover:text-red-500 hover:bg-red-50"
        active={hasSelection}
        activeColor="text-red-500 bg-red-50"
      />

      <div className="w-px h-6 bg-gray-200 mx-2 dark:bg-white/10" />

      <ToolButton icon={<Download size={20} />} label="Export JSON" onClick={onExport} />
      <ToolButton icon={<Upload size={20} />} label="Import JSON" onClick={onImport} />

      <div className="w-px h-6 bg-gray-200 mx-2 dark:bg-white/10" />

      <ToolButton
        icon={<Settings size={20} />}
        label="LLM Settings"
        onClick={onOpenSettings}
      />
    </motion.div>
  );
}

function ToolButton({ icon, label, onClick, active, activeColor, hoverColor, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; activeColor?: string; hoverColor?: string; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        active
          ? activeColor || 'bg-black/10 text-gray-900 dark:bg-white/10 dark:text-white'
          : `text-gray-600 hover:text-gray-900 hover:bg-black/5 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10 ${hoverColor || ''}`
      }`}
      title={label}
    >
      {icon}
    </button>
  );
}
