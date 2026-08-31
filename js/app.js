// Точка входа: онбординг, навигация, привязка событий

import { initStore, state, subscribe, checkSharedPassword, setUnlocked, setProfile, addCategory, saveSettings, saveBalances, saveWallet, deleteExpense } from './store.js';
import { refreshRates } from './rates.js';
import { initSync, syncState } from './sync.js';
import {
  ui, shiftMonth, renderHome, renderHistory, renderStats,
  sheet, openAddSheet, closeAddSheet, renderSheet, keypadPress, saveSheet, deleteSheetExpense,
  setSheetKind, cycleHomeCurrency,
  statsExpensesAndPeriod, historyExpenses,
} from './ui.js';
import { renderSettings } from './settings.js';
import { exportXlsx, exportPdf } from './export.js';
import { toast, periodTitle, CUR_SYMBOL, CURRENCIES, fmtDay, fmtTime, toLocalInput } from './util.js';
import { I } from './icons.js';
import { showPicker, openSheet, closeSheet, closeAllSheets, initPicker, makeDraggable } from './picker.js';
import { getCustomRate } from './rates.js';

const $ = id => document.getElementById(id);

// Разложить SVG-иконки по статичной разметке
function injectIcons() {
  document.querySelectorAll('.tab[data-ico]').forEach(t => {
    t.insertAdjacentHTML('afterbegin', I[t.dataset.ico]);
  });
  $('fab-add').innerHTML = I.plus;
  document.querySelectorAll('.period-arrow').forEach(b => {
    b.innerHTML = b.dataset.dir === '-1' ? I.back : I.fwd;
  });
  document.querySelector('#keypad [data-k="back"]').innerHTML = I.back;
  document.querySelectorAll('.date-chip').forEach(el => el.insertAdjacentHTML('afterbegin', I.calendar));
  $('stats-export-btn').innerHTML = I.download;
  $('export-xlsx').insertAdjacentHTML('afterbegin', I.table);
  $('export-pdf').insertAdjacentHTML('afterbegin', I.doc);
  $('home-card-prev').innerHTML = I.back;
  $('home-card-next').innerHTML = I.fwd;
  $('home-balance-edit').innerHTML = I.pencil;
}

let currentScreen = 'home';

// ─── Навигация ───
function showScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.screen === name));
  render(name);
  window.scrollTo(0, 0);
}

function render(what = currentScreen) {
  if (!state.ready) return;
  if (what === 'home' || what === 'all') renderHome();
  if (what === 'history' || what === 'all') renderHistory();
  if (what === 'stats' || what === 'all') renderStats();
  if (what === 'settings' || what === 'all') renderSettings();
}

function updateHeroNav() {
  const c = $('home-card-carousel');
  const wrap = c.closest('.hero-carousel-wrap');
  const atEnd = c.scrollLeft > c.clientWidth * 0.5;
  wrap.classList.toggle('at-start', !atEnd);
  wrap.classList.toggle('at-end', atEnd);
}

function parseMoneyInput(value) {
  const clean = String(value || '').replace(',', '.').replace(/\s/g, '');
  if (!clean) return 0;
  return parseFloat(clean);
}

let balanceDate = null;   // дата остатка (asOf); null = сейчас

function renderBalanceSheet() {
  const src = state.settings.balances || {};
  for (const cur of ['USD', 'TRY', 'RUB', 'EUR']) {
    $(`balance-${cur}`).value = src[cur] ? String(src[cur]).replace('.', ',') : '';
  }
  $('balance-date-text').textContent = balanceDate
    ? `${fmtDay(balanceDate)} ${fmtTime(balanceDate)}` : 'Сейчас';
}

function openBalanceSheet() {
  balanceDate = state.settings.balanceAsOf ? new Date(state.settings.balanceAsOf) : null;
  $('balance-date').value = toLocalInput(balanceDate || new Date());
  renderBalanceSheet();
  openSheet($('balance-sheet'));
  setTimeout(() => $('balance-USD').focus(), 180);
}

function bindHistorySwipeDelete() {
  const list = $('history-list');
  let swipe = null;

  list.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.tx-row');
    if (!row || !list.contains(row)) return;
    swipe = {
      row,
      pointerId: e.pointerId,
      id: row.dataset.tx,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dragging: false,
    };
    try { row.setPointerCapture(e.pointerId); } catch { /* не критично */ }
    row.classList.add('swiping');
  });

  list.addEventListener('pointermove', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.startX;
    const dy = e.clientY - swipe.startY;
    if (!swipe.dragging && Math.abs(dy) > Math.abs(dx)) return;
    if (dx >= 0) return;
    swipe.dragging = true;
    swipe.dx = Math.max(dx, -104);
    swipe.row.style.transform = `translateX(${swipe.dx}px)`;
  }, { passive: true });

  async function finishSwipe() {
    if (!swipe) return;
    const { row, pointerId, id, dx, dragging } = swipe;
    swipe = null;
    try { row.releasePointerCapture(pointerId); } catch { /* не критично */ }
    row.classList.remove('swiping');
    if (!dragging) {
      row.style.transform = '';
      return;
    }
    row.dataset.swipedUntil = String(Date.now() + 500);
    if (dx < -72 && confirm('Удалить эту покупку? Она исчезнет на обоих телефонах.')) {
      await deleteExpense(id);
      toast('Покупка удалена');
    } else {
      row.style.transform = '';
    }
  }

  list.addEventListener('pointerup', finishSwipe);
  list.addEventListener('pointercancel', finishSwipe);
}

// ─── Онбординг ───
async function runOnboarding() {
  const needPassword = !state.unlocked;
  const needProfile = !state.profile;
  if (!needPassword && !needProfile) return;

  $('onboarding').classList.remove('hidden');
  $('app').classList.add('hidden');

  if (needPassword) {
    $('ob-password-label').textContent = 'Пароль';
    $('ob-password-hint').textContent = 'Общий пароль на двоих. Введите его, чтобы войти.';
    $('ob-password-btn').textContent = 'Войти';

    await new Promise(resolve => {
      $('ob-password-form').onsubmit = async (e) => {
        e.preventDefault();
        const value = $('ob-password-input').value;
        if (!(await checkSharedPassword(value))) {
          $('ob-password-error').classList.remove('hidden');
          return;
        }
        await setUnlocked(true);
        resolve();
      };
    });
    $('ob-password').classList.add('hidden');
  } else {
    $('ob-password').classList.add('hidden');
  }

  if (needProfile || !state.profile) {
    $('ob-profile').classList.remove('hidden');
    await new Promise(resolve => {
      document.querySelectorAll('.profile-card').forEach(btn => {
        btn.onclick = async () => { await setProfile(btn.dataset.profile); resolve(); };
      });
    });
  }

  $('onboarding').classList.add('hidden');
}

