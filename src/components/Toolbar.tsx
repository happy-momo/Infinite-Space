// 底部工具栏：新增节点（文字/图片/链接）、撤销重做、连线工具、
// AI 工具（同一簇、同一种渐变胶囊样式）、AI 整理、AI 故事、删除、导入导出与 LLM 设置入口。
// Bottom toolbar — node creation, undo/redo, linking, AI tools (one unified gradient-pill
// cluster), AI organize/story, delete, import/export and settings.
import React from 'react';
import { motion } from 'motion/react';
import { Type, Image as ImageIcon, Link, Sparkles, Link2, Trash2, Settings, BookOpenText, Undo2, Redo2, Download, Upload, FileCode2, MessageSquare, Tag, Lightbulb, Table2, ArrowRightLeft, Loader2 } from 'lucide-react';
import { NodeType } from '../types';

interface Props {
  onAdd: (type: NodeType) => void;
  isLinking: boolean;
  onToggleLink: () => void;
  onToggleChat: () => void;
  isChatOpen: boolean;
  onToggleSearch: () => void;
  onToggleTagPanel: () => void;
  isTagPanelOpen: boolean;
  onToggleSuggest: () => void;
  isSuggestOpen: boolean;
  hasSingleSelection?: boolean;
  onAiOrganize: () => void;
  isOrganizing: boolean;
  onAiSummarize: () => void;
  isSummarizing: boolean;
  /** AI 为无说明的连线生成关系（工具栏入口） */
  onLabelEdges: () => void;
  isLabeling: boolean;
  canLabel: boolean;
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

// AI 胶囊按钮：与 AI Organize / AI Story 同一套渐变胶囊美术（圆角、白字、渐变、图标+文字）。
// 每个功能保留一个品牌色相以便区分，但形状/尺寸/动效完全一致。
function AiPill({ icon, label, onClick, active, loading, disabled, tint }: {
  icon: React.ReactNode; label: string; onClick: () => void; active?: boolean;
  loading?: boolean; disabled?: boolean; tint: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-2 px-4 py-2 h-10 rounded-xl text-white font-medium text-sm leading-none whitespace-nowrap transition-all shadow-sm bg-gradient-to-r ${tint}
        ${active ? 'ring-2 ring-white/80 brightness-110 shadow-md' : ''}
        hover:opacity-90 hover:shadow-md active:scale-[0.98]
        ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

export function Toolbar({ onAdd, isLinking, onToggleLink, onToggleChat, isChatOpen, onToggleSearch, onToggleTagPanel, isTagPanelOpen, onToggleSuggest, isSuggestOpen, hasSingleSelection, onAiOrganize, isOrganizing, onAiSummarize, isSummarizing, onLabelEdges, isLabeling, canLabel, onClear, hasSelection, onOpenSettings, onUndo, onRedo, canUndo, canRedo, onExport, onImport }: Props) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 md:bottom-8 flex items-center gap-1.5 md:gap-2 p-1.5 md:p-2 w-max max-w-[clamp(16rem,calc(100vw - 34rem),82vw)] overflow-x-auto custom-scrollbar bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-2xl z-50 dark:bg-gray-900/80 dark:border-white/10"
    >
      <ToolButton icon={<Type size={20} />} label="Text" onClick={() => onAdd('text')} />
      <ToolButton icon={<ImageIcon size={20} />} label="Image" onClick={() => onAdd('image')} />
      <ToolButton icon={<Link size={20} />} label="Link" onClick={() => onAdd('link')} />
      <ToolButton icon={<FileCode2 size={20} />} label="Markdown" onClick={() => onAdd('markdown')} />
      <ToolButton icon={<Table2 size={20} />} label="Table" onClick={() => onAdd('table')} />

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

      <ToolButton
        icon={<Tag size={20} />}
        label="标签面板"
        onClick={onToggleTagPanel}
        active={isTagPanelOpen}
        activeColor="text-indigo-600 bg-indigo-50"
      />

      <ToolButton
        icon={<Trash2 size={20} />}
        label={hasSelection ? "Delete Selected" : "Clear All"}
        onClick={onClear}
        hoverColor="hover:text-red-500 hover:bg-red-50"
        active={hasSelection}
        activeColor="text-red-500 bg-red-50"
      />

      <div className="w-px h-6 bg-gray-200 mx-2 dark:bg-white/10" />

      {/* AI 工具簇：统一胶囊样式，全部集中在此 */}
      <AiPill tint="from-sky-500 to-blue-500" icon={<MessageSquare size={15} />} label="AI Chat" onClick={onToggleChat} active={isChatOpen} />
      <AiPill tint="from-fuchsia-500 to-pink-500" icon={<Lightbulb size={15} />} label="AI 联想" onClick={onToggleSuggest} active={isSuggestOpen} disabled={!hasSingleSelection} />
      <AiPill tint="from-cyan-500 to-teal-500" icon={<ArrowRightLeft size={15} />} label="AI 标注关系" onClick={onLabelEdges} loading={isLabeling} disabled={!canLabel || isLabeling} />
      <AiPill tint="from-indigo-500 to-purple-500" icon={<Sparkles size={15} />} label={isOrganizing ? "整理中…" : "AI Organize"} onClick={onAiOrganize} loading={isOrganizing} disabled={isOrganizing} />
      <AiPill tint="from-emerald-500 to-teal-500" icon={<BookOpenText size={15} />} label={isSummarizing ? "生成中…" : "AI Story"} onClick={onAiSummarize} loading={isSummarizing} disabled={isSummarizing} />

      <div className="w-px h-6 bg-gray-200 mx-2 dark:bg-white/10" />

      {/* 导出/导入 + 设置 放在一起 */}
      <ToolButton icon={<Download size={20} />} label="Export JSON" onClick={onExport} />
      <ToolButton icon={<Upload size={20} />} label="Import JSON" onClick={onImport} />
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