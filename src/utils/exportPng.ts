// SVG → PNG 导出工具：把任意 SVG 元素导出为高清 PNG 并触发下载。零依赖。
// Export an SVG element as a hi-res PNG download — dependency-free.
export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const width = Number(svg.getAttribute('width')) || 800;
  const height = Number(svg.getAttribute('height')) || 600;
  const scale = 2; // 2x 像素密度，Retina 清晰

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width * scale));
  clone.setAttribute('height', String(height * scale));
  // 把内联样式内联化，避免外链样式丢失（SVG 经 img 加载时不会应用文档 CSS）
  const nodes = clone.querySelectorAll('*');
  nodes.forEach((n) => {
    const el = n as SVGElement;
    const cs = getComputedStyle(el);
    if (cs.fill) el.style.setProperty('fill', cs.fill);
    if (cs.stroke) el.style.setProperty('stroke', cs.stroke);
    if (cs['font-size']) el.style.setProperty('font-size', cs['font-size']);
    if (cs['font-family']) el.style.setProperty('font-family', cs['font-family']);
    if (cs['font-weight']) el.style.setProperty('font-weight', cs['font-weight']);
  });

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG 图片加载失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取 canvas 上下文');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, width * scale, height * scale);
    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `${filename || 'chart'}.png`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
