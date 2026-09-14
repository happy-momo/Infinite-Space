// 表格编辑器：可编辑行列的表格节点，支持 CSV 导入，一键调用 AI 生成图表。
// Table editor — editable grid node with CSV import and AI chart generation.
import { useRef, useState } from 'react';
import { Upload, Plus, Minus, Trash2, Wand2, Loader2 } from 'lucide-react';
import { NodeData, TableCell } from '../types';
import { parseCsv } from '../utils/csv';

interface Props {
  node: NodeData;
  onUpdate: (id: string, updates: Partial<NodeData>) => void;
  onTransactionStart: () => void;
  /** 请求 AI 生成图表（由父级触发，这里只提供入口） */
  onGenerateChart: () => void;
  generating?: boolean;
}

const emptyGrid = (rows = 3, cols = 3): TableCell[][] =>
  Array.from({ length: rows }, (_, ri) =>
    Array.from({ length: cols }, (_, ci) => ({ text: '', isHeader: ri === 0 }))
  );

export function TableEditor({ node, onUpdate, onTransactionStart, onGenerateChart, generating }: Props) {
  const data = node.tableData && node.tableData.length > 0 ? node.tableData : emptyGrid();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);

  const commit = (next: TableCell[][]) => onUpdate(node.id, { tableData: next });

  const setCell = (r: number, c: number, text: string) => {
    const next = data.map((row, ri) =>
      row.map((cell, ci) => (ri === r && ci === c ? { ...cell, text } : cell))
    );
    commit(next);
  };

  const addRow = () => { onTransactionStart(); commit([...data, Array.from({ length: data[0]?.length || 3 }, () => ({ text: '' }))]); };
  const addCol = () => { onTransactionStart(); commit(data.map((row) => [...row, { text: '' }])); };
  const removeRow = (r: number) => { onTransactionStart(); commit(data.filter((_, i) => i !== r)); };
  const removeCol = (c: number) => { onTransactionStart(); commit(data.map((row) => row.filter((_, i) => i !== c))); };
  const clearAll = () => { onTransactionStart(); commit([]); };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result));
        if (rows.length === 0) { setFileErr('CSV 为空'); return; }
        onTransactionStart();
        commit(rows.map((r, ri) => r.map((c) => ({ text: c, isHeader: ri === 0 }))));
      } catch {
        setFileErr('CSV 解析失败，请检查格式');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-black/5 dark:border-white/10">
        <button onClick={addRow} className="p-1 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors dark:hover:bg-blue-500/20" title="添加行">
          <Plus size={13} />
        </button>
        <button onClick={addCol} className="p-1 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors dark:hover:bg-blue-500/20" title="添加列">
          <Minus size={13} className="rotate-90" />
        </button>
        <button onClick={clearAll} className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors dark:hover:bg-red-500/20" title="清空">
          <Trash2 size={13} />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-1 dark:bg-white/10" />
        <button onClick={() => fileRef.current?.click()} className="p-1 rounded-md text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 transition-colors dark:hover:bg-emerald-500/20" title="导入 CSV">
          <Upload size={13} />
        </button>
        <div className="flex-1" />
        {fileErr && <span className="text-[10px] text-red-500">{fileErr}</span>}
        <button
          onClick={onGenerateChart}
          disabled={generating || data.length < 2}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-[11px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          title="用 AI 分析数据并生成图表"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          AI 图表
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
      </div>

      {/* 表格区 */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {data.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-xs text-gray-400">
            <span>空表格</span>
            <div className="flex gap-2">
              <button onClick={addRow} className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-gray-600 font-medium dark:bg-white/10 dark:text-gray-300">添加行</button>
              <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-gray-600 font-medium dark:bg-white/10 dark:text-gray-300">导入 CSV</button>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-6 px-0.5 border border-black/5 bg-gray-50 dark:bg-white/5 dark:border-white/10"></th>
                {data[0].map((_, ci) => (
                  <th key={ci} className="relative border border-black/5 bg-gray-50 dark:bg-white/5 dark:border-white/10">
                    <input
                      value={data[0][ci].text}
                      onChange={(e) => setCell(0, ci, e.target.value)}
                      onFocus={() => onTransactionStart()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full px-1.5 py-1 bg-transparent font-semibold text-gray-700 outline-none dark:text-gray-200 text-center"
                      placeholder={`列 ${ci + 1}`}
                    />
                    <button
                      onClick={() => removeCol(ci)}
                      className="absolute -right-1 -top-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] leading-none opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                      title="删除列"
                    >×</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(1).map((row, ri) => {
                const r = ri + 1;
                return (
                  <tr key={r} className="group">
                    <td className="px-0.5 border border-black/5 text-center text-gray-300 dark:border-white/10">
                      <button
                        onClick={() => removeRow(r)}
                        className="w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] leading-none opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                        title="删除行"
                      >×</button>
                    </td>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-black/5 dark:border-white/10">
                        <input
                          value={cell.text}
                          onChange={(e) => setCell(r, ci, e.target.value)}
                          onFocus={() => onTransactionStart()}
                          onPointerDown={(e) => e.stopPropagation()}
                          className={`w-full px-1.5 py-1 bg-transparent text-gray-700 outline-none dark:text-gray-200 ${cell.align === 'center' ? 'text-center' : cell.align === 'right' ? 'text-right' : ''}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}