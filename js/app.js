// Точка входа: онбординг, навигация, привязка событий

import { initStore, state, subscribe, setPassword, checkPassword, setUnlocked, setProfile, addCategory } from './store.js';
import { refreshRates } from './rates.js';
import { initSync, syncState } from './sync.js';
import {
  ui, shiftMonth, renderHome, renderHistory, renderStats,
  sheet, openAddSheet, closeAddSheet, renderSheet, keypadPress, saveSheet, deleteSheetExpense,
  statsExpensesAndPeriod, historyExpenses,
} from './ui.js';
import { renderSettings } from './settings.js';
import { exportXlsx, exportPdf } from './export.js';
import { toast, periodTitle } from './util.js';

const $ = id => document.getElementById(id);

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

// ─── Онбординг ───
async function runOnboarding() {
  const needPassword = !state.unlocked;
  const needProfile = !state.profile;
  if (!needPassword && !needProfile) return;

  $('onboarding').classList.remove('hidden');
  $('app').classList.add('hidden');

  if (needPassword) {
    const creating = !state.settings.passwordHash;
    $('ob-password-label').textContent = creating ? 'Придумайте пароль общего аккаунта' : 'Пароль общего аккаунта';
    $('ob-password-hint').textContent = creating
      ? 'Один пароль на двоих — его нужно будет ввести один раз на каждом телефоне.'
      : 'Введите пароль, который вы придумали при первой настройке.';
    $('ob-password-btn').textContent = creating ? 'Создать аккаунт' : 'Войти';

    await new Promise(resolve => {
      $('ob-password-form').onsubmit = async (e) => {
        e.preventDefault();
        const value = $('ob-password-input').value;
        if (creating) {
          if (value.length < 4) return;
          await setPassword(value);
        } else if (!(await checkPassword(value))) {
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

  // фильтры истории
  const f = ui.historyFilter;
  $('f-period').addEventListener('change', e => { f.period = e.target.value; renderHistory(); });
  $('f-author').addEventListener('change', e => { f.author = e.target.value; renderHistory(); });
  $('f-cat').addEventListener('change', e => { f.category = e.target.value; renderHistory(); });
  $('f-cur').addEventListener('change', e => { f.currency = e.target.value; renderHistory(); });
  $('history-clear-filters').addEventListener('click', () => {
    Object.assign(f, { period: 'month', author: '', category: '', currency: '' });
    $('f-period').value = 'month'; $('f-author').value = ''; $('f-cat').value = ''; $('f-cur').value = '';
    renderHistory();
  });

  // клики по операциям (редактирование)
  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-tx]');
    if (row) {
      const exp = state.expenses.find(x => x.id === row.dataset.tx);
      if (exp) openAddSheet(exp);
    }
  });

  // ─── лист добавления ───
  $('fab-add').addEventListener('click', () => openAddSheet());
  $('add-cancel').addEventListener('click', closeAddSheet);
  $('sheet-backdrop').addEventListener('click', () => {
    closeAddSheet();
    $('export-sheet').classList.add('hidden');
  });
  $('add-delete').addEventListener('click', deleteSheetExpense);

  $('keypad').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) keypadPress(b.dataset.k);
  });
  $('amount-box').addEventListener('click', () => { sheet.target = 'amount'; renderSheet(); });
  $('tips-box').addEventListener('click', () => { sheet.target = 'tips'; renderSheet(); });

  $('currency-row').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    sheet.currency = c.dataset.cur;
    sheet.manualRate = null;
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
    $('export-sheet').classList.remove('hidden');
    $('sheet-backdrop').classList.remove('hidden');
  });
  $('export-cancel').addEventListener('click', () => {
    $('export-sheet').classList.add('hidden');
    $('sheet-backdrop').classList.add('hidden');
  });
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

// список категорий в фильтре истории
function fillCategoryFilter() {
  const sel = $('f-cat');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Все категории</option>' +
    state.categories.filter(c => !c.deleted).map(c =>
      `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
  sel.value = cur;
}

function updateSyncIcon() {
  $('sync-icon').textContent = syncState.connected ? '☁️' : '📴';
  $('home-sync-badge').style.opacity = syncState.connected ? 1 : 0.55;
}

// ─── Запуск ───
async function main() {
  await initStore();
  bindEvents();
  await runOnboarding();

  $('app').classList.remove('hidden');
  fillCategoryFilter();
  showScreen('home');

  subscribe((what) => {
    if (what === 'categories') fillCategoryFilter();
    if (what === 'sync') { updateSyncIcon(); if (currentScreen === 'settings') renderSettings(); return; }
    render(currentScreen);
  });

  refreshRates().then(() => render(currentScreen)); // не блокируем запуск (offline-first)
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
