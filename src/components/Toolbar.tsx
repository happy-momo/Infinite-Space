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

// AI 胶囊按钮：以 AI Organize 的质感为模板，统一做「低对比、内敛的珠宝色胶囊」。
// 底色用相近的两档雅致色调做又轻又柔的竖向渐变（对比刻意压得很低），
// 质感主要靠顶部高光内阴影（sheen）与一圈极淡描边来体现，整体沉稳、不张扬。
// Every AI pill shares one restrained, low-contrast finish (modeled on AI Organize):
// a barely-there vertical gradient, with texture coming from a top sheen + faint ring.
function AiPill({ icon, label, onClick, active, loading, disabled, tint }: {
  icon: React.ReactNode; label: string; onClick: () => void; active?: boolean;
  loading?: boolean; disabled?: boolean; tint: string;
}) {
  const idle =
    'ring-1 ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-6px_12px_rgba(0,0,0,0.20),0_2px_6px_-1px_rgba(15,23,42,0.20)]';
  const activeCls =
    'ring-1 ring-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.30),inset_0_-6px_12px_rgba(0,0,0,0.20),0_5px_14px_-2px_rgba(79,70,229,0.35)]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`relative flex items-center gap-1.5 px-3 h-9 rounded-xl text-white font-medium text-xs leading-none whitespace-nowrap transition-all duration-200 bg-gradient-to-b ${tint} ${active ? activeCls : idle}
        hover:brightness-110 active:scale-[0.97]
        ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
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
      className="fixed bottom-4 left-1/2 -translate-x-1/2 md:bottom-8 flex items-center gap-1 p-1.5 w-max max-w-[clamp(15rem,calc(100vw - 36rem),78vw)] overflow-x-auto custom-scrollbar bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-2xl z-50 dark:bg-gray-900/80 dark:border-white/10"
    >
      <ToolButton icon={<Type size={18} />} label="Text" onClick={() => onAdd('text')} />
      <ToolButton icon={<ImageIcon size={18} />} label="Image" onClick={() => onAdd('image')} />
      <ToolButton icon={<Link size={18} />} label="Link" onClick={() => onAdd('link')} />
      <ToolButton icon={<FileCode2 size={18} />} label="Markdown" onClick={() => onAdd('markdown')} />
      <ToolButton icon={<Table2 size={18} />} label="Table" onClick={() => onAdd('table')} />

      <div className="w-px h-5 bg-gray-200 mx-1 dark:bg-white/10" />

      <ToolButton icon={<Undo2 size={18} />} label="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
      <ToolButton icon={<Redo2 size={18} />} label="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo} />

      <div className="w-px h-5 bg-gray-200 mx-1 dark:bg-white/10" />

      <ToolButton
        icon={<Link2 size={18} />}
        label="Connect Nodes"
        onClick={onToggleLink}
        active={isLinking}
        activeColor="text-blue-500 bg-blue-50"
      />

      <ToolButton
        icon={<Tag size={18} />}
        label="标签面板"
        onClick={onToggleTagPanel}
        active={isTagPanelOpen}
        activeColor="text-indigo-600 bg-indigo-50"
      />

      <ToolButton
        icon={<Trash2 size={18} />}
        label={hasSelection ? "Delete Selected" : "Clear All"}
        onClick={onClear}
        hoverColor="hover:text-red-500 hover:bg-red-50"
        active={hasSelection}
        activeColor="text-red-500 bg-red-50"
      />

      <div className="w-px h-5 bg-gray-200 mx-1 dark:bg-white/10" />

      {/* AI 工具簇：统一胶囊样式，全部集中在此 */}
      <AiPill tint="from-blue-700 to-blue-800" icon={<MessageSquare size={14} />} label="AI Chat" onClick={onToggleChat} active={isChatOpen} />
      <AiPill tint="from-fuchsia-700 to-fuchsia-800" icon={<Lightbulb size={14} />} label="AI 联想" onClick={onToggleSuggest} active={isSuggestOpen} disabled={!hasSingleSelection} />
      <AiPill tint="from-teal-700 to-teal-800" icon={<ArrowRightLeft size={14} />} label="AI 标注关系" onClick={onLabelEdges} loading={isLabeling} disabled={!canLabel || isLabeling} />
      <AiPill tint="from-indigo-700 to-violet-800" icon={<Sparkles size={14} />} label={isOrganizing ? "整理中…" : "AI Organize"} onClick={onAiOrganize} loading={isOrganizing} disabled={isOrganizing} />
      <AiPill tint="from-emerald-700 to-emerald-800" icon={<BookOpenText size={14} />} label={isSummarizing ? "生成中…" : "AI Story"} onClick={onAiSummarize} loading={isSummarizing} disabled={isSummarizing} />

      <div className="w-px h-5 bg-gray-200 mx-1 dark:bg-white/10" />

      {/* 导出/导入 + 设置 放在一起 */}
      <ToolButton icon={<Download size={18} />} label="Export JSON" onClick={onExport} />
      <ToolButton icon={<Upload size={18} />} label="Import JSON" onClick={onImport} />
      <ToolButton
        icon={<Settings size={18} />}
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
      className={`flex flex-col items-center justify-center w-11 h-9 rounded-xl transition-colors disabled:opacity-40 disabled:pointer-events-none ${
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