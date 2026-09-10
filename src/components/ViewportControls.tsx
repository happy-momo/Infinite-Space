// 右侧视口控制条：放大、缩小、适配全部内容、重置为 100%。
// Right-hand viewport controls — zoom in/out, fit-to-content and reset.
import { motion } from 'motion/react';
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}

export function ViewportControls({ onZoomIn, onZoomOut, onFit, onReset }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.3 }}
      className="fixed right-8 bottom-[180px] z-50 flex flex-col items-center gap-0.5 p-1.5 bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-xl dark:bg-gray-900/80 dark:border-white/10"
    >
      <button
        onClick={onZoomIn}
        title="放大"
        className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-black/5 transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10"
      >
        <ZoomIn size={16} />
      </button>
      <div className="w-6 h-px bg-gray-200 dark:bg-white/10" />
      <button
        onClick={onZoomOut}
        title="缩小"
        className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-black/5 transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10"
      >
        <ZoomOut size={16} />
      </button>
      <div className="w-6 h-px bg-gray-200 dark:bg-white/10" />
      <button
        onClick={onFit}
        title="适配全部内容"
        className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-black/5 transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10"
      >
        <Maximize size={16} />
      </button>
      <div className="w-6 h-px bg-gray-200 dark:bg-white/10" />
      <button
        onClick={onReset}
        title="100%（重置缩放）"
        className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-black/5 transition-colors dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/10"
      >
        <RotateCcw size={16} />
      </button>
    </motion.div>
  );
}
