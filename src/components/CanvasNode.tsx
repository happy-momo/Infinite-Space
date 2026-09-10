// 单个画布节点：文字/图片/链接三种类型的渲染、编辑、拖拽移动、缩放调整、
// 字体与字号选择，以及连线模式下作为“目标”被点击。
// Single canvas node — renders text/image/link cards and handles drag, resize and inline editing.
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { NodeData } from '../types';
import { X, Type, Image as ImageIcon, Link, Edit2, Check, Upload, ChevronDown } from 'lucide-react';

const FONTS = [
  { label: 'Default Font', value: '' },
  { label: '微软雅黑', value: "'Microsoft YaHei', sans-serif" },
  { label: '苹方', value: "'PingFang SC', sans-serif" },
  { label: '宋体', value: "SimSun, serif" },
  { label: '楷体', value: "KaiTi, serif" },
  { label: 'Serif', value: "serif" },
  { label: 'Mono', value: "monospace" },
];

const getValidUrl = (url?: string) => {
  if (!url) return '#';
  return url.match(/^https?:\/\//) ? url : `https://${url}`;
};

interface LinkItem {
  id: string;
  title: string;
  url: string;
  favicon?: string;
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// Downscale large uploads so base64 state doesn't balloon.
const compressImage = (file: File, maxDim: number, quality: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('no 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      if (canvas.toBlob) {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              fileToDataUrl(file).then(resolve).catch(reject);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          },
          'image/webp',
          quality,
        );
      } else {
        resolve(canvas.toDataURL('image/webp', quality));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fileToDataUrl(file).then(resolve).catch(reject);
    };
    img.src = url;
  });

const getLinkItems = (content?: string, fallbackUrl?: string): LinkItem[] => {
  if (!content && !fallbackUrl) return [];
  try {
    const parsed = JSON.parse(content || '[]');
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      return parsed;
    }
  } catch (e) {
    // Content is not JSON, fallback to treating it as title
  }
  return [{ id: 'legacy', title: content || '', url: fallbackUrl || '' }];
};

interface Props {
  key?: React.Key;
  node: NodeData;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<NodeData>) => void;
  bringToFront: (id: string) => void;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  isLinking: boolean;
  onLinkClick: (id: string) => void;
  onTransactionStart: () => void;
}