// ─── Привязка событий ───
function bindEvents() {
  // табы
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => showScreen(t.dataset.screen)));
  document.querySelectorAll('[data-goto]').forEach(b =>
    b.addEventListener('click', () => showScreen(b.dataset.goto)));

  // периоды
  $('home-period-nav').querySelectorAll('.period-arrow').forEach(b =>
    b.addEventListener('click', () => { shiftMonth(ui.homePeriod, +b.dataset.dir); renderHome(); }));
  $('home-period-label').addEventListener('click', () => {
    ui.homePeriod = { mode: 'month', year: new Date().getFullYear(), month: new Date().getMonth() };
    renderHome();
  });
  $('stats-period-nav').querySelectorAll('.period-arrow').forEach(b =>
    b.addEventListener('click', () => { shiftMonth(ui.statsPeriod, +b.dataset.dir); renderStats(); }));
  $('stats-seg').querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => {
      ui.statsMode = b.dataset.mode;
      if (b.dataset.mode === 'year') ui.statsPeriod = { mode: 'year', year: new Date().getFullYear() };
      if (b.dataset.mode === 'month') ui.statsPeriod = { mode: 'month', year: new Date().getFullYear(), month: new Date().getMonth() };
      renderStats();
    }));

  // фильтры истории — красивые пикеры вместо нативных селектов
  const f = ui.historyFilter;
  $('f-period-chip').addEventListener('click', async () => {
    const v = await showPicker({
      title: 'Период', value: f.period,
      options: [
        { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' },
        { value: 'year', label: 'Год' }, { value: 'all', label: 'Всё время' },
      ],
    });
    if (v !== null) { f.period = v; renderHistory(); }
  });
  $('f-author-chip').addEventListener('click', async () => {
    const v = await showPicker({
      title: 'Кто тратил', value: f.author,
      options: [
        { value: '', label: 'Оба' },
        { value: 'sonya', label: 'Соня' },
        { value: 'nikita', label: 'Никита' },
      ],
    });
    if (v !== null) { f.author = v; renderHistory(); }
  });
  $('f-cat-chip').addEventListener('click', async () => {
    const v = await showPicker({
      title: 'Категория', value: f.category,
      options: [
        { value: '', label: 'Все категории' },
        ...state.categories.filter(c => !c.deleted).map(c =>
          ({ value: c.id, label: c.name, emoji: c.emoji })),
      ],
    });
    if (v !== null) { f.category = v; renderHistory(); }
  });
  $('f-cur-chip').addEventListener('click', async () => {
    const hidden = state.settings.hiddenCurrencies || [];
    const used = new Set(state.expenses.filter(e => !e.deleted).map(e => e.currency));
    const list = ['EUR', 'USD', 'TRY', 'RUB'].filter(c => !hidden.includes(c) || used.has(c));
    const v = await showPicker({
      title: 'Валюта', value: f.currency,
      options: [
        { value: '', label: 'Все валюты' },
        ...list.map(c => ({ value: c, label: `${c} ${CUR_SYMBOL[c]}` })),
      ],
    });
    if (v !== null) { f.currency = v; renderHistory(); }
  });

  // клики по операциям (редактирование)
  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-tx]');
    if (row) {
      if (Number(row.dataset.swipedUntil || 0) > Date.now()) {
        e.preventDefault();
        return;
      }
      const exp = state.expenses.find(x => x.id === row.dataset.tx);
      if (exp) openAddSheet(exp);
    }
  });
  bindHistorySwipeDelete();

  // ─── лист добавления ───
  $('fab-add').addEventListener('click', () => openAddSheet());
  updateHeroNav();
  $('home-card-prev').addEventListener('click', () => {
    $('home-card-carousel').scrollTo({ left: 0, behavior: 'smooth' });
  });
  $('home-card-next').addEventListener('click', () => {
    const c = $('home-card-carousel');
    c.scrollTo({ left: c.children[1].offsetLeft, behavior: 'smooth' });
  });
  $('home-card-carousel').addEventListener('scroll', () => requestAnimationFrame(updateHeroNav), { passive: true });
  $('home-balance-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openBalanceSheet();
  });
  // тап по сумме «Потрачено» — плавно переключает валюту отображения
  $('home-total').addEventListener('click', (e) => {
    e.stopPropagation();
    cycleHomeCurrency();
  });
  // значок ⓘ на карточке остатка — плавно показывает пояснение
  $('home-remaining-info').addEventListener('click', (e) => {
    e.stopPropagation();
    $('home-remaining-hint').classList.toggle('show');
  });
  $('add-cancel').addEventListener('click', closeAddSheet);
  // свайп вниз закрывает шторки
  makeDraggable($('add-sheet'), closeAddSheet);
  makeDraggable($('export-sheet'), () => closeSheet($('export-sheet')));
  makeDraggable($('rates-sheet'), () => closeSheet($('rates-sheet')));
  makeDraggable($('balance-sheet'), () => closeSheet($('balance-sheet')));
  $('sheet-backdrop').addEventListener('click', () => {
    sheet.open = false;
    closeAllSheets();
  });
  $('add-delete').addEventListener('click', deleteSheetExpense);
  $('balance-cancel').addEventListener('click', () => closeSheet($('balance-sheet')));
  $('balance-date').addEventListener('change', (e) => {
    if (e.target.value) { balanceDate = new Date(e.target.value); renderBalanceSheet(); }
  });
  $('balance-date').addEventListener('click', (e) => {
    try { e.target.showPicker?.(); } catch { /* уже открыт или не поддерживается */ }
  });
  $('balance-save').addEventListener('click', async () => {
    const values = {};
    for (const cur of ['USD', 'TRY', 'RUB', 'EUR']) {
      const value = parseMoneyInput($(`balance-${cur}`).value);
      if (!isFinite(value) || value < 0) { toast('Введите суммы от 0'); return; }
      values[cur] = value;
    }
    const asOf = (balanceDate || new Date()).toISOString();
    await saveWallet({ balances: values, balanceAsOf: asOf });
    closeSheet($('balance-sheet'));
    renderHome();
    toast('Остаток сохранён');
  });

  $('keypad').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) keypadPress(b.dataset.k);
  });
  $('amount-box').addEventListener('click', () => { sheet.target = 'amount'; renderSheet(); });
  $('tips-box').addEventListener('click', () => { sheet.target = 'tips'; renderSheet(); });

  // переключатель типа операции: трата / обмен
  $('sheet-kind').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setSheetKind(b.dataset.kind);
  });

  $('currency-row').addEventListener('click', async (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const cur = c.dataset.cur;
    if (sheet.kind === 'exchange') {
      // валюта относится к активному боксу: «отдал» или «получил»
      if (sheet.target === 'tips') sheet.toCur = cur; else sheet.fromCur = cur;
      renderSheet();
      return;
    }
    sheet.currency = cur;
    sheet.manualRate = null;
    await saveSettings({ lastCurrency: sheet.currency });
    renderSheet();
  });

  $('cat-picker').addEventListener('click', async (e) => {
    const cell = e.target.closest('.cat-cell');
    if (!cell) return;
    if (cell.dataset.cat === '__new') {
      const name = prompt('Название новой категории:');
      if (!name || !name.trim()) return;
      const emoji = prompt('Эмодзи (одно):', '🏷️') || '🏷️';
      const c = await addCategory(name.trim(), emoji.trim().slice(0, 4));
      sheet.categoryId = c.id;
    } else {
      sheet.categoryId = cell.dataset.cat;
    }
    renderSheet();
  });

  $('add-date').addEventListener('change', (e) => {
    if (e.target.value) { sheet.spentAt = new Date(e.target.value); renderSheet(); }
  });
  // на десктопе прозрачный input сам не открывает календарь — подталкиваем
  $('add-date').addEventListener('click', (e) => {
    try { e.target.showPicker?.(); } catch { /* уже открыт или не поддерживается */ }
  });

  $('rate-edit').addEventListener('click', () => {
    const b = state.settings.baseCurrency;
    const raw = prompt(`Курс: сколько ${b} за 1 ${sheet.currency}?`,
      sheet.manualRate?.base === b ? String(sheet.manualRate.value) : '');
    if (raw === null) return;
    const v = parseFloat(raw.replace(',', '.'));
    if (raw.trim() === '' || !isFinite(v) || v <= 0) { sheet.manualRate = null; }
    else sheet.manualRate = { base: b, value: v };
    renderSheet();
  });

  $('add-save').addEventListener('click', async () => {
    if (await saveSheet()) closeAddSheet();
  });

  // ─── экспорт ───
  $('stats-export-btn').addEventListener('click', () => {
    const { period, expenses } = statsExpensesAndPeriod();
    $('export-period-note').textContent =
      `${periodTitle(period)} · ${expenses.length} операций · базовая валюта ${state.settings.baseCurrency}`;
    openSheet($('export-sheet'));
  });
  $('export-cancel').addEventListener('click', () => closeSheet($('export-sheet')));
  $('export-xlsx').addEventListener('click', () => {
    const { period, expenses } = statsExpensesAndPeriod();
    if (!expenses.length) { toast('Нет операций за период'); return; }
    exportXlsx(expenses, period);
  });
  $('export-pdf').addEventListener('click', () => {
    const { period, expenses } = statsExpensesAndPeriod();
    if (!expenses.length) { toast('Нет операций за период'); return; }
    exportPdf(expenses, period);
  });

  // статус синка на главной
  $('home-sync-badge').addEventListener('click', () => {
    if (syncState.connected) toast('Синхронизация работает ✅');
    else toast('Синхронизация не подключена — включите в Настройках');
  });
}



