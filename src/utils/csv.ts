// CSV 解析工具：纯前端解析，无依赖。
// 处理引号包裹、转义引号（""）、单元格内换行。
// CSV parsing utilities — dependency-free RFC-4180-ish parser.
import { TableCell } from '../types';

/** 把 CSV 文本解析为二维字符串数组 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
  }
  row.push(cur);
  rows.push(row);
  // 去掉完全空白的行
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** 二维字符串数组 → TableCell 二维数组（首行为表头） */
export function toTableData(rows: string[][]): TableCell[][] {
  if (rows.length === 0) return [];
  return rows.map((r, ri) => r.map((c) => ({ text: c, isHeader: ri === 0 })));
}

/** 把二维字符串数组的每一格尝试转为数字（供图表用） */
export function toNumber(v: string): number | null {
  const t = v.replace(/[¥$￥%,\s]/g, '');
  if (t === '' || isNaN(Number(t))) return null;
  return Number(t);
}