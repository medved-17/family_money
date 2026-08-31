// Пикер-шторка вместо нативных <select>: список опций с галочкой,
// плавное открытие/закрытие. showPicker(...) → Promise<value | null>.

import { I } from './icons.js';
import { escapeHtml } from './util.js';

const $ = id => document.getElementById(id);

// ─── Общий менеджер шторок: плавное открытие и закрытие ───
const openSheets = new Set();

export function openSheet(el) {
  el.classList.remove('hidden', 'closing');
  el.style.transform = ''; el.style.transition = '';
  const backdrop = $('sheet-backdrop');
  backdrop.classList.remove('hidden', 'closing');
  backdrop.style.opacity = '';
  openSheets.add(el);
  document.body.classList.add('no-scroll');
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
    el.style.transform = ''; el.style.transition = '';
    openSheets.delete(el);
    if (last) {
      backdrop.classList.add('hidden');
      backdrop.classList.remove('closing');
      backdrop.style.opacity = '';
      document.body.classList.remove('no-scroll');
    }
  }, 240);
}

// ─── Закрытие шторки свайпом вниз ───
export function makeDraggable(el, onClose) {
  let startX = 0, startY = 0, curY = 0, startT = 0;
  let tracking = false, dragging = false;
  const backdrop = () => $('sheet-backdrop');
  // из вертикально скроллящихся зон и полей ввода шторку не тянем
  const skip = t => t.closest && t.closest('.pick-list, .rates-body, input, textarea, select');

  el.addEventListener('touchstart', (e) => {
    if (el.classList.contains('hidden') || skip(e.target)) return;
    startX = e.touches[0].clientX;
    startY = curY = e.touches[0].clientY;
    startT = Date.now();
    tracking = true; dragging = false;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    curY = y;
    const dx = Math.abs(x - startX), dy = y - startY;
    if (!dragging) {
      if (dx > 14 && dx > dy) { tracking = false; return; } // горизонтальный жест (категории)
      if (dy > 12 && dy > dx) { dragging = true; el.style.transition = 'none'; }
      else return;
    }
    const off = Math.max(0, dy);
    el.style.transform = `translateY(${off}px)`;
    backdrop().style.opacity = String(Math.max(0.25, 1 - off / 500));
  }, { passive: true });

  const finish = () => {
    if (!tracking && !dragging) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    const dy = curY - startY;
    const speed = dy / Math.max(Date.now() - startT, 1);
    if (dy > 130 || (dy > 50 && speed > 0.5)) {
      el.style.transition = 'transform .22s cubic-bezier(.4, 0, .8, .6)';
      el.style.transform = 'translateY(105%)';
      setTimeout(onClose, 200);
    } else {
      el.style.transition = 'transform .28s cubic-bezier(.2, .8, .3, 1)';
      el.style.transform = '';
      backdrop().style.opacity = '';
    }
  };
  el.addEventListener('touchend', finish);
  el.addEventListener('touchcancel', finish);
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
  makeDraggable($('pick-sheet'), () => { cancelPicker(); closeSheet($('pick-sheet')); });
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
