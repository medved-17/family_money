// Пикер-шторка вместо нативных <select>: список опций с галочкой,
// плавное открытие/закрытие. showPicker(...) → Promise<value | null>.

import { I } from './icons.js';
import { escapeHtml } from './util.js';

const $ = id => document.getElementById(id);

// ─── Общий менеджер шторок: плавное открытие и закрытие ───
const openSheets = new Set();

export function openSheet(el) {
  el.classList.remove('hidden', 'closing');
  const backdrop = $('sheet-backdrop');
  backdrop.classList.remove('hidden', 'closing');
  openSheets.add(el);
}

export function closeSheet(el) {
  if (el.classList.contains('hidden')) return;
  el.classList.add('closing');
  const backdrop = $('sheet-backdrop');
  const last = openSheets.size <= 1;
  if (last) backdrop.classList.add('closing');
  setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('closing');
    openSheets.delete(el);
    if (last) { backdrop.classList.add('hidden'); backdrop.classList.remove('closing'); }
  }, 240);
}

export function closeAllSheets() {
  cancelPicker();
  [...openSheets].forEach(closeSheet);
}

// ─── Пикер ───
let resolver = null;

export function showPicker({ title, options, value }) {
  return new Promise(resolve => {
    resolver = resolve;
    $('pick-title').textContent = title;
    $('pick-list').innerHTML = options.map(o => `
      <button class="pick-row ${String(o.value) === String(value) ? 'on' : ''}" data-v="${escapeHtml(String(o.value))}">
        <span class="pick-emoji">${o.emoji || ''}</span>
        <span class="pick-label">${escapeHtml(o.label)}
          ${o.sub ? `<span class="pick-sub">${escapeHtml(o.sub)}</span>` : ''}</span>
        <span class="pick-check">${String(o.value) === String(value) ? I.check : ''}</span>
      </button>`).join('');
    openSheet($('pick-sheet'));
  });
}

export function cancelPicker() {
  if (resolver) { resolver(null); resolver = null; }
}

export function initPicker() {
  $('pick-list').addEventListener('click', (e) => {
    const row = e.target.closest('.pick-row');
    if (!row) return;
    const r = resolver; resolver = null;
    closeSheet($('pick-sheet'));
    if (r) r(row.dataset.v);
  });
  $('pick-cancel').addEventListener('click', () => {
    cancelPicker();
    closeSheet($('pick-sheet'));
  });
}
