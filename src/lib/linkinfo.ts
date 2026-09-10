// 浏览器端链接元信息抓取:静态版没有后端,无法直接跨域 fetch 目标页面,
// 因此通过公共 CORS 代理尽力抓取标题/图标。失败静默返回 ok:false。
// Browser-side link metadata fetch — routed through a public CORS proxy because
// the static build has no backend to proxy arbitrary cross-origin pages.

// 可替换/自建 CORS 代理。换掉后应用会改成访问该代理。
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

export interface LinkMeta {
  ok: boolean;
  title?: string;
  favicon?: string;
}

export async function fetchLinkInfo(url: string): Promise<LinkMeta> {
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return { ok: false };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${CORS_PROXY}${encodeURIComponent(clean)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const html = await resp.text();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || '';
    const favicon =
      (html.match(
        /<link[^>]+rel=["']?(?:shortcut\s+)?icon["']?[^>]+href=["']([^"']+)["']/i,
      ) || [])[1] || "";
    let faviconUrl = "";
    try {
      faviconUrl = favicon ? new URL(favicon, clean).href : new URL('/favicon.ico', clean).href;
    } catch {
      faviconUrl = "";
    }
    return { ok: true, title, favicon: faviconUrl };
  } catch {
    return { ok: false };
  }
}