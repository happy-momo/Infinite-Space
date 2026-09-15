// 浏览器端链接元信息：尽力而为地抓取 URL 的 <title> 与 favicon。
// GitHub Pages 静态版没有后端代理，直接在前端 fetch 目标站点；受 CORS 限制，
// 仅能在目标允许跨域与同源时成功，失败时静默返回空（不阻塞画布）。
// Best-effort link metadata fetch in the browser (no backend on GitHub Pages).
export async function fetchLinkInfo(url: string): Promise<{ ok: boolean; title: string; favicon: string }> {
  if (!/^https?:\/\//i.test(url)) return { ok: false, title: '', favicon: '' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InfiniteSpace/1.0)' },
    });
    clearTimeout(timer);
    const html = await resp.text();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || '';
    const favicon =
      (html.match(
        /<link[^>]+rel=["']?(?:shortcut\s+)?icon["']?[^>]+href=["']([^"']+)["']/i,
      ) || [])[1] || '';
    let faviconUrl = '';
    try {
      faviconUrl = favicon ? new URL(favicon, url).href : new URL('/favicon.ico', url).href;
    } catch {
      faviconUrl = '';
    }
    return { ok: true, title, favicon: faviconUrl };
  } catch {
    return { ok: false, title: '', favicon: '' };
  }
}