// Утилиты: форматирование, даты, идентификаторы

export const CURRENCIES = ['EUR', 'USD', 'TRY', 'RUB'];
export const CUR_SYMBOL = { EUR: '€', USD: '$', TRY: '₺', RUB: '₽' };

export const AUTHORS = {
  sonya:  { name: 'Соня',   letter: 'С', cssVar: '--sonya' },
  nikita: { name: 'Никита', letter: 'Н', cssVar: '--nikita' },
};

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// 12 345,67 → строка в русской локали, без лишних нулей
export function fmtNum(n, maxFrac = 2) {
  if (!isFinite(n)) return '0';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(n) < 1 && n !== 0 ? 4 : maxFrac,
  }).format(n);
}

export function fmtMoney(n, currency) {
  return `${fmtNum(n)} ${CUR_SYMBOL[currency] || currency}`;
}

// Округление денег до центов
export const round2 = n => Math.round(n * 100) / 100;

const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WEEKDAYS = ['вс','пн','вт','ср','чт','пт','сб'];

export function fmtDay(d) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const y = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}, ${WEEKDAYS[d.getDay()]}`;
}

export function fmtDateShort(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtTime(d) {
  return d.toTimeString().slice(0, 5);
}

export function monthTitle(year, month) {
  const now = new Date();
  const name = MONTHS_NOM[month];
  return year === now.getFullYear() ? name : `${name} ${year}`;
}

// Период: {mode:'month'|'year'|'week'|'all', year, month} → [from, to)
export function periodRange(p) {
  const now = new Date();
  if (p.mode === 'all') return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  if (p.mode === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    return [start, new Date(2100, 0, 1)];
  }
  if (p.mode === 'year') return [new Date(p.year, 0, 1), new Date(p.year + 1, 0, 1)];
  return [new Date(p.year, p.month, 1), new Date(p.year, p.month + 1, 1)];
}

export function periodTitle(p) {
  if (p.mode === 'all') return 'Всё время';
  if (p.mode === 'week') return 'Последние 7 дней';
  if (p.mode === 'year') return String(p.year);
  return monthTitle(p.year, p.month);
}

// datetime-local ↔ Date
export function toLocalInput(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
