// SVG-графики без зависимостей

import { fmtNum } from './util.js';

// Кольцевая диаграмма по категориям: segments = [{value, color, emoji}]
export function donutChart(segments, centerTitle, centerSub) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  const rings = segments.map(s => {
    const frac = s.value / total;
    const len = Math.max(frac * C - 3, 0.5);
    const el = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${s.color}"
      stroke-width="20" stroke-dasharray="${len} ${C - len}"
      stroke-dashoffset="${-offset}" stroke-linecap="round"/>`;
    offset += frac * C;
    return el;
  }).join('');
  return `<svg viewBox="0 0 180 180" role="img">
    <g transform="rotate(-90 90 90)">${rings}</g>
    <text x="90" y="86" text-anchor="middle" font-size="19" font-weight="800"
      fill="var(--ink)" style="font-family:var(--mono)">${centerTitle}</text>
    <text x="90" y="104" text-anchor="middle" font-size="10.5" font-weight="600"
      fill="var(--ink-2)" style="font-family:var(--mono)">${centerSub}</text>
  </svg>`;
}

// Столбчатый график динамики: points = [{label, value}].
// Максимум подсвечен по умолчанию; тап по столбцу подсвечивает его и показывает сумму.
export function barChart(points, opts = {}) {
  const W = 340, H = 150, padB = 22, padT = 18;
  const n = points.length || 1;
  const max = Math.max(...points.map(p => p.value), 1);
  const gap = n > 20 ? 2 : 5;
  const bw = (W - gap * (n - 1)) / n;
  const colW = bw + gap;
  // индекс столбца, подсвеченного по умолчанию (максимум)
  const selIdx = points.reduce((mi, p, i) => (p.value > (points[mi]?.value ?? -1) ? i : mi), 0);

  const cols = points.map((p, i) => {
    const h = Math.max((p.value / max) * (H - padB - padT), p.value > 0 ? 3 : 1.5);
    const x = i * colW;
    const y = H - padB - h;
    const op = p.value > 0 ? 0.55 : 0.18;                 // базовая прозрачность (бледно-красный)
    const isSel = i === selIdx && p.value > 0;
    const rx = Math.min(bw / 2.5, 5);

    // подпись суммы: у краёв прижимаем к краю столбца, чтобы не обрезалась
    const cx = x + bw / 2;
    let lx = cx, anchor = 'middle';
    if (cx < 18) { lx = x; anchor = 'start'; }
    else if (cx > W - 18) { lx = x + bw; anchor = 'end'; }
    const ly = Math.max(y - 5, 10);

    return `<g class="bar-col" data-i="${i}">
      <rect x="${x.toFixed(1)}" y="0" width="${colW.toFixed(1)}" height="${H}" fill="transparent" pointer-events="all" style="cursor:pointer"/>
      <rect class="bar" data-op="${op}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"
        rx="${rx}" fill="${isSel ? 'var(--accent)' : 'var(--accent-2)'}" opacity="${isSel ? 1 : op}"/>
      <text class="bar-val" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="10" font-weight="700"
        fill="var(--accent)" style="font-family:var(--mono)" opacity="${isSel ? 1 : 0}">${fmtNum(Math.round(p.value))}</text>
    </g>`;
  }).join('');

  // подписи оси: не чаще ~каждые 7 столбцов
  const every = Math.max(1, Math.ceil(n / 7));
  const labels = points.map((p, i) => {
    if (i % every !== 0 && i !== n - 1) return '';
    const x = i * colW + bw / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9.5"
      fill="var(--ink-2)" style="font-family:var(--mono)" font-weight="600">${p.label}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img">${cols}${labels}</svg>`;
}
