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
      fill="var(--ink)" font-family="inherit">${centerTitle}</text>
    <text x="90" y="104" text-anchor="middle" font-size="10.5" font-weight="600"
      fill="var(--ink-2)" font-family="inherit">${centerSub}</text>
  </svg>`;
}

// Столбчатый график динамики: points = [{label, value}], подсветка максимума
export function barChart(points, opts = {}) {
  const W = 340, H = 150, padB = 22, padT = 18;
  const n = points.length || 1;
  const max = Math.max(...points.map(p => p.value), 1);
  const gap = n > 20 ? 2 : 5;
  const bw = (W - gap * (n - 1)) / n;
  const bars = points.map((p, i) => {
    const h = Math.max((p.value / max) * (H - padB - padT), p.value > 0 ? 3 : 1.5);
    const x = i * (bw + gap);
    const y = H - padB - h;
    const isMax = p.value === max && p.value > 0;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"
      rx="${Math.min(bw / 2.5, 5)}" fill="${isMax ? 'var(--accent)' : 'var(--accent-2)'}"
      opacity="${p.value > 0 ? (isMax ? 1 : 0.55) : 0.18}"/>`;
  }).join('');

  // подписи: не чаще каждые ~5 столбцов
  const every = Math.max(1, Math.ceil(n / 7));
  const labels = points.map((p, i) => {
    if (i % every !== 0 && i !== n - 1) return '';
    const x = i * (bw + gap) + bw / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9.5"
      fill="var(--ink-2)" font-family="inherit" font-weight="600">${p.label}</text>`;
  }).join('');

  const maxPoint = points.find(p => p.value === max && p.value > 0);
  const maxLabel = maxPoint
    ? `<text x="${(points.indexOf(maxPoint) * (bw + gap) + bw / 2).toFixed(1)}" y="${padT - 6}"
        text-anchor="middle" font-size="10" font-weight="700" fill="var(--accent)"
        font-family="inherit">${fmtNum(Math.round(max))}</text>`
    : '';

  return `<svg viewBox="0 0 ${W} ${H}" role="img">${bars}${labels}${maxLabel}</svg>`;
}
