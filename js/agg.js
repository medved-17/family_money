// Агрегации по операциям (все суммы — в базовой валюте)

import { toBase, tipsToBase } from './rates.js';
import { periodRange } from './util.js';
import { visibleExpenses, categoryById } from './store.js';

export function inPeriod(period, extraFilter = {}) {
  const [from, to] = periodRange(period);
  return visibleExpenses().filter(e => {
    const d = new Date(e.spentAt);
    if (d < from || d >= to) return false;
    if (extraFilter.author && e.author !== extraFilter.author) return false;
    if (extraFilter.category && e.category !== extraFilter.category) return false;
    if (extraFilter.currency && e.currency !== extraFilter.currency) return false;
    return true;
  });
}

export function summarize(expenses, base) {
  let total = 0, tips = 0;
  const byCat = new Map(), byAuthor = { sonya: 0, nikita: 0 }, byCur = new Map();
  for (const e of expenses) {
    const v = toBase(e, base);
    const t = tipsToBase(e, base);
    total += v; tips += t;
    byCat.set(e.category, (byCat.get(e.category) || 0) + v);
    byAuthor[e.author] = (byAuthor[e.author] || 0) + v;
    const cur = byCur.get(e.currency) || { orig: 0, base: 0, count: 0 };
    cur.orig += (e.amount || 0) + (e.tips || 0);
    cur.base += v; cur.count++;
    byCur.set(e.currency, cur);
  }
  const cats = [...byCat.entries()]
    .map(([id, value]) => ({ cat: categoryById(id), value }))
    .sort((a, b) => b.value - a.value);
  return { total, tips, cats, byAuthor, byCur, count: expenses.length };
}

// Динамика: по дням для месяца/недели, по месяцам для года/всего
export function series(expenses, period, base) {
  const points = [];
  if (period.mode === 'month' || period.mode === 'week') {
    const [from, to] = periodRange(period);
    const days = Math.min(Math.round((Math.min(to, new Date(2100, 0)) - from) / 86400000), 31);
    const sums = {};
    for (const e of expenses) {
      const d = new Date(e.spentAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      sums[key] = (sums[key] || 0) + toBase(e, base);
    }
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      points.push({ label: String(d.getDate()), value: sums[key] || 0 });
    }
  } else {
    const sums = {};
    let minY = 9999, maxY = 0;
    for (const e of expenses) {
      const d = new Date(e.spentAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      sums[key] = (sums[key] || 0) + toBase(e, base);
      minY = Math.min(minY, d.getFullYear()); maxY = Math.max(maxY, d.getFullYear());
    }
    const MONTH_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    if (period.mode === 'year') { minY = maxY = period.year; }
    if (minY > maxY) { minY = maxY = new Date().getFullYear(); }
    for (let y = minY; y <= maxY; y++) {
      for (let m = 0; m < 12; m++) {
        const label = maxY > minY ? `${MONTH_SHORT[m]}` : MONTH_SHORT[m];
        points.push({ label, value: sums[`${y}-${m}`] || 0 });
      }
    }
    // обрезаем пустые края
    while (points.length && points[0].value === 0) points.shift();
    while (points.length && points[points.length - 1].value === 0) points.pop();
  }
  return points;
}
