// Курсы валют. Источник: open.er-api.com (бесплатно, без ключа, CORS открыт).
// У каждой операции сохраняется снимок курсов на момент записи (единиц валюты за 1 USD),
// поэтому история не пересчитывается задним числом и смена базовой валюты безопасна (CUR-03..06).

import { CURRENCIES } from './util.js';

const LS_KEY = 'fm-rates';
const MAX_AGE_MS = 12 * 3600 * 1000;

// Резервные курсы на случай самого первого запуска без сети
const FALLBACK = { ts: 0, perUSD: { USD: 1, EUR: 0.92, TRY: 41.0, RUB: 88.0 } };

export function getCachedRates() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* повреждённый кэш */ }
  return FALLBACK;
}

export async function refreshRates(force = false) {
  const cached = getCachedRates();
  if (!force && Date.now() - cached.ts < MAX_AGE_MS) return cached;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (data.result !== 'success') throw new Error('bad payload');
    const perUSD = { USD: 1 };
    for (const c of CURRENCIES) {
      if (data.rates[c]) perUSD[c] = data.rates[c];
    }
    const fresh = { ts: Date.now(), perUSD };
    localStorage.setItem(LS_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return cached; // офлайн — используем последний известный снимок (CUR-06)
  }
}

// Снимок для сохранения в операции
export function currentSnapshot() {
  return { ...getCachedRates().perUSD };
}

// Сколько base за 1 единицу cur, по снимку операции
export function rateToBase(snapshot, cur, base) {
  const s = snapshot && snapshot[cur] && snapshot[base] ? snapshot : FALLBACK.perUSD;
  const perUSD = s[cur] ? s : FALLBACK.perUSD;
  return (perUSD[base] || 1) / (perUSD[cur] || 1);
}

// Сумма операции в базовой валюте (учитывает ручной курс)
export function toBase(expense, base) {
  const amt = (expense.amount || 0) + (expense.tips || 0);
  return convert(expense, amt, base);
}
export function amountToBase(expense, base) { return convert(expense, expense.amount || 0, base); }
export function tipsToBase(expense, base) { return convert(expense, expense.tips || 0, base); }

function convert(expense, amt, base) {
  if (expense.currency === base) return amt;
  if (expense.manualRate && expense.manualRate.base === base) {
    return amt * expense.manualRate.value;
  }
  return amt * rateToBase(expense.rates, expense.currency, base);
}
