// 页面列表中的单个画布项：点击切换、铅笔重命名（行内输入框）、垃圾桶删除。
// A single canvas item in the pages panel — switch, inline rename and delete.
import React, { useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Page } from '../types';

interface Props {
  page: Page;
  isActive: boolean;
  canDelete: boolean;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (e: React.MouseEvent, pageId: string) => void;
}

export function CanvasListItem({ page, isActive, canDelete, onSwitch, onRename, onDelete }: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState(page.name);
  const cancelledRef = useRef(false);

  const startRename = () => {
    cancelledRef.current = false;
    setDraft(page.name);
    setIsRenaming(true);
  };

  const commitRename = () => {
    if (cancelledRef.current) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== page.name) {
      onRename(page.id, trimmed);
    }
    setIsRenaming(false);
  };

  const cancelRename = () => {
    cancelledRef.current = true;
    setIsRenaming(false);
  };

  const baseClasses = `px-4 py-2.5 rounded-xl backdrop-blur-md shadow-sm border text-sm font-medium transition-all text-left w-40 truncate pr-12 ${
    isActive
      ? 'bg-white border-blue-200 text-blue-600 shadow-blue-500/10 scale-100 dark:bg-gray-800 dark:border-blue-500/50 dark:text-blue-400'
      : 'bg-white/50 border-black/5 hover:bg-white/80 hover:border-black/10 scale-95 opacity-80 hover:scale-100 hover:opacity-100 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 dark:hover:border-white/20'
  }`;

  const iconClasses = `p-1.5 rounded-lg transition-colors text-gray-400 ${
    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  }`;

  return (
    <div className="relative group flex items-center">
      {isRenaming ? (
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            // Enter/Escape confirm or cancel the IME composition; ignore them then.
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') cancelRename();
          }}
          onBlur={commitRename}
          maxLength={40}
          className={`${baseClasses} cursor-text outline-none focus:border-blue-500 bg-white dark:bg-gray-800`}
        />
      ) : (
        <button
          onClick={() => onSwitch(page.id)}
          className={baseClasses}
          title={page.name}
        >
          {page.name}
        </button>
      )}

      {!isRenaming && (
        <div className="absolute right-2 flex items-center gap-1">
          <button
            onClick={startRename}
            className={`${iconClasses} hover:text-blue-500 hover:bg-blue-50`}
            title="Rename Canvas"
          >
            <Pencil size={14} />
          </button>
          {canDelete && (
            <button
              onClick={(e) => onDelete(e, page.id)}
              className={`${iconClasses} hover:text-red-500 hover:bg-red-50`}
              title="Delete Canvas"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