export function CanvasNode({ node, onRemove, onUpdate, bringToFront, isSelected, onSelect, isLinking, onLinkClick, onTransactionStart }: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);
  const contentEditableRef = useRef<HTMLDivElement>(null);

  const handleSaveEdit = () => {
    if (isEditing) {
      if (node.type === 'text' && contentEditableRef.current) {
        const html = contentEditableRef.current.innerHTML;
        if (html !== node.content) {
          onUpdate(node.id, { content: html });
        }
      }
      setIsEditing(false);
    }
  };

  const handleBoldClick = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTransactionStart();

    if (isEditing && node.type === 'text') {
      document.execCommand('bold', false);
    } else {
      onUpdate(node.id, { fontWeight: node.fontWeight === 'bold' ? 'normal' : 'bold' });
    }
  };

  useEffect(() => {
    if (isEditing && node.type === 'text' && contentEditableRef.current) {
      contentEditableRef.current.focus();
    }
  }, [isEditing]);

  const handleNodePointerDown = (e: React.PointerEvent) => {
    if (isLinking) return;
    e.stopPropagation();
    // If a text node is being edited, commit the edit before starting the drag
    // so the header/body is always a usable drag handle (fix: edit-locked drag).
    if (isEditing) {
      handleSaveEdit();
    }
    bringToFront(node.id);
    onSelect(node.id, e.shiftKey || e.metaKey || e.ctrlKey);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialNodeX = node.x;
    const initialNodeY = node.y;
    let started = false;

    const onMove = (moveEv: PointerEvent) => {
      // Snapshot history on the first real movement (not on a plain click-select).
      if (!started) {
        started = true;
        onTransactionStart();
      }
      // Read scale on every move so zooming mid-drag keeps the node under the cursor.
      const scale = (window as any)._canvasScale || 1;
      const dx = (moveEv.clientX - startX) / scale;
      const dy = (moveEv.clientY - startY) / scale;
      onUpdate(node.id, { x: initialNodeX + dx, y: initialNodeY + dy });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove as EventListener);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove as EventListener);
    window.addEventListener('pointerup', onUp);
  };

  const handleResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialW = node.width || 300;
    const initialH = node.height || (node.type === 'image' ? 300 : 200);
    let started = false;

    const onMove = (moveEv: PointerEvent) => {
      if (!started) {
        started = true;
        onTransactionStart();
      }
      const scale = (window as any)._canvasScale || 1;
      const dx = (moveEv.clientX - startX) / scale;
      const dy = (moveEv.clientY - startY) / scale;
      onUpdate(node.id, { 
        width: Math.max(200, initialW + dx), 
        height: Math.max(100, initialH + dy) 
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove as EventListener);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove as EventListener);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ 
        scale: 1, 
        opacity: 1
      }}
      transition={{ 
        scale: { type: "spring", stiffness: 300, damping: 25 },
        opacity: { duration: 0.2 }
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onPointerDown={handleNodePointerDown}
      className={`absolute origin-top-left rounded-2xl shadow-lg border backdrop-blur-xl group flex flex-col transition-shadow select-none ${
        isSelected ? 'ring-2 ring-blue-500 shadow-blue-500/20' : 'border-gray-200/50'
      } ${isLinking ? 'cursor-crosshair hover:ring-2 hover:ring-green-500' : ''}`}
      style={{
        x: node.x,
        y: node.y,
        width: node.width || 300,
        height: node.height || (node.type === 'image' ? 300 : 200),
        backgroundColor: node.color || 'rgba(255, 255, 255, 0.9)',
        zIndex: node.zIndex || 1,
        fontFamily: node.fontFamily || 'inherit',
        fontWeight: node.fontWeight || 'normal'
      }}
    >
      {isSelected && (node.type === 'text' || node.type === 'link') && (
        <div 
          className="absolute -top-14 left-0 bg-white/95 backdrop-blur-xl shadow-lg border border-black/10 rounded-xl p-1.5 flex items-center gap-2 z-50 text-sm h-12 dark:bg-gray-900/95 dark:border-white/10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <button
              onClick={() => setIsFontPickerOpen(!isFontPickerOpen)}
              className="flex items-center justify-between w-28 px-3 py-1.5 hover:bg-black/5 rounded-lg font-medium text-gray-700 transition-colors dark:hover:bg-white/10 dark:text-gray-200"
            >
              <span className="truncate">
                {FONTS.find(f => f.value === node.fontFamily)?.label || 'Default'}
              </span>
              <ChevronDown size={14} className="text-gray-400 shrink-0 ml-1" />
            </button>
            {isFontPickerOpen && (
              <div className="absolute top-full mt-2 left-0 w-36 bg-white shadow-xl border border-black/10 rounded-xl py-1.5 flex flex-col z-50 overflow-hidden dark:bg-gray-900 dark:border-white/10">
                {FONTS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => {
                      onTransactionStart();
                      onUpdate(node.id, { fontFamily: f.value });
                      setIsFontPickerOpen(false);
                    }}
                    className="px-4 py-2 text-left text-sm hover:bg-blue-50 hover:text-blue-600 transition-colors font-medium dark:text-gray-200 dark:hover:bg-blue-500/20 dark:hover:text-blue-300"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="w-px h-5 bg-gray-200 dark:bg-white/10" />
          <input
            type="number"
            value={node.fontSize || 14}
            onChange={e => onUpdate(node.id, { fontSize: parseInt(e.target.value) || 14 })}
            className="w-14 bg-transparent border border-transparent focus:border-blue-500 outline-none text-center hover:bg-black/5 rounded-lg px-1 py-1.5 transition-colors font-medium text-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
            min="8" max="120"
            title="Font Size"
            onFocus={() => onTransactionStart()}
          />
          <div className="w-px h-5 bg-gray-200 dark:bg-white/10" />
          <button
            onPointerDown={handleBoldClick}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${node.fontWeight === 'bold' ? 'bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-500/30 dark:text-blue-300' : 'hover:bg-black/5 text-gray-600 dark:hover:bg-white/10 dark:text-gray-300'}`}
            title="Bold Selection / Global Bold"
          >
            <b>B</b>
          </button>
        </div>
      )}

      {/* Header - Drag Handle */}
      <div
        className={`h-11 flex items-center justify-between px-4 transition-opacity duration-200 rounded-t-2xl ${!isLinking ? 'cursor-grab active:cursor-grabbing' : ''} bg-black/5 ${isHovered || isSelected ? 'opacity-100' : 'opacity-0'}`}
      >
         <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
           {node.type === 'text' && <Type size={15} />}
           {node.type === 'image' && <ImageIcon size={15} />}
           {node.type === 'link' && <Link size={15} />}
           <span className="capitalize">{node.type}</span>
         </div>
         <div className="flex items-center gap-1.5">
           {(node.type === 'text' || node.type === 'link') && (
             <button
               onPointerDown={(e) => e.stopPropagation()}
               onClick={() => {
                 if (isEditing) {
                   handleSaveEdit();
                 } else {
                   onTransactionStart();
                   setIsEditing(true);
                 }
               }}
               className="p-1.5 hover:bg-black/10 rounded-full text-gray-500 transition-colors"
               title={isEditing ? "Save" : "Edit"}
             >
               {isEditing ? <Check size={15} /> : <Edit2 size={15} />}
             </button>
           )}
           {node.type === 'image' && (
             <label
               className="p-1.5 hover:bg-black/10 rounded-full text-gray-500 hover:text-blue-500 transition-colors cursor-pointer"
               title="Upload Image"
               onPointerDown={(e) => e.stopPropagation()}
             >
               <Upload size={15} />
               <input
                 type="file"
                 accept="image/*"
                 className="hidden"
                 onChange={async (e) => {
                   const file = e.target.files?.[0];
                   if (!file) return;
                   e.target.value = '';
                   onTransactionStart();
                   try {
                     const dataUrl = await compressImage(file, 1600, 0.82);
                     onUpdate(node.id, { content: dataUrl });
                   } catch {
                     onUpdate(node.id, { content: await fileToDataUrl(file) });
                   }
                 }}
               />
             </label>
           )}
           <button
             onPointerDown={(e) => e.stopPropagation()}
             onClick={() => onRemove(node.id)}
             className="p-1.5 hover:bg-black/10 rounded-full text-gray-500 hover:text-red-500 transition-colors"
           >
             <X size={15} />
           </button>
         </div>
      </div>

      <div className="p-4 pt-1 flex-1 flex flex-col min-h-[80px]">
        {node.type === 'text' && (
          <div 
            ref={contentEditableRef}
            contentEditable={isEditing}
            suppressContentEditableWarning
            className={`prose prose-sm prose-slate max-w-none w-full h-full outline-none ${isEditing ? 'cursor-text bg-white/50 rounded-lg p-2 -m-2 select-text' : 'cursor-text'}`}
            style={{ fontSize: node.fontSize ? `${node.fontSize}px` : 'inherit', minHeight: '120px' }}
            onDoubleClick={() => {
              onTransactionStart();
              setIsEditing(true);
            }}
            onPointerDown={(e) => {
              // Only intercept while editing (caret placement); otherwise let the
              // event bubble to the root drag handler so the body is draggable.
              if (isEditing) e.stopPropagation();
            }}
            onKeyDown={(e) => {
              // Let the IME finish composition before treating Enter as "save".
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') {
                if (e.shiftKey) {
                  // Allow default new line behavior
                  return;
                } else {
                  // Prevent new line and save
                  e.preventDefault();
                  handleSaveEdit();
                }
              }
            }}
            onBlur={handleSaveEdit}
            dangerouslySetInnerHTML={{ __html: node.content || (isEditing ? '' : '<i>Double click to edit text</i>') }}
          />
        )}
        {node.type === 'image' && (
          <div className="relative w-full h-full group/image flex-1 min-h-[100px] flex items-center justify-center bg-black/5 rounded-lg overflow-hidden">
            {node.content ? (
              <img
                src={node.content}
                alt="Canvas media"
                className="w-full h-auto pointer-events-none object-cover"
              />
            ) : (
              <span className="text-gray-400 text-sm">No image</span>
            )}
          </div>
        )}
        {node.type === 'link' && (() => {
          const links = getLinkItems(node.content, node.url);

          // Best-effort metadata fetch (title/favicon) when a URL is saved.
          const enrichLink = async (idx: number) => {
            const link = links[idx];
            const url = link.url.trim();
            if (!/^https?:\/\//i.test(url)) return;
            try {
              const res = await fetch(`/api/linkinfo?url=${encodeURIComponent(url)}`);
              const data = await res.json();
              if (!data.ok) return;
              const updated = { ...link };
              if (!updated.title && data.title) updated.title = String(data.title).slice(0, 200);
              if (data.favicon) updated.favicon = String(data.favicon);
              if (updated.title !== link.title || updated.favicon !== link.favicon) {
                const newLinks = [...links];
                newLinks[idx] = updated;
                onUpdate(node.id, { content: JSON.stringify(newLinks) });
              }
            } catch {
              // best-effort: ignore failures silently
            }
          };

          if (isEditing) {
            return (
              <div className="flex flex-col gap-2 h-full overflow-y-auto custom-scrollbar pr-1 -mr-1">
                {links.map((link, idx) => (
                  <div key={link.id} className="flex flex-col gap-2 p-2 bg-white/60 rounded-xl border border-black/5 relative group/linkedit shadow-sm">
                    <input
                      type="text"
                      placeholder="Display Text"
                      value={link.title}
                      onChange={e => {
                        const newLinks = [...links];
                        newLinks[idx].title = e.target.value;
                        onUpdate(node.id, { content: JSON.stringify(newLinks) });
                      }}
                      className="w-full bg-transparent border-b border-black/10 p-1 text-sm font-medium outline-none focus:border-blue-500"
                      onPointerDown={e => e.stopPropagation()}
                      onFocus={() => onTransactionStart()}
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      value={link.url}
                      onChange={e => {
                        const newLinks = [...links];
                        newLinks[idx].url = e.target.value;
                        onUpdate(node.id, { content: JSON.stringify(newLinks) });
                      }}
                      className="w-full bg-transparent p-1 text-xs outline-none text-gray-500"
                      onPointerDown={e => e.stopPropagation()}
                      onFocus={() => onTransactionStart()}
                      onBlur={() => enrichLink(idx)}
                    />
                    <button 
                      onClick={() => {
                        onTransactionStart();
                        const newLinks = links.filter((_, i) => i !== idx);
                        onUpdate(node.id, { content: JSON.stringify(newLinks) });
                      }}
                      className="absolute right-1 top-1 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover/linkedit:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    onTransactionStart();
                    const newLinks = [...links, { id: Math.random().toString(36).substr(2, 9), title: '', url: '' }];
                    onUpdate(node.id, { content: JSON.stringify(newLinks) });
                  }}
                  className="w-full py-2 bg-black/5 hover:bg-black/10 text-gray-600 rounded-xl text-sm font-medium transition-colors border border-dashed border-black/20 mt-1"
                >
                  + Add Link
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                  onPointerDown={e => e.stopPropagation()}
                >
                  Done
                </button>
              </div>
            );
          }

          return (
            <div
              className="flex flex-col gap-2 h-full overflow-y-auto custom-scrollbar pr-1 -mr-1"
              onDoubleClick={() => {
              onTransactionStart();
              setIsEditing(true);
            }}
            >
              {links.length === 0 && <span className="text-gray-400 text-sm mt-2">Double click to add links</span>}
              {links.map(link => (
                 <a
                   key={link.id}
                   href={getValidUrl(link.url || link.title)}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="group block p-3 bg-white/40 hover:bg-white/80 rounded-xl border border-black/5 transition-all shadow-sm hover:shadow"
                   onPointerDown={(e) => e.stopPropagation()}
                 >
                   <div className="flex items-center gap-1.5 min-w-0">
                     {link.favicon && (
                       <img
                         src={link.favicon}
                         alt=""
                         className="w-4 h-4 rounded-sm object-contain shrink-0"
                         onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                       />
                     )}
                     <div className="line-clamp-1 font-medium text-gray-800 min-w-0" style={{ fontSize: node.fontSize ? `${node.fontSize}px` : 'inherit' }}>
                       {link.title || link.url || 'Untitled Link'}
                     </div>
                   </div>
                   <div className="text-xs text-blue-500 line-clamp-1 mt-1 opacity-80 group-hover:opacity-100 transition-opacity">
                     {link.url || 'No URL'}
                   </div>
                 </a>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Resize Handle */}
      {(!isEditing && !isLinking) && (
        <div
          onPointerDown={handleResizeDown}
          className={`absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center transition-opacity ${isHovered || isSelected ? 'opacity-50 hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-gray-400">
            <path d="M 8 10 L 10 10 L 10 8 Z M 5 10 L 10 10 L 10 5 Z M 2 10 L 10 10 L 10 2 Z" />
          </svg>
        </div>
      )}

      {/* Link interaction overlay */}
      {isLinking && (
        <div 
          className="absolute inset-0 z-50 cursor-crosshair"
          onPointerDown={(e) => {
            e.stopPropagation();
            onLinkClick(node.id);
          }}
        />
      )}
    </motion.div>
  );
}
