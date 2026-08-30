// Рендеринг экранов и лист добавления траты

import {
  state, visibleExpenses, categoryById, categoriesByUsage, visibleCategories,
  addExpense, updateExpense, deleteExpense, saveSettings,
} from './store.js';
import {
  fmtNum, fmtMoney, fmtDay, fmtTime, periodTitle, CUR_SYMBOL, AUTHORS,
  escapeHtml, toLocalInput, toast, round2,
} from './util.js';
import { toBase, tipsToBase, rateToBase, getCachedRates } from './rates.js';
import { inPeriod, summarize, series } from './agg.js';
import { donutChart, barChart } from './charts.js';

const $ = id => document.getElementById(id);

// Текущие периоды экранов
export const ui = {
  homePeriod: currentMonth(),
  statsPeriod: currentMonth(),
  statsMode: 'month',
  historyFilter: { period: 'month', author: '', category: '', currency: '' },
};

function currentMonth() {
  const n = new Date();
  return { mode: 'month', year: n.getFullYear(), month: n.getMonth() };
}

export function shiftMonth(p, dir) {
  if (p.mode === 'year') { p.year += dir; return; }
  const d = new Date(p.year, p.month + dir, 1);
  p.year = d.getFullYear(); p.month = d.getMonth();
}

function base() { return state.settings.baseCurrency; }

function authorDotColor(a) {
  return a === 'sonya' ? 'var(--sonya)' : 'var(--nikita)';
}

// ─────────────── ГЛАВНАЯ ───────────────
export function renderHome() {
  const p = ui.homePeriod;
  $('home-period-label').textContent = periodTitle(p);
  const prof = AUTHORS[state.profile];
  $('home-hello').textContent = prof ? `Привет, ${prof.name}!` : 'Привет!';

  const expenses = inPeriod(p);
  const s = summarize(expenses, base());

  $('home-total').textContent = fmtMoney(round2(s.total), base());
  $('home-tips-line').textContent = s.tips > 0.005
    ? `из них чаевые ${fmtMoney(round2(s.tips), base())}` : '';

  // вклад каждого
  $('home-authors').innerHTML = ['sonya', 'nikita'].map(a => `
    <div class="author-pill">
      <span class="ava ava-${a}">${AUTHORS[a].letter}</span>
      <span class="author-pill-info">
        <span class="author-pill-name">${AUTHORS[a].name}</span><br>
        <span class="author-pill-sum">${fmtMoney(round2(s.byAuthor[a] || 0), base())}</span>
      </span>
    </div>`).join('');

  // топ категорий
  const top = s.cats.slice(0, 4);
  $('home-cats').innerHTML = top.length ? top.map(({ cat, value }) => {
    const pct = s.total > 0 ? Math.round(value / s.total * 100) : 0;
    return `
    <div class="cat-bar-row">
      <span class="cat-bar-emoji" style="background:${cat.color}22">${cat.emoji}</span>
      <span class="cat-bar-mid">
        <span class="cat-bar-name"><span>${escapeHtml(cat.name)}</span><span class="pct">${pct}%</span></span>
        <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${pct}%;background:${cat.color}"></span></span>
      </span>
      <span class="cat-bar-sum num">${fmtNum(round2(value))}</span>
    </div>`;
  }).join('') : emptyBlock('🪺', 'Пока нет трат за этот период');

  // последние операции
  const recent = [...visibleExpenses()]
    .sort((a, b) => b.spentAt.localeCompare(a.spentAt)).slice(0, 5);
  $('home-recent').innerHTML = recent.length
    ? recent.map(txRowHTML).join('')
    : emptyBlock('✨', 'Нажмите «+», чтобы записать первую трату');
}

function emptyBlock(emoji, text) {
  return `<div class="empty"><span class="empty-emoji">${emoji}</span>${text}</div>`;
}

function txRowHTML(e) {
  const cat = categoryById(e.category);
  const d = new Date(e.spentAt);
  const inBase = e.currency !== base()
    ? `<div class="tx-base">≈ ${fmtMoney(round2(toBase(e, base())), base())}</div>` : '';
  const tips = e.tips > 0
    ? `<div class="tx-tips">🤝 +${fmtNum(e.tips)} ${CUR_SYMBOL[e.currency]}</div>` : '';
  return `
  <button class="tx-row" data-tx="${e.id}">
    <span class="tx-emoji" style="background:${cat.color}22">${cat.emoji}
      <span class="tx-author-dot" style="background:${authorDotColor(e.author)}"></span>
    </span>
    <span class="tx-main">
      <div class="tx-title">${escapeHtml(e.note) || escapeHtml(cat.name)}</div>
      <div class="tx-sub">${e.note ? escapeHtml(cat.name) + ' · ' : ''}${AUTHORS[e.author]?.name || ''} · ${fmtDay(d)} ${fmtTime(d)}</div>
    </span>
    <span class="tx-right">
      <div class="tx-amount">−${fmtMoney(e.amount, e.currency)}</div>
      ${tips}${inBase}
    </span>
  </button>`;
}

