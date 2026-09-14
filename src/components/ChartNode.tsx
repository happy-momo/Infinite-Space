// 图表节点：根据 ChartConfig 用纯 SVG 绘制柱状/折线/饼图。
// 支持类型切换、标题编辑、导出 PNG。
// Chart node — pure-SVG bar/line/pie rendering from ChartConfig, with type switch and PNG export.
import { useEffect, useRef, useState } from 'react';
import { BarChart3, LineChart, PieChart, Download, Wand2 } from 'lucide-react';
import { ChartConfig, ChartType, NodeData } from '../types';
import { downloadSvgAsPng } from '../utils/exportPng';

interface Props {
  node: NodeData;
  onUpdate: (id: string, updates: Partial<NodeData>) => void;
  onTransactionStart: () => void;
  /** 点击「重新用 AI 生成」入口（可选） */
  onAiRegenerate?: () => void;
}

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
const TYPES: { t: Exclude<ChartType, 'auto'>; label: string; icon: React.ReactNode }[] = [
  { t: 'bar', label: '柱状', icon: <BarChart3 size={13} /> },
  { t: 'line', label: '折线', icon: <LineChart size={13} /> },
  { t: 'pie', label: '饼图', icon: <PieChart size={13} /> },
];

const W = 440;
const H = 300;
const M = { top: 34, right: 16, bottom: 40, left: 46 };

