// PDF-отчёт без зависимостей: страницы рисуются на canvas (полная поддержка кириллицы
// системным шрифтом), затем упаковываются как JPEG-страницы в минимальный PDF-файл.

const A4 = { w: 595.28, h: 841.89 };   // pt
const PX_W = 1240;                      // ширина canvas (≈150 dpi)
const PX_H = Math.round(PX_W * A4.h / A4.w);

// ─── Сборка PDF из JPEG-страниц ───
function jpegBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function buildPdfFromCanvases(canvases) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    pos += bytes.length;
  };
  const beginObj = (n) => { offsets[n] = pos; push(`${n} 0 obj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const nPages = canvases.length;
  // нумерация: 1 catalog, 2 pages, затем на страницу: page, contents, image
  const pageObj = i => 3 + i * 3;

  beginObj(1); push(`<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  beginObj(2);
  push(`<< /Type /Pages /Count ${nPages} /Kids [${canvases.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>\nendobj\n`);

  canvases.forEach((cv, i) => {
    const img = jpegBytes(cv.toDataURL('image/jpeg', 0.88));
    const pn = pageObj(i), cn = pn + 1, xn = pn + 2;
    beginObj(pn);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] ` +
      `/Resources << /XObject << /Im${i} ${xn} 0 R >> >> /Contents ${cn} 0 R >>\nendobj\n`);
    const content = `q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im${i} Do Q`;
    beginObj(cn);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    beginObj(xn);
    push(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);
    push(img);
    push('\nendstream\nendobj\n');
  });

  const totalObjs = 2 + nPages * 3;
  const xrefPos = pos;
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= totalObjs; n++) {
    xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  }
  push(xref);
  push(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
}

// ─── Рисовалка отчёта ───
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const INK = '#1d1c19', INK2 = '#85806f', ACCENT = '#1e6e5a', LINE = '#e8e6df';

export class ReportPainter {
  constructor() {
    this.pages = [];
    this.newPage();
  }
  newPage() {
    const cv = document.createElement('canvas');
    cv.width = PX_W; cv.height = PX_H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PX_W, PX_H);
    this.pages.push(cv);
    this.ctx = ctx;
    this.y = 90;
    this.left = 90; this.right = PX_W - 90;
    if (this.pages.length > 1) {
      this.text(`Наши деньги — стр. ${this.pages.length}`, this.left, 60, 22, INK2);
      this.y = 110;
    }
  }
  need(h) { if (this.y + h > PX_H - 80) this.newPage(); }
  text(str, x, y, size = 26, color = INK, weight = 400, align = 'left') {
    const c = this.ctx;
    c.fillStyle = color;
    c.font = `${weight} ${size}px ${FONT}`;
    c.textAlign = align;
    c.textBaseline = 'alphabetic';
    c.fillText(str, x, y);
    c.textAlign = 'left';
  }
  line(y) {
    const c = this.ctx;
    c.strokeStyle = LINE; c.lineWidth = 2;
    c.beginPath(); c.moveTo(this.left, y); c.lineTo(this.right, y); c.stroke();
  }
  title(t, sub) {
    this.text(t, this.left, this.y, 52, INK, 800);
    this.y += 44;
    if (sub) { this.text(sub, this.left, this.y, 26, INK2, 600); this.y += 30; }
    this.y += 20;
  }
  sectionHead(t) {
    this.need(90);
    this.y += 34;
    this.text(t, this.left, this.y, 32, ACCENT, 800);
    this.y += 16;
    this.line(this.y);
    this.y += 34;
  }
  kv(label, value, big = false) {
    const size = big ? 34 : 27;
    this.need(size + 18);
    this.text(label, this.left, this.y, size, big ? INK : INK2, big ? 700 : 500);
    this.text(value, this.right, this.y, size, INK, big ? 800 : 700, 'right');
    this.y += size + (big ? 18 : 14);
  }
  row(cols, widths, opts = {}) {
    // cols: строки; widths: доли ширины; последняя колонка выравнивается вправо
    const size = opts.size || 23;
    this.need(size + 14);
    const total = this.right - this.left;
    let x = this.left;
    cols.forEach((txt, i) => {
      const w = widths[i] * total;
      const last = i === cols.length - 1;
      const c = this.ctx;
      c.font = `${opts.bold ? 700 : 400} ${size}px ${FONT}`;
      let s = String(txt);
      while (c.measureText(s).width > w - 14 && s.length > 2) s = s.slice(0, -2);
      if (s !== String(txt)) s += '…';
      this.text(s, last ? x + w : x, this.y, size, opts.color || INK, opts.bold ? 700 : 400, last ? 'right' : 'left');
      x += w;
    });
    this.y += size + 12;
    if (opts.underline) { this.line(this.y - size - 2 + size); }
  }
}