// ─────────────── ИСТОРИЯ ───────────────
export function historyExpenses() {
  const f = ui.historyFilter;
  const period = f.period === 'month' ? currentMonth()
    : f.period === 'year' ? { mode: 'year', year: new Date().getFullYear() }
    : { mode: f.period };
  return inPeriod(period, {
    author: f.author || undefined,
    category: f.category || undefined,
    currency: f.currency || undefined,
  }).sort((a, b) => b.spentAt.localeCompare(a.spentAt));
}

export function renderHistory() {
  const f = ui.historyFilter;

  // чипы фильтров
  const catName = f.category ? categoryById(f.category).name : 'Категории';
  setChip('f-period', { week: 'Неделя', month: 'Месяц', year: 'Год', all: 'Всё время' }[f.period], f.period !== 'month');
  setChip('f-author', f.author ? AUTHORS[f.author].name : 'Оба', !!f.author);
  setChip('f-cat', catName, !!f.category);
  setChip('f-cur', f.currency || 'Валюты', !!f.currency);

  const list = historyExpenses();
  const s = summarize(list, base());
  $('history-summary').textContent = list.length
    ? `${list.length} ${plural(list.length, 'операция', 'операции', 'операций')} · ${fmtMoney(round2(s.total), base())}${s.tips > 0.005 ? ` · чаевые ${fmtMoney(round2(s.tips), base())}` : ''}`
    : '';

  // группировка по дням
  const groups = new Map();
  for (const e of list) {
    const d = new Date(e.spentAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, { date: d, items: [] });
    groups.get(key).items.push(e);
  }

  $('history-list').innerHTML = groups.size ? [...groups.values()].map(g => {
    const daySum = g.items.reduce((acc, e) => acc + toBase(e, base()), 0);
    return `
    <div class="day-group">
      <div class="day-head">
        <span>${fmtDay(g.date)}</span>
        <span class="num">${fmtMoney(round2(daySum), base())}</span>
      </div>
      <div class="day-card">${g.items.map(txRowHTML).join('')}</div>
    </div>`;
  }).join('') : emptyBlock('🔍', 'Нет операций по выбранным фильтрам');
}