function updateSyncIcon() {
  $('sync-icon').innerHTML = syncState.connected ? I.cloudCheck : I.cloudOff;
  $('home-sync-badge').style.color = syncState.connected ? 'var(--ok)' : '';
}

// ─── Запуск ───
async function main() {
  injectIcons();
  await initStore();
  bindEvents();
  await runOnboarding();

  $('app').classList.remove('hidden');
  initPicker();
  showScreen('home');

  subscribe((what) => {
    if (what === 'sync') { updateSyncIcon(); if (currentScreen === 'settings') renderSettings(); return; }
    render(currentScreen);
  });

  // рыночные курсы тянем из сети только если какой-то видимой валюте не задан свой курс
  const st = state.settings;
  const needMarket = CURRENCIES.some(c =>
    c !== st.baseCurrency &&
    !(st.hiddenCurrencies || []).includes(c) &&
    !getCustomRate(c, st.baseCurrency));
  if (needMarket) refreshRates().then(() => render(currentScreen));
  initSync().then(updateSyncIcon);
  updateSyncIcon();

  if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

main();

// Демо-данные для локальной разработки: window.seedDemo() в консоли
if (location.hostname === 'localhost') {
  window.seedDemo = async () => {
    const { addExpense, setProfile } = await import('./store.js');
    const demo = [
      ['sonya', 1850, 250, 'RUB', 'food', 'Ужин в «Джон Джоли»', 0],
      ['nikita', 4.6, 0, 'EUR', 'transport', 'Метро', 0],
      ['nikita', 62.4, 8, 'EUR', 'food', 'Ужин у моря', 1],
      ['sonya', 320, 0, 'TRY', 'groceries', 'Migros', 1],
      ['sonya', 45, 5, 'USD', 'fun', 'Музей современного искусства', 2],
      ['nikita', 12500, 0, 'RUB', 'housing', 'Коммуналка', 2],
      ['nikita', 890, 0, 'RUB', 'health', 'Аптека', 3],
      ['sonya', 78.9, 0, 'EUR', 'shopping', 'Zara', 4],
      ['nikita', 210, 30, 'TRY', 'food', 'Кофе и десерты', 4],
      ['sonya', 3400, 0, 'RUB', 'gifts', 'Подарок маме', 5],
      ['nikita', 25.5, 3, 'EUR', 'food', 'Обед', 6],
      ['sonya', 150, 0, 'TRY', 'transport', 'Такси', 7],
      ['nikita', 5600, 0, 'RUB', 'shopping', 'Наушники', 9],
      ['sonya', 42, 0, 'USD', 'fun', 'Кино', 11],
      ['nikita', 1250, 150, 'RUB', 'food', 'Бранч', 13],
    ];
    const origProfile = state.profile;
    for (const [author, amount, tips, currency, cat, note, daysAgo] of demo) {
      await setProfile(author);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      d.setHours(10 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
      await addExpense({ amount, tips, currency, categoryId: cat, note, spentAt: d.toISOString() });
    }
    await setProfile(origProfile || 'nikita');
    render('all');
    console.log('seeded', demo.length);
  };
}
