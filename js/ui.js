// Рендеринг экранов и лист добавления траты

import {
  state, visibleExpenses, categoryById, categoriesByUsage, visibleCategories,
  addExpense, updateExpense, deleteExpense, saveSettings, addExchange, isExchange,
} from './store.js';
import {
  fmtNum, fmtMoney, fmtDay, fmtDateShort, fmtTime, periodTitle, CUR_SYMBOL, CURRENCIES, AUTHORS,
  escapeHtml, toLocalInput, toast, round2,
} from './util.js';
import { toBase, tipsToBase, rateToBase, getCachedRates, getCustomRate } from './rates.js';
import { inPeriod, summarize, series } from './agg.js';
import { donutChart, barChart } from './charts.js';
import { openSheet, closeSheet } from './picker.js';

const $ = id => document.getElementById(id);

// Узкий разделитель тысяч: обычный пробел в моноширинном шрифте слишком широкий
const narrow = s => String(s).replace(/[\s  ](?=\d)/g, '<span class="gsp"></span>');
const nMoney = (n, cur) => narrow(fmtMoney(n, cur));
const nNum = (n, f) => narrow(fmtNum(n, f));

// Текущие периоды экранов
export const ui = {
  homePeriod: currentMonth(),
  homeCurrency: null,   // валюта отображения «Потрачено» (null = базовая); переключается тапом
  statsPeriod: currentMonth(),
  statsMode: 'week',
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

function convertMoney(amount, from, to) {
  if (from === to) return amount;
  const direct = getCustomRate(from, to);
  if (direct) return amount * direct;
  const reverse = getCustomRate(to, from);
  if (reverse) return amount / reverse;
  return amount * rateToBase(getCachedRates().perUSD, from, to);
}

function walletSummary() {
  const balances = state.settings.balances || {};
  const asOf = state.settings.balanceAsOf || null;   // ISO или null («с самого начала»)
  const spent = { USD: 0, TRY: 0, RUB: 0, EUR: 0 };
  const remaining = {};
  for (const cur of ['USD', 'TRY', 'RUB', 'EUR']) remaining[cur] = Number(balances[cur]) || 0;

  for (const e of visibleExpenses()) {
    // траты и обмены ДО (и на) даты остатка уже учтены в введённой сумме — пропускаем
    if (asOf && (e.spentAt || '') <= asOf) continue;
    if (isExchange(e)) {
      remaining[e.fromCur] = (remaining[e.fromCur] || 0) - (e.fromAmount || 0);
      remaining[e.toCur] = (remaining[e.toCur] || 0) + (e.toAmount || 0);
    } else {
      const s = (e.amount || 0) + (e.tips || 0);
      spent[e.currency] = (spent[e.currency] || 0) + s;
      remaining[e.currency] = (remaining[e.currency] || 0) - s;
    }
  }
  // общий остаток — сумма всех валют, пересчитанная в рубли (доллары/лиры/евро отдельно)
  const totalRUB = Object.entries(remaining)
    .reduce((sum, [cur, value]) => sum + convertMoney(value, cur, 'RUB'), 0);
  return { balances, asOf, spent, remaining, totalRUB };
}

// ─────────────── ГЛАВНАЯ ───────────────
let heroLast = null, heroAnim = 0;

function heroMoneyHTML(v, cur) {
  const r = round2(v);
  const int = Math.trunc(r);
  const cents = Math.round(Math.abs(r - int) * 100);
  // узкий разделитель тысяч (в моноширинном шрифте обычный пробел слишком широкий)
  const intStr = new Intl.NumberFormat('ru-RU').format(int)
    .replace(/[\s  ]/g, '<span class="gsp"></span>');
  const centsStr = cents ? `<span class="cents">,${String(cents).padStart(2, '0')}</span>` : '';
  return `${intStr}${centsStr} <span class="cur">${CUR_SYMBOL[cur]}</span>`;
}

// докручивание итога (count-up)
function renderHeroTotal(total, cur) {
  const el = $('home-total');
  const from = heroLast === null ? total * 0.5 : heroLast;
  heroLast = total;
  const id = ++heroAnim;
  const dur = Math.abs(total - from) < 0.01 ? 0 : 520;
  const start = performance.now();
  const step = (now) => {
    if (id !== heroAnim) return;
    const t = dur ? Math.min((now - start) / dur, 1) : 1;
    const eased = 1 - Math.pow(1 - t, 3);
    el.innerHTML = heroMoneyHTML(from + (total - from) * eased, cur);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// валюта отображения на главной карточке «Потрачено» (тап по сумме переключает)
export function homeCur() {
  const cur = ui.homeCurrency || base();
  return CURRENCIES.includes(cur) ? cur : base();
}

// список валют для переключения: базовая первой, затем остальные (кроме скрытых)
export function homeCurCycle() {
  const b = base();
  const hidden = state.settings.hiddenCurrencies || [];
  const rest = CURRENCIES.filter(c => c !== b && !hidden.includes(c));
  return [b, ...rest];
}

// плавное переключение валюты: выцветание → пересчёт → проявление
export function cycleHomeCurrency() {
  const cycle = homeCurCycle();
  const i = cycle.indexOf(homeCur());
  ui.homeCurrency = cycle[(i + 1) % cycle.length];
  heroLast = null;   // не докручиваем между разными валютами
  const cards = [$('home-total-card'), $('home-cats-card')].filter(Boolean);
  cards.forEach(c => c.classList.add('cur-fade'));
  setTimeout(() => {
    renderHome();
    cards.forEach(c => c.classList.remove('cur-fade'));
  }, 170);
}

export function renderHome() {
  const p = ui.homePeriod;
  $('home-period-label').textContent = periodTitle(p);
  const prof = AUTHORS[state.profile];
  $('home-hello').textContent = prof ? `Привет, ${prof.name}!` : 'Привет!';

  const expenses = inPeriod(p);
  const dispCur = homeCur();
  const s = summarize(expenses, dispCur);

  renderHeroTotal(s.total, dispCur);
  $('home-tips-line').textContent = s.tips > 0.005
    ? `из них чаевые ${fmtMoney(round2(s.tips), dispCur)}` : '';

  // вклад каждого
  $('home-authors').innerHTML = ['sonya', 'nikita'].map(a => `
    <div class="author-pill">
      <span class="ava ava-${a}">${AUTHORS[a].letter}</span>
      <span class="author-pill-info"><span class="author-pill-name">${AUTHORS[a].name}</span><span class="author-pill-sum">${nMoney(round2(s.byAuthor[a] || 0), dispCur)}</span></span>
    </div>`).join('');

  // ─── Остаток: рубли — общий итог, доллары/лиры/евро — по отдельности ───
  const wallet = walletSummary();
  $('home-remaining-total').innerHTML = heroMoneyHTML(wallet.totalRUB, 'RUB');
  const hasValues = Object.values(wallet.balances).some(v => Math.abs(Number(v)) > 0.005);
  $('home-remaining-line').textContent = !hasValues
    ? 'укажите остаток на дату (карандаш)'
    : wallet.asOf
      ? `остаток на ${fmtDateShort(new Date(wallet.asOf))} минус траты после`
      : 'после всех записанных трат';
  const hidden = state.settings.hiddenCurrencies || [];
  const pillCurs = ['USD', 'TRY', 'EUR'].filter(cur =>
    !hidden.includes(cur) || Math.abs(wallet.remaining[cur] || 0) > 0.005 || Number(wallet.balances[cur]) > 0);
  const pills = $('home-remaining-pills');
  pills.style.gridTemplateColumns = `repeat(${Math.max(pillCurs.length, 1)}, 1fr)`;
  pills.innerHTML = pillCurs.map(cur => {
    const value = round2(wallet.remaining[cur] || 0);
    return `
    <div class="remaining-pill ${value < 0 ? 'negative' : ''}">
      <span class="remaining-pill-name">${CUR_SYMBOL[cur]} ${cur}</span>
      <span class="remaining-pill-sum num">${nMoney(value, cur)}</span>
    </div>`;
  }).join('');

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
      <span class="cat-bar-sum num">${nMoney(round2(value), dispCur)}</span>
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

function txRowHTML(e, swipeDelete = false) {
  const d = new Date(e.spentAt);

  if (isExchange(e)) {
    const rate = e.fromAmount ? e.toAmount / e.fromAmount : 0;
    const row = `
    <button class="tx-row" data-tx="${e.id}">
      <span class="tx-emoji tx-emoji-exchange">🔄
        <span class="tx-author-dot" style="background:${authorDotColor(e.author)}"></span>
      </span>
      <span class="tx-main">
        <div class="tx-title">${escapeHtml(e.note) || 'Обмен валюты'}</div>
        <div class="tx-sub">${nNum(e.fromAmount)} ${CUR_SYMBOL[e.fromCur]} → ${nNum(e.toAmount)} ${CUR_SYMBOL[e.toCur]}${rate ? ` · курс ${fmtNum(rate, 4)}` : ''}</div>
      </span>
      <span class="tx-right">
        <div class="tx-amount tx-exchange-from">−${nNum(e.fromAmount)} ${CUR_SYMBOL[e.fromCur]}</div>
        <div class="tx-exchange-to">+${nNum(e.toAmount)} ${CUR_SYMBOL[e.toCur]}</div>
      </span>
    </button>`;
    return swipeDelete ? `
    <div class="tx-swipe">
      <span class="tx-delete-bg">Удалить</span>
      ${row}
    </div>` : row;
  }

  const cat = categoryById(e.category);
  const inBase = e.currency !== base()
    ? `<div class="tx-base">≈ ${nMoney(round2(toBase(e, base())), base())}</div>` : '';
  const tips = e.tips > 0
    ? `<div class="tx-tips">🤝 −${nNum(e.tips)} ${CUR_SYMBOL[e.currency]}</div>` : '';
  const row = `
  <button class="tx-row" data-tx="${e.id}">
    <span class="tx-emoji" style="background:${cat.color}22">${cat.emoji}
      <span class="tx-author-dot" style="background:${authorDotColor(e.author)}"></span>
    </span>
    <span class="tx-main">
      <div class="tx-title">${escapeHtml(e.note) || escapeHtml(cat.name)}</div>
      <div class="tx-sub">${e.note ? escapeHtml(cat.name) + ' · ' : ''}${AUTHORS[e.author]?.name || ''} · ${fmtDay(d)} ${fmtTime(d)}</div>
    </span>
    <span class="tx-right">
      <div class="tx-amount">−${nMoney(e.amount, e.currency)}</div>
      ${tips}${inBase}
    </span>
  </button>`;
  return swipeDelete ? `
  <div class="tx-swipe">
    <span class="tx-delete-bg">Удалить</span>
    ${row}
  </div>` : row;
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
  $('history-summary').innerHTML = list.length
    ? narrow(`${list.length} ${plural(list.length, 'операция', 'операции', 'операций')} · ${fmtMoney(round2(s.total), base())}${s.tips > 0.005 ? ` · чаевые ${fmtMoney(round2(s.tips), base())}` : ''}`)
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
    const daySum = g.items.reduce((acc, e) => acc + (isExchange(e) ? 0 : toBase(e, base())), 0);
    return `
    <div class="day-group">
      <div class="day-head">
        <span>${fmtDay(g.date)}</span>
        <span class="num">${nMoney(round2(daySum), base())}</span>
      </div>
      <div class="day-card">${g.items.map(e => txRowHTML(e, true)).join('')}</div>
    </div>`;
  }).join('') : emptyBlock('🔍', 'Нет операций по выбранным фильтрам');
}

function setChip(id, text, active) {
  $(id + '-text').textContent = text;
  $(id + '-chip').classList.toggle('on', active);
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
    : ui.statsMode === 'week' ? { mode: 'week' }
    : ui.statsMode === 'year' ? { mode: 'year', year: ui.statsPeriod.year }
    : ui.statsPeriod;
  return { period: p, expenses: inPeriod(p) };
}

export function renderStats() {
  const { period: p, expenses } = statsExpensesAndPeriod();
  $('stats-period-label').textContent = periodTitle(p);
  $('stats-period-nav').style.visibility = (ui.statsMode === 'all' || ui.statsMode === 'week') ? 'hidden' : 'visible';
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
      ${statTile('Всего потрачено', nMoney(round2(s.total), base()), `${s.count} ${plural(s.count, 'покупка', 'покупки', 'покупок')}`)}
      ${statTile('Чаевые', nMoney(round2(s.tips), base()), s.total > 0 ? `${(s.tips / s.total * 100).toFixed(1).replace('.', ',')}% от расходов` : '')}
      ${statTile('Средний чек', nMoney(round2(avg), base()), 'с чаевыми')}
      ${statTile('Средний чек', nMoney(round2(avgNoTips), base()), 'без чаевых')}
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
            <span class="cat-bar-sum num">${nNum(round2(value))}</span>
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
              <span class="num">${nMoney(round2(v), base())} <span class="pct">· ${pct}%</span></span>
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
            <div class="num">${nMoney(round2(v.orig), cur)}</div>
            ${cur !== base() ? `<div class="cur-sub num">≈ ${nMoney(round2(v.base), base())}</div>` : ''}
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
  kind: 'expense',    // 'expense' | 'exchange'
  target: 'amount',
  amountStr: '',      // трата: сумма; обмен: «отдал»
  tipsStr: '',        // трата: чаевые; обмен: «получил»
  currency: 'RUB',
  fromCur: 'USD',     // обмен: валюта «отдал»
  toCur: 'TRY',       // обмен: валюта «получил»
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
  sheet.kind = expense && isExchange(expense) ? 'exchange' : 'expense';

  if (sheet.kind === 'exchange') {
    sheet.amountStr = expense ? numToStr(expense.fromAmount) : '';
    sheet.tipsStr = expense ? numToStr(expense.toAmount) : '';
    sheet.fromCur = expense ? expense.fromCur : 'USD';
    sheet.toCur = expense ? expense.toCur : 'TRY';
    sheet.categoryId = null;
  } else {
    sheet.amountStr = expense ? numToStr(expense.amount) : '';
    sheet.tipsStr = expense && expense.tips ? numToStr(expense.tips) : '';
    const hiddenCur = state.settings.hiddenCurrencies || [];
    const last = state.settings.lastCurrency || 'RUB';
    sheet.currency = expense ? expense.currency
      : (hiddenCur.includes(last) ? state.settings.baseCurrency : last);
    sheet.categoryId = expense ? expense.category : null;
  }
  sheet.note = expense ? (expense.note || '') : '';
  sheet.spentAt = expense ? new Date(expense.spentAt) : null;
  sheet.manualRate = expense && !isExchange(expense) ? expense.manualRate : null;
  sheet.editRates = expense && !isExchange(expense) ? expense.rates : null;

  updateSheetTitle();
  $('add-delete').classList.toggle('hidden', !expense);
  $('add-note').value = sheet.note;
  $('add-date').value = toLocalInput(sheet.spentAt || new Date());

  renderSheet();
  openSheet($('add-sheet'));
}

function updateSheetTitle() {
  const editing = !!sheet.editingId;
  $('add-title').textContent = sheet.kind === 'exchange'
    ? (editing ? 'Изменить обмен' : 'Обмен валюты')
    : (editing ? 'Изменить трату' : 'Новая трата');
}

// переключение трата ↔ обмен в открытом листе (только для новых операций)
export function setSheetKind(kind) {
  if (sheet.editingId || sheet.kind === kind) return;
  sheet.kind = kind;
  sheet.target = 'amount';
  updateSheetTitle();
  renderSheet();
}

export function closeAddSheet() {
  sheet.open = false;
  closeSheet($('add-sheet'));
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
  const exchange = sheet.kind === 'exchange';

  // переключатель типа операции (скрыт при редактировании)
  $('sheet-kind').style.display = sheet.editingId ? 'none' : '';
  $('sheet-kind').querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', b.dataset.kind === sheet.kind));

  // подписи и валюты боксов
  const amountCur = exchange ? sheet.fromCur : sheet.currency;
  const tipsCur = exchange ? sheet.toCur : sheet.currency;
  $('amount-box-label').textContent = exchange ? 'Отдал' : 'Сумма';
  $('tips-box-label').textContent = exchange ? 'Получил' : 'Чаевые';

  const caret = '<span class="caret"></span>';
  const amountView = sheet.amountStr || '0';
  $('amount-display').innerHTML =
    `${narrow(fmtEntry(amountView))}${sheet.target === 'amount' ? caret : ''} <span class="amount-cur">${CUR_SYMBOL[amountCur]}</span>`;
  if (exchange) {
    const tipsView = sheet.tipsStr || '0';
    $('tips-display').innerHTML =
      `${narrow(fmtEntry(tipsView))}${sheet.target === 'tips' ? caret : ''} <span class="amount-cur">${CUR_SYMBOL[tipsCur]}</span>`;
  } else {
    $('tips-display').innerHTML = sheet.tipsStr
      ? narrow(fmtEntry(sheet.tipsStr)) + (sheet.target === 'tips' ? caret : '')
      : (sheet.target === 'tips' ? caret : '+');
  }
  $('amount-box').classList.toggle('on', sheet.target === 'amount');
  $('tips-box').classList.toggle('on', sheet.target === 'tips');

  // валюты: в обмене показываем все 4 (можно менять и скрытые), в трате — кроме скрытых
  const hiddenCur = state.settings.hiddenCurrencies || [];
  const activeCur = exchange ? (sheet.target === 'tips' ? sheet.toCur : sheet.fromCur) : sheet.currency;
  $('currency-row').querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('on', c.dataset.cur === activeCur);
    c.style.display = (!exchange && hiddenCur.includes(c.dataset.cur) && c.dataset.cur !== sheet.currency) ? 'none' : '';
  });

  // категории — только для траты
  $('cat-picker').style.display = exchange ? 'none' : '';
  if (!exchange) {
    const cats = categoriesByUsage();
    $('cat-picker').innerHTML = cats.map(c => `
      <button class="cat-cell ${sheet.categoryId === c.id ? 'on' : ''}" data-cat="${c.id}">
        <span class="cat-cell-emoji">${c.emoji}</span>
        <span class="cat-cell-name">${escapeHtml(c.name)}</span>
      </button>`).join('')
      + `<button class="cat-cell" data-cat="__new"><span class="cat-cell-emoji">➕</span><span class="cat-cell-name">Новая</span></button>`;
  }

  // дата
  const d = sheet.spentAt;
  $('add-date-text').textContent = d ? `${fmtDay(d)} ${fmtTime(d)}` : 'Сейчас';

  renderRateLine();
}

function renderRateLine() {
  const line = $('rate-line');
  const editBtn = $('rate-edit');

  if (sheet.kind === 'exchange') {
    // курс обмена считается из введённых сумм
    editBtn.classList.add('hidden');
    if (sheet.fromCur === sheet.toCur) {
      $('rate-text').textContent = 'Выберите разные валюты';
      line.classList.remove('hidden');
      return;
    }
    const from = strToNum(sheet.amountStr), to = strToNum(sheet.tipsStr);
    $('rate-text').textContent = (from > 0 && to > 0)
      ? `Курс обмена: 1 ${CUR_SYMBOL[sheet.fromCur]} = ${fmtNum(to / from, 4)} ${CUR_SYMBOL[sheet.toCur]}`
      : 'Введите обе суммы';
    line.classList.remove('hidden');
    return;
  }

  // трата: ручной → свой курс семьи на дату покупки → рыночный
  editBtn.classList.remove('hidden');
  const b = base();
  if (sheet.currency !== b) {
    const custom = getCustomRate(sheet.currency, b, (sheet.spentAt || new Date()).toISOString());
    let rate, label = '';
    if (sheet.manualRate && sheet.manualRate.base === b) {
      rate = sheet.manualRate.value; label = ' (вручную)';
    } else if (custom) {
      rate = custom; label = ' (свой курс)';
    } else {
      rate = rateToBase(sheet.editRates || getCachedRates().perUSD, sheet.currency, b);
    }
    $('rate-text').textContent =
      `Курс: 1 ${CUR_SYMBOL[sheet.currency]} = ${fmtNum(rate, 4)} ${CUR_SYMBOL[b]}${label}`;
    line.classList.remove('hidden');
  } else {
    line.classList.add('hidden');
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
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) {
    try { navigator.vibrate(3); } catch { /* не критично */ }
  }
}

export async function saveSheet() {
  if (sheet.kind === 'exchange') return saveExchangeSheet();

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

async function saveExchangeSheet() {
  const from = round2(strToNum(sheet.amountStr));
  const to = round2(strToNum(sheet.tipsStr));
  if (sheet.fromCur === sheet.toCur) { toast('Выберите разные валюты'); return false; }
  if (from <= 0) { toast('Введите сумму, которую отдали'); return false; }
  if (to <= 0) { toast('Введите сумму, которую получили'); return false; }

  const data = {
    fromCur: sheet.fromCur, fromAmount: from,
    toCur: sheet.toCur, toAmount: to,
    note: $('add-note').value.trim(),
    spentAt: (sheet.spentAt || new Date()).toISOString(),
  };

  if (sheet.editingId) {
    await updateExpense(sheet.editingId, data);
    toast('Обмен сохранён');
  } else {
    await addExchange(data);
    toast(`Обмен: ${fmtMoney(from, sheet.fromCur)} → ${fmtMoney(to, sheet.toCur)}`);
  }
  return true;
}

export async function deleteSheetExpense() {
  if (!sheet.editingId) return;
  const msg = sheet.kind === 'exchange'
    ? 'Удалить этот обмен? Он исчезнет на обоих телефонах.'
    : 'Удалить эту трату? Она исчезнет на обоих телефонах.';
  if (!confirm(msg)) return;
  await deleteExpense(sheet.editingId);
  toast(sheet.kind === 'exchange' ? 'Обмен удалён' : 'Трата удалена');
  closeAddSheet();
}