function setChip(selectId, text, active) {
  $(selectId + '-text').textContent = text;
  $(selectId).closest('.filter-chip').classList.toggle('on', active);
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ─────────────── АНАЛИТИКА ───────────────
export function statsExpensesAndPeriod() {
  const p = ui.statsMode === 'all' ? { mode: 'all' }
    : ui.statsMode === 'year' ? { mode: 'year', year: ui.statsPeriod.year }
    : ui.statsPeriod;
  return { period: p, expenses: inPeriod(p) };
}

export function renderStats() {
  const { period: p, expenses } = statsExpensesAndPeriod();
  $('stats-period-label').textContent = periodTitle(p);
  $('stats-period-nav').style.visibility = ui.statsMode === 'all' ? 'hidden' : 'visible';
  $('stats-seg').querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === ui.statsMode));

  const s = summarize(expenses, base());
  const avg = s.count ? s.total / s.count : 0;
  const avgNoTips = s.count ? (s.total - s.tips) / s.count : 0;

  const donutSegs = s.cats.slice(0, 6).map(({ cat, value }) => ({ value, color: cat.color }));
  if (s.cats.length > 6) {
    donutSegs.push({ value: s.cats.slice(6).reduce((a, c) => a + c.value, 0), color: '#b5b0a2' });
  }

  const pts = series(expenses, p, base());

  $('stats-body').innerHTML = `
    <div class="stat-grid">
      ${statTile('Всего потрачено', fmtMoney(round2(s.total), base()), `${s.count} ${plural(s.count, 'покупка', 'покупки', 'покупок')}`)}
      ${statTile('Чаевые', fmtMoney(round2(s.tips), base()), s.total > 0 ? `${(s.tips / s.total * 100).toFixed(1).replace('.', ',')}% от расходов` : '')}
      ${statTile('Средний чек', fmtMoney(round2(avg), base()), 'с чаевыми')}
      ${statTile('Средний чек', fmtMoney(round2(avgNoTips), base()), 'без чаевых')}
    </div>

    ${s.count ? `
    <section class="card">
      <div class="card-head"><h2>Категории</h2></div>
      <div class="chart-wrap" style="max-width:230px;margin:0 auto 14px">
        ${donutChart(donutSegs, fmtNum(Math.round(s.total)), CUR_SYMBOL[base()] + ' всего')}
      </div>
      <div class="cat-bars">
        ${s.cats.map(({ cat, value }) => {
          const pct = s.total > 0 ? Math.round(value / s.total * 100) : 0;
          return `
          <div class="cat-bar-row">
            <span class="cat-bar-emoji" style="background:${cat.color}22">${cat.emoji}</span>
            <span class="cat-bar-mid">
              <span class="cat-bar-name"><span>${escapeHtml(cat.name)}</span><span class="pct">${pct}%</span></span>
              <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${pct}%;background:${cat.color}"></span></span>
            </span>
            <span class="cat-bar-sum num">${fmtNum(round2(value))}</span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Кто сколько потратил</h2></div>
      ${['sonya', 'nikita'].map(a => {
        const v = s.byAuthor[a] || 0;
        const pct = s.total > 0 ? Math.round(v / s.total * 100) : 0;
        return `
        <div class="author-stat">
          <span class="ava ava-${a}">${AUTHORS[a].letter}</span>
          <span class="author-stat-info">
            <span class="author-stat-top">
              <span>${AUTHORS[a].name}</span>
              <span class="num">${fmtMoney(round2(v), base())} <span class="pct">· ${pct}%</span></span>
            </span>
            <span class="author-stat-track">
              <span class="author-stat-fill" style="width:${pct}%;background:${authorDotColor(a)}"></span>
            </span>
          </span>
        </div>`;
      }).join('')}
    </section>

    ${pts.length > 1 ? `
    <section class="card">
      <div class="card-head"><h2>Динамика</h2></div>
      <div class="chart-wrap">${barChart(pts)}</div>
      <div class="chart-caption">${p.mode === 'month' || p.mode === 'week' ? 'по дням' : 'по месяцам'}, в ${CUR_SYMBOL[base()]}</div>
    </section>` : ''}

    <section class="card">
      <div class="card-head"><h2>По валютам</h2></div>
      ${[...s.byCur.entries()].sort((a, b) => b[1].base - a[1].base).map(([cur, v]) => `
        <div class="cur-row">
          <span><span class="cur-name">${CUR_SYMBOL[cur]} ${cur}</span>
            <span class="cur-sub"> · ${v.count} ${plural(v.count, 'операция', 'операции', 'операций')}</span></span>
          <span style="text-align:right">
            <div class="num">${fmtMoney(round2(v.orig), cur)}</div>
            ${cur !== base() ? `<div class="cur-sub num">≈ ${fmtMoney(round2(v.base), base())}</div>` : ''}
          </span>
        </div>`).join('')}
    </section>
    ` : emptyBlock('📭', 'Нет данных за выбранный период')}
  `;
}

function statTile(label, value, sub) {
  return `<div class="stat-tile">
    <div class="stat-tile-label">${label}</div>
    <div class="stat-tile-value">${value}</div>
    <div class="stat-tile-sub">${sub || '&nbsp;'}</div>
  </div>`;
}

// ─────────────── ЛИСТ ДОБАВЛЕНИЯ ───────────────
export const sheet = {
  open: false,
  editingId: null,
  target: 'amount',
  amountStr: '',
  tipsStr: '',
  currency: 'RUB',
  categoryId: null,
  note: '',
  spentAt: null,      // null = сейчас
  manualRate: null,
  editRates: null,    // снимок курсов редактируемой операции
};

export function openAddSheet(expense = null) {
  sheet.open = true;
  sheet.editingId = expense ? expense.id : null;
  sheet.target = 'amount';
  sheet.amountStr = expense ? numToStr(expense.amount) : '';
  sheet.tipsStr = expense && expense.tips ? numToStr(expense.tips) : '';
  sheet.currency = expense ? expense.currency : (state.settings.lastCurrency || 'RUB');
  sheet.categoryId = expense ? expense.category : null;
  sheet.note = expense ? expense.note : '';
  sheet.spentAt = expense ? new Date(expense.spentAt) : null;
  sheet.manualRate = expense ? expense.manualRate : null;
  sheet.editRates = expense ? expense.rates : null;

  $('add-title').textContent = expense ? 'Изменить трату' : 'Новая трата';
  $('add-delete').classList.toggle('hidden', !expense);
  $('add-note').value = sheet.note;
  $('add-date').value = toLocalInput(sheet.spentAt || new Date());

  renderSheet();
  $('sheet-backdrop').classList.remove('hidden');
  $('add-sheet').classList.remove('hidden');
}

export function closeAddSheet() {
  sheet.open = false;
  $('sheet-backdrop').classList.add('hidden');
  $('add-sheet').classList.add('hidden');
  $('add-note').blur();
}

function numToStr(n) {
  if (!n) return '';
  return String(n).replace('.', ',');
}
export function strToNum(s) {
  if (!s) return 0;
  return parseFloat(s.replace(',', '.').replace(/\s/g, '')) || 0;
}

export function renderSheet() {
  // сумма и чаевые
  const amountView = sheet.amountStr || '0';
  $('amount-display').innerHTML =
    `${escapeHtml(fmtEntry(amountView))} <span class="amount-cur">${CUR_SYMBOL[sheet.currency]}</span>`;
  $('tips-display').textContent = sheet.tipsStr ? fmtEntry(sheet.tipsStr) : '+';
  $('amount-box').classList.toggle('on', sheet.target === 'amount');
  $('tips-box').classList.toggle('on', sheet.target === 'tips');

  // валюты
  $('currency-row').querySelectorAll('.chip').forEach(c =>
    c.classList.toggle('on', c.dataset.cur === sheet.currency));

  // категории (частые — первыми)
  const cats = categoriesByUsage();
  $('cat-picker').innerHTML = cats.map(c => `
    <button class="cat-cell ${sheet.categoryId === c.id ? 'on' : ''}" data-cat="${c.id}">
      <span class="cat-cell-emoji">${c.emoji}</span>
      <span class="cat-cell-name">${escapeHtml(c.name)}</span>
    </button>`).join('')
    + `<button class="cat-cell" data-cat="__new"><span class="cat-cell-emoji">➕</span><span class="cat-cell-name">Новая</span></button>`;

  // дата
  const d = sheet.spentAt;
  $('add-date-text').textContent = d ? `${fmtDay(d)} ${fmtTime(d)}` : 'Сейчас';

  // строка курса
  const b = base();
  if (sheet.currency !== b) {
    const rate = sheet.manualRate && sheet.manualRate.base === b
      ? sheet.manualRate.value
      : rateToBase(sheet.editRates || getCachedRates().perUSD, sheet.currency, b);
    $('rate-text').textContent =
      `Курс: 1 ${CUR_SYMBOL[sheet.currency]} ≈ ${fmtNum(rate)} ${CUR_SYMBOL[b]}${sheet.manualRate ? ' (вручную)' : ''}`;
    $('rate-line').classList.remove('hidden');
  } else {
    $('rate-line').classList.add('hidden');
  }
}

// красивый ввод: 1 234,5
function fmtEntry(s) {
  const [int, frac] = s.split(',');
  const intFmt = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return frac !== undefined ? `${intFmt},${frac}` : intFmt;
}

export function keypadPress(k) {
  const key = sheet.target === 'amount' ? 'amountStr' : 'tipsStr';
  let v = sheet[key];
  if (k === 'back') v = v.slice(0, -1);
  else if (k === ',') { if (!v.includes(',')) v = (v || '0') + ','; }
  else {
    const [, frac] = v.split(',');
    if (frac !== undefined && frac.length >= 2) return;   // максимум 2 знака
    if (v.replace(',', '').length >= 9) return;           // разумный предел
    if (v === '0') v = k; else v += k;
  }
  sheet[key] = v;
  renderSheet();
  if (navigator.vibrate) navigator.vibrate(3);
}

export async function saveSheet() {
  const amount = strToNum(sheet.amountStr);
  const tips = strToNum(sheet.tipsStr);
  if (amount <= 0) { toast('Введите сумму покупки'); return false; }
  if (!sheet.categoryId) { toast('Выберите категорию'); return false; }

  const data = {
    amount: round2(amount),
    tips: round2(tips),
    currency: sheet.currency,
    categoryId: sheet.categoryId,
    category: sheet.categoryId,
    note: $('add-note').value.trim(),
    spentAt: (sheet.spentAt || new Date()).toISOString(),
    manualRate: sheet.manualRate,
  };

  if (sheet.editingId) {
    await updateExpense(sheet.editingId, {
      amount: data.amount, tips: data.tips, currency: data.currency,
      category: data.categoryId, note: data.note, spentAt: data.spentAt,
      manualRate: data.manualRate,
    });
    toast('Изменения сохранены');
  } else {
    await addExpense(data);
    toast(`Записано: ${fmtMoney(data.amount + data.tips, data.currency)}`);
  }
  await saveSettings({ lastCurrency: sheet.currency });
  return true;
}

export async function deleteSheetExpense() {
  if (!sheet.editingId) return;
  if (!confirm('Удалить эту трату? Она исчезнет на обоих телефонах.')) return;
  await deleteExpense(sheet.editingId);
  toast('Трата удалена');
  closeAddSheet();
}