export function ChartNode({ node, onUpdate, onTransactionStart, onAiRegenerate }: Props) {
  const cfg: ChartConfig = node.chartConfig || { chartType: 'bar', data: [] };
  const svgRef = useRef<SVGSVGElement>(null);
  const [title, setTitle] = useState(cfg.title || '');
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  useEffect(() => { setTitle(cfg.title || ''); }, [cfg.title]);

  const data = cfg.data || [];
  const chartType: Exclude<ChartType, 'auto'> = cfg.chartType === 'auto' ? 'bar' : (cfg.chartType as Exclude<ChartType, 'auto'>);

  const switchType = (t: Exclude<ChartType, 'auto'>) => {
    onTransactionStart();
    onUpdate(node.id, { chartConfig: { ...cfg, chartType: t } });
  };

  const exportPng = async () => {
    if (!svgRef.current) return;
    await downloadSvgAsPng(svgRef.current, cfg.title || 'chart');
  };

  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  // ---- 数据提取 ----
  const values = data.map((d) => d.value);
  const maxV = Math.max(...values, 0.0001);
  const barBand = plotW / Math.max(1, data.length);
  const barW = Math.min(34, barBand * 0.55);
  const isDark = document.documentElement.classList.contains('dark');

  const axisColor = isDark ? '#64748b' : '#94a3b8';
  const textColor = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)';

  return (
    <div className="w-full h-full flex flex-col">
      {/* 顶栏：标题 + 操作 */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-black/5 dark:border-white/10">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {titleDraft !== null ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => { onTransactionStart(); onUpdate(node.id, { chartConfig: { ...cfg, title: titleDraft.trim() } }); setTitleDraft(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-full min-w-0 px-1.5 py-0.5 rounded-md bg-white border border-blue-300 text-xs font-semibold text-gray-700 outline-none dark:bg-gray-800 dark:text-gray-100"
            />
          ) : (
            <button
              onClick={() => { setTitleDraft(title); }}
              className="min-w-0 px-1.5 py-0.5 text-xs font-semibold text-gray-700 hover:bg-black/5 rounded-md truncate dark:text-gray-100 dark:hover:bg-white/10"
              title="点击编辑标题"
            >
              {title || '未命名图表'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {TYPES.map(({ t, label, icon }) => (
            <button
              key={t}
              onClick={() => switchType(t)}
              className={`p-1 rounded-md transition-colors flex items-center gap-0.5 text-[10px] font-medium ${chartType === t ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/25 dark:text-blue-300' : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/10'}`}
              title={label}
            >
              {icon}
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
          {onAiRegenerate && (
            <button onClick={onAiRegenerate} className="p-1 rounded-md text-gray-400 hover:text-fuchsia-500 hover:bg-fuchsia-50 transition-colors dark:hover:bg-fuchsia-500/20" title="用 AI 重新生成">
              <Wand2 size={13} />
            </button>
          )}
          <button onClick={exportPng} className="p-1 rounded-md text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 transition-colors dark:hover:bg-emerald-500/20" title="导出 PNG">
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* 图表区 */}
      <div className="flex-1 overflow-hidden p-2">
        {data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
            暂无数据，请先编辑表格并生成图表
          </div>
        ) : (
          <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full max-h-full">
            {chartType === 'bar' && (
              <>
                {/* 网格线 */}
                {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                  const y = M.top + plotH - r * plotH;
                  return (
                    <g key={r}>
                      <line x1={M.left} y1={y} x2={W - M.right} y2={y} stroke={gridColor} strokeWidth="1" />
                      <text x={M.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill={axisColor}>
                        {Math.round(maxV * r)}
                      </text>
                    </g>
                  );
                })}
                {/* 柱子 */}
                {data.map((d, i) => {
                  const bh = (d.value / maxV) * plotH;
                  const x = M.left + i * barBand + (barBand - barW) / 2;
                  const y = M.top + plotH - bh;
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={barW} height={Math.max(0.5, bh)} rx="3" fill={PALETTE[i % PALETTE.length]} opacity="0.92" />
                      <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fill={textColor} fontWeight="600">
                        {d.value}
                      </text>
                      <text x={x + barW / 2} y={H - M.bottom + 14} textAnchor="middle" fontSize="8.5" fill={axisColor} className="select-none">
                        {String(d.label).slice(0, 8)}
                      </text>
                    </g>
                  );
                })}
              </>
            )}

            {chartType === 'line' && (
              <>
                {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                  const y = M.top + plotH - r * plotH;
                  return (
                    <g key={r}>
                      <line x1={M.left} y1={y} x2={W - M.right} y2={y} stroke={gridColor} strokeWidth="1" />
                      <text x={M.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill={axisColor}>{Math.round(maxV * r)}</text>
                    </g>
                  );
                })}
                <polyline
                  points={data.map((d, i) => `${M.left + (i / Math.max(1, data.length - 1)) * plotW},${M.top + plotH - (d.value / maxV) * plotH}`).join(' ')}
                  fill="none"
                  stroke={PALETTE[0]}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {data.map((d, i) => {
                  const cx = M.left + (i / Math.max(1, data.length - 1)) * plotW;
                  const cy = M.top + plotH - (d.value / maxV) * plotH;
                  return (
                    <g key={i}>
                      <circle cx={cx} cy={cy} r="3.5" fill="#fff" stroke={PALETTE[0]} strokeWidth="2" />
                      <text x={cx} y={cy - 7} textAnchor="middle" fontSize="9" fill={textColor} fontWeight="600">{d.value}</text>
                      <text x={cx} y={H - M.bottom + 14} textAnchor="middle" fontSize="8.5" fill={axisColor} className="select-none">{String(d.label).slice(0, 8)}</text>
                    </g>
                  );
                })}
              </>
            )}

            {chartType === 'pie' && (
              <>
                {(() => {
                  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
                  const cx = W / 2 - 30;
                  const cy = M.top + plotH / 2;
                  const r = Math.min(plotW / 2 - 20, plotH / 2 - 10);
                  let angle = -Math.PI / 2;
                  const arcs = data.map((d, i) => {
                    const frac = Math.max(0, d.value) / total;
                    const a0 = angle;
                    const a1 = angle + frac * Math.PI * 2;
                    angle = a1;
                    const large = frac > 0.5 ? 1 : 0;
                    const x0 = cx + r * Math.cos(a0);
                    const y0 = cy + r * Math.sin(a0);
                    const x1 = cx + r * Math.cos(a1);
                    const y1 = cy + r * Math.sin(a1);
                    return (
                      <g key={i}>
                        <path
                          d={`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`}
                          fill={PALETTE[i % PALETTE.length]}
                          opacity="0.92"
                          stroke="#fff"
                          strokeWidth="1"
                        />
                        <text
                          x={cx + (r / 2) * Math.cos((a0 + a1) / 2)}
                          y={cy + (r / 2) * Math.sin((a0 + a1) / 2)}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize="9" fill="#fff" fontWeight="700"
                        >
                          {Math.round(frac * 100)}%
                        </text>
                      </g>
                    );
                  });
                  // 图例
                  const legend = data.map((d, i) => (
                    <g key={`lg-${i}`}>
                      <rect x={cx + r + 20} y={M.top + 8 + i * 18} width="10" height="10" rx="2" fill={PALETTE[i % PALETTE.length]} />
                      <text x={cx + r + 36} y={M.top + 17 + i * 18} fontSize="9" fill={textColor} className="select-none">
                        {String(d.label).slice(0, 12)}
                      </text>
                    </g>
                  ));
                  return <>{arcs}{legend}</>;
                })()}
              </>
            )}

            {/* 标题文字（导出时使用，页面上方已有标题栏） */}
            <text x={W / 2} y={M.top - 12} textAnchor="middle" fontSize="13" fontWeight="700" fill={textColor}>
              {title}
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}