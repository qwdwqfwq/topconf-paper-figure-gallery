// Import the measured object list used by the desktop reconstruction. Photo
// crops are regenerated from the user's bitmap, so the scene stays portable.
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const paint = value => !value || /^#(?:[0-9a-f]{6})00$/i.test(value) ? 'none' : value;

function bitmapImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('原始位图无法读取'));
    image.src = dataUrl;
  });
}

export async function importDesktopScene(input, bitmapDataUrl) {
  const source = typeof input === 'string' ? JSON.parse(input) : input;
  if (!source || !Array.isArray(source.objects) || !Array.isArray(source.canvas_px))
    throw new Error('需要包含 canvas_px 和 objects 的桌面端场景 JSON');
  const [width, height] = source.canvas_px.map(Number);
  if (!(width > 0 && height > 0)) throw new Error('场景画布尺寸无效');
  const image = await bitmapImage(bitmapDataUrl);
  // Desktop scenes can include a few pixels of white page margin. Preserve
  // top-left image coordinates instead of scaling every measured object.
  if (image.naturalWidth > width || image.naturalHeight > height ||
      width - image.naturalWidth > width * .01 || height - image.naturalHeight > height * .01)
    throw new Error(`原图尺寸 ${image.naturalWidth}×${image.naturalHeight} 与场景 ${width}×${height} 不一致`);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width; sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d');
  sourceContext.fillStyle = '#ffffff'; sourceContext.fillRect(0, 0, width, height);
  sourceContext.drawImage(image, 0, 0);
  const nodes = [];
  for (let i = 0; i < source.objects.length; i++) {
    const item = source.objects[i];
    const base = { id: item.id || `desktop_${i + 1}`, x: numeric(item.x), y: numeric(item.y), w: numeric(item.w), h: numeric(item.h) };
    if (item.kind === 'image') {
      const crop = item.crop;
      if (!Array.isArray(crop) || crop.length !== 4) throw new Error(`图片 ${base.id} 缺少 crop 坐标`);
      const [x0, y0, x1, y1] = crop.map(Number);
      if (x0 < 0 || y0 < 0 || x1 > width || y1 > height || x1 <= x0 || y1 <= y0)
        throw new Error(`图片 ${base.id} 的 crop 坐标超出原图`);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(base.w * 3));
      canvas.height = Math.max(1, Math.round(base.h * 3));
      canvas.getContext('2d').drawImage(sourceCanvas, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
      nodes.push({ ...base, type: 'image', href: canvas.toDataURL('image/png'), sourceCrop: crop });
    } else if (item.kind === 'text') {
      nodes.push({ ...base, type: 'text', text: String(item.text || ''), fontSize: numeric(item.size, 16), fontFamily: item.font || 'Times New Roman', fill: paint(item.color) || '#111111', bold: !!item.bold, italic: !!item.italic, anchor: item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start', verticalAlign: 'middle' });
    } else if (item.kind === 'box' || item.kind === 'ellipse') {
      nodes.push({ ...base, type: item.kind === 'box' ? 'rect' : 'ellipse', fill: paint(item.fill), stroke: paint(item.line), strokeWidth: numeric(item.weight, 1), radius: item.rounded ? Math.min(base.w, base.h) * .13 : 0 });
    } else if (item.kind === 'line') {
      nodes.push({ id: base.id, type: 'line', x: numeric(item.x1), y: numeric(item.y1), x2: numeric(item.x2), y2: numeric(item.y2), stroke: paint(item.color), strokeWidth: numeric(item.weight, 1), dash: !!item.dash });
    } else if (item.kind === 'polygon') {
      nodes.push({ id: base.id, type: 'polyline', points: (item.points || []).map(p => `${numeric(p[0])},${numeric(p[1])}`).join(' '), closed: true, fill: paint(item.fill), stroke: paint(item.line), strokeWidth: numeric(item.weight, 1) });
    } else throw new Error(`不支持的桌面对象类型：${item.kind}`);
  }
  return { schema: 'figureforge.scene.v3', canvas: { width, height, w: width, h: height }, nodes, origin: 'desktop-measured-scene' };
}
