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

// ─── Свои фиксированные курсы семьи («доллар покупали по 82») ───
// С поддержкой периодов: { USD: [{ from: null, base: 'RUB', value: 82 },
//                                 { from: '2026-08-15', base: 'RUB', value: 85 }] }
// from: null — «с самого начала»; операция берёт курс с самой поздней датой from <= даты покупки.
let customRates = {};

function normalizeCustom(obj) {
  const out = {};
  for (const [cur, v] of Object.entries(obj || {})) {
    let list = Array.isArray(v) ? v : (v && v.value > 0 ? [{ from: null, base: v.base, value: v.value }] : []);
    list = list.filter(e => e && e.value > 0 && e.base);
    list.sort((a, b) => ((a.from || '') < (b.from || '') ? -1 : 1));
    if (list.length) out[cur] = list;
  }
  return out;
}

export function setCustomRates(obj) { customRates = normalizeCustom(obj); }

export function getCustomRateList(cur, base) {
  return (customRates[cur] || []).filter(e => e.base === base);
}

// Курс валюты на конкретную дату (when — ISO-строка; по умолчанию сегодня)
export function getCustomRate(cur, base, when) {
  const list = getCustomRateList(cur, base);
  if (!list.length) return null;
  const day = (when || new Date().toISOString()).slice(0, 10);
  let best = null;
  for (const e of list) {
    if (!e.from || e.from <= day) {
      if (!best || (e.from || '') >= (best.from || '')) best = e;
    }
  }
  return best ? best.value : null;
}

// Итоговый курс операции: ручной у операции → свой курс семьи на дату покупки → рыночный снимок
export function effectiveRate(expense, base) {
  if (expense.currency === base) return 1;
  if (expense.manualRate && expense.manualRate.base === base) return expense.manualRate.value;
  const custom = getCustomRate(expense.currency, base, expense.spentAt);
  if (custom) return custom;
  return rateToBase(expense.rates, expense.currency, base);
}

// Сумма операции в базовой валюте
export function toBase(expense, base) {
  return ((expense.amount || 0) + (expense.tips || 0)) * effectiveRate(expense, base);
}
export function amountToBase(expense, base) { return (expense.amount || 0) * effectiveRate(expense, base); }
export function tipsToBase(expense, base) { return (expense.tips || 0) * effectiveRate(expense, base); }
