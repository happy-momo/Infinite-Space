// 图表节点：根据 ChartConfig 用纯 SVG 绘制柱状/折线/饼图。
// 支持多序列、单位标注、数据洞察、类型切换、标题编辑、导出 PNG。
// Chart node — pure-SVG bar/line/pie rendering from ChartConfig, with multi-series,
// unit annotation, AI insight, type switch and PNG export.
import { useEffect, useRef, useState } from 'react';
import { BarChart3, LineChart, PieChart, Download, Wand2, Sparkles } from 'lucide-react';
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

type Pt = { label: string; value: number; series?: string };

export function ChartNode({ node, onUpdate, onTransactionStart, onAiRegenerate }: Props) {
  const cfg: ChartConfig = node.chartConfig || { chartType: 'bar', data: [] };
  const svgRef = useRef<SVGSVGElement>(null);
  const [title, setTitle] = useState(cfg.title || '');
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  useEffect(() => { setTitle(cfg.title || ''); }, [cfg.title]);

  const data = cfg.data || [];
  const chartType: Exclude<ChartType, 'auto'> = cfg.chartType === 'auto' ? 'bar' : (cfg.chartType as Exclude<ChartType, 'auto'>);
  const unit = cfg.unit;
  const insight = cfg.insight;

  // 系列：优先用配置的 series；退化时从数据里取 distinct 值。>1 即为多序列。
  const seriesNames: string[] =
    cfg.series && cfg.series.length
      ? cfg.series
      : [...new Set(data.map((d) => d.series).filter((s): s is string => !!s))];
  const multi = seriesNames.length > 1;

  const switchType = (t: Exclude<ChartType, 'auto'>) => {
    onTransactionStart();
    onUpdate(node.id, { chartConfig: { ...cfg, chartType: t } });
  };

  const exportPng = async () => {
    if (!svgRef.current) return;
    await downloadSvgAsPng(svgRef.current, cfg.title || 'chart');
  };

  // 多序列时顶栏加高，给图例让出空间
  const top = multi ? 56 : 34;
  const plotW = W - M.left - M.right;
  const plotH = H - top - M.bottom;

  const values = data.map((d) => d.value);
  const maxV = Math.max(...values, 0.0001);

  // 类别（按出现顺序去重）；条带/柱宽按类别数计算
  const cats: string[] = [];
  const catSeen = new Set<string>();
  for (const d of data) {
    const k = String(d.label);
    if (!catSeen.has(k)) { catSeen.add(k); cats.push(k); }
  }
  const barBand = plotW / Math.max(1, cats.length);
  const barW = Math.min(34, barBand * 0.55);

  // 数值点查找：多序列按 series 匹配，单序列取该类别第一个
  const pointFor = (cat: string, s?: string): Pt | undefined =>
    multi
      ? data.find((d) => String(d.label) === cat && d.series === s && isFinite(d.value))
      : data.find((d) => String(d.label) === cat && isFinite(d.value));
  const xFor = (i: number) => M.left + (i / Math.max(1, cats.length - 1)) * plotW;

  // 单位标注：给定数字带单位显示（保留最多两位小数）
  const fmt = (v: number) => {
    const n = Math.round(v * 100) / 100;
    return unit ? `${n}${unit}` : `${n}`;
  };

  const isDark = document.documentElement.classList.contains('dark');
  const axisColor = isDark ? '#64748b' : '#94a3b8';
  const textColor = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)';

  const gridLines = (plotHeight: number, topPad: number, showVal: boolean) =>
    [0, 0.25, 0.5, 0.75, 1].map((r) => {
      const y = topPad + plotHeight - r * plotHeight;
      return (
        <g key={r}>
          <line x1={M.left} y1={y} x2={W - M.right} y2={y} stroke={gridColor} strokeWidth="1" />
          <text x={M.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill={axisColor}>
            {showVal ? fmt(maxV * r) : Math.round(maxV * r)}
          </text>
        </g>
      );
    });

  // 图例（多序列 bar/line），画在顶部预留带
  const legend = multi && chartType !== 'pie' ? (
    <g>
      {seriesNames.map((sn, si) => (
        <g key={sn}>
          <rect x={M.left + si * 110} y={8} width="10" height="10" rx="2" fill={PALETTE[si % PALETTE.length]} />
          <text x={M.left + si * 110 + 14} y={17} fontSize="9" fill={textColor} className="select-none">
            {String(sn).slice(0, 10)}
          </text>
        </g>
      ))}
    </g>
  ) : null;

  // ---- 柱状图 ----
  const barChart = (
    <>
      {gridLines(plotH, top, true)}
      {/* 类别刻度 */}
      {cats.map((cat, ci) => {
        const cx = M.left + (ci + 0.5) * barBand;
        return (
          <text key={cat} x={cx} y={H - M.bottom + 14} textAnchor="middle" fontSize="8.5" fill={axisColor} className="select-none">
            {String(cat).slice(0, 8)}
          </text>
        );
      })}
      {multi ? (
        // 多序列：组内并排子柱
        <>
          {cats.map((cat, ci) => {
            const cx = M.left + (ci + 0.5) * barBand;
            const subW = (barBand * 0.7) / seriesNames.length;
            return seriesNames.map((sn, si) => {
              const p = pointFor(cat, sn);
              const v = p ? p.value : 0;
              const x = cx - (seriesNames.length * subW) / 2 + si * subW;
              const bh = (v / maxV) * plotH;
              return (
                <rect key={`${cat}-${sn}`} x={x} y={top + plotH - bh} width={Math.max(0.5, subW)} height={Math.max(0.5, bh)} rx="2" fill={PALETTE[si % PALETTE.length]} opacity="0.92" />
              );
            });
          })}
        </>
      ) : (
        // 单序列
        <>
          {cats.map((cat, ci) => {
            const p = pointFor(cat);
            const v = p ? p.value : 0;
            const x = M.left + ci * barBand + (barBand - barW) / 2;
            const y = top + plotH - (v / maxV) * plotH;
            return (
              <g key={cat}>
                <rect x={x} y={y} width={barW} height={Math.max(0.5, (v / maxV) * plotH)} rx="3" fill={PALETTE[ci % PALETTE.length]} opacity="0.92" />
                <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fill={textColor} fontWeight="600">{fmt(v)}</text>
              </g>
            );
          })}
        </>
      )}
    </>
  );

  // ---- 折线图 ----
  const lineSeries = (si: number, sn: string, showVal: boolean) => {
    // 按类别拆段，缺失值处断开
    const segs: { i: number; v: number }[][] = [];
    let cur: { i: number; v: number }[] = [];
    cats.forEach((cat, ci) => {
      const p = pointFor(cat, sn);
      if (p) { cur.push({ i: ci, v: p.value }); } else if (cur.length) { segs.push(cur); cur = []; }
    });
    if (cur.length) segs.push(cur);
    const color = PALETTE[si % PALETTE.length];
    return (
      <g key={sn}>
        {segs.map((seg, k) => (
          <polyline
            key={k}
            points={seg.map((pt) => `${xFor(pt.i)},${top + plotH - (pt.v / maxV) * plotH}`).join(' ')}
            fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          />
        ))}
        {segs.flatMap((seg, k) =>
          seg.map((pt, j) => {
            const cx = xFor(pt.i);
            const cy = top + plotH - (pt.v / maxV) * plotH;
            return (
              <g key={`${k}-${j}`}>
                <circle cx={cx} cy={cy} r={(multi ? 3 : 3.8)} fill="#fff" stroke={color} strokeWidth="2" />
                {showVal && (
                  <text x={cx} y={cy - 7} textAnchor="middle" fontSize="9" fill={textColor} fontWeight="600">{fmt(pt.v)}</text>
                )}
              </g>
            );
          }),
        )}
      </g>
    );
  };

  const lineChart = (
    <>
      {gridLines(plotH, top, true)}
      {cats.map((cat, ci) => (
        <text key={cat} x={xFor(ci)} y={H - M.bottom + 14} textAnchor="middle" fontSize="8.5" fill={axisColor} className="select-none">
          {String(cat).slice(0, 8)}
        </text>
      ))}
      {multi
        ? seriesNames.map((sn, si) => lineSeries(si, sn, false))
        : lineSeries(0, seriesNames[0] || '', true)}
    </>
  );

  // ---- 饼图（多序列仅展示首系列）----
  const pieData = multi ? data.filter((d) => d.series === seriesNames[0]) : data;
  const effectivePie = pieData.length ? pieData : data;
  const pieChart = (() => {
    const total = effectivePie.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
    const cx = W / 2 - 30;
    const cy = top + plotH / 2;
    const r = Math.min(plotW / 2 - 20, plotH / 2 - 10);
    let angle = -Math.PI / 2;
    const arcs = effectivePie.map((d, i) => {
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
          <path d={`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`} fill={PALETTE[i % PALETTE.length]} opacity="0.92" stroke="#fff" strokeWidth="1" />
          <text x={cx + (r / 2) * Math.cos((a0 + a1) / 2)} y={cy + (r / 2) * Math.sin((a0 + a1) / 2)} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#fff" fontWeight="700">
            {Math.round(frac * 100)}%
          </text>
        </g>
      );
    });
    // 图例
    const lg = effectivePie.map((d, i) => (
      <g key={`lg-${i}`}>
        <rect x={cx + r + 20} y={top + 8 + i * 18} width="10" height="10" rx="2" fill={PALETTE[i % PALETTE.length]} />
        <text x={cx + r + 36} y={top + 17 + i * 18} fontSize="9" fill={textColor} className="select-none">
          {String(d.label).slice(0, 12)}
        </text>
      </g>
    ));
    const note = multi ? (
      <text x={cx} y={H - M.bottom + 30} textAnchor="middle" fontSize="8.5" fill={axisColor} className="select-none">
        多系列饼图仅展示首系列
      </text>
    ) : null;
    return <>{arcs}{lg}{note}</>;
  })();

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
      <div className="flex-1 overflow-hidden p-2 flex flex-col">
        {data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
            暂无数据，请先编辑表格并生成图表
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full max-h-full">
                {chartType === 'bar' && barChart}
                {chartType === 'line' && lineChart}
                {chartType === 'pie' && pieChart}
                {/* 顶部标题（导出时使用） */}
                <text x={W / 2} y={top - 12} textAnchor="middle" fontSize="13" fontWeight="700" fill={textColor}>
                  {title}
                </text>
                {/* 多序列图例（bar/line） */}
                {legend}
              </svg>
            </div>
            {insight && (
              <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-indigo-500 dark:text-indigo-300 border-t border-black/5 dark:border-white/10 pt-1 truncate" title={insight}>
                <Sparkles size={10} className="shrink-0" />
                <span className="truncate">AI 洞察：{insight}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}