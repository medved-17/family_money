// Состояние приложения: операции, категории, настройки, подписки

import { db } from './db.js';
import { uuid, sha256 } from './util.js';
import { currentSnapshot, setCustomRates } from './rates.js';

export const DEFAULT_CATEGORIES = [
  { id: 'food',      name: 'Еда и рестораны', emoji: '🍽️', color: '#DFA036' },
  { id: 'groceries', name: 'Продукты',        emoji: '🛒', color: '#7FA65A' },
  { id: 'transport', name: 'Транспорт',       emoji: '🚕', color: '#5E9ECF' },
  { id: 'housing',   name: 'Жильё',           emoji: '🏠', color: '#9C7BD1' },
  { id: 'fun',       name: 'Развлечения',     emoji: '🎉', color: '#D96C9C' },
  { id: 'shopping',  name: 'Покупки',         emoji: '🛍️', color: '#4FB3A5' },
  { id: 'health',    name: 'Здоровье и уход', emoji: '💊', color: '#CD5A5A' },
  { id: 'gifts',     name: 'Подарки',         emoji: '🎁', color: '#DE8550' },
  { id: 'other',     name: 'Другое',          emoji: '📎', color: '#8F8B80' },
];

const listeners = new Set();

export const state = {
  ready: false,
  expenses: [],        // все операции, включая tombstone (deleted)
  categories: [],
  settings: {
    baseCurrency: 'RUB',
    lastCurrency: 'RUB',
    passwordHash: null,
    passwordSalt: null,
    // свои курсы семьи: доллар покупали по 82 ₽, евро 105 ₽, лира из 47 ₺/$
    // каждый курс может иметь периоды: { from: '2026-08-15', ... } — «с этой даты»
    customRates: {
      USD: [{ from: null, base: 'RUB', value: 82 }],
      EUR: [{ from: null, base: 'RUB', value: 105 }],
      TRY: [{ from: null, base: 'RUB', value: 1.7447 }],
    },
    // выключенные валюты не показываются при добавлении траты (евро включается в настройках)
    hiddenCurrencies: ['EUR'],
    balances: { USD: 0, TRY: 0, RUB: 0, EUR: 0 },
    balancesUpdatedAt: null,
    familySettingsUpdatedAt: null,
  },
  profile: null,       // 'sonya' | 'nikita' — локально для устройства (AUTH-04)
  unlocked: false,
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify(what = 'all') { listeners.forEach(fn => fn(what)); }

// ─── Инициализация ───
export async function initStore() {
  const [expenses, categories, settings, profile, unlocked] = await Promise.all([
    db.allExpenses(),
    db.allCategories(),
    db.getMeta('settings'),
    db.getMeta('profile'),
    db.getMeta('unlocked'),
  ]);

  state.expenses = expenses || [];

  if (!categories || !categories.length) {
    const now = new Date().toISOString();
    state.categories = DEFAULT_CATEGORIES.map((c, i) => ({
      ...c, builtin: true, hidden: false, sortOrder: i, updatedAt: now, deleted: false,
    }));
    await db.putCategories(state.categories);
  } else {
    state.categories = categories.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
    // миграция: подтягиваем актуальные цвета встроенных категорий (палитра дизайн-системы)
    const defs = new Map(DEFAULT_CATEGORIES.map(c => [c.id, c]));
    const patched = [];
    for (const c of state.categories) {
      const d = defs.get(c.id);
      if (c.builtin && d && c.color !== d.color) { c.color = d.color; patched.push(c); }
    }
    if (patched.length) await db.putCategories(patched);
  }

  if (settings) Object.assign(state.settings, settings);
  setCustomRates(state.settings.customRates);
  state.profile = profile || null;
  state.unlocked = !!unlocked;
  state.ready = true;
}

export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  setCustomRates(state.settings.customRates);
  await db.setMeta('settings', { ...state.settings });
  notify('settings');
}

export async function saveFamilySettings(patch, updatedAt = new Date().toISOString()) {
  Object.assign(state.settings, patch, { familySettingsUpdatedAt: updatedAt });
  setCustomRates(state.settings.customRates);
  await db.setMeta('settings', { ...state.settings });
  notify('settings');
  queueSync();
}

export async function saveBalances(balances, updatedAt = new Date().toISOString()) {
  state.settings.balances = { ...state.settings.balances, ...balances };
  state.settings.balancesUpdatedAt = updatedAt;
  await db.setMeta('settings', { ...state.settings });
  notify('settings');
  queueSync();
}

// ─── Аутентификация (локальный режим): хэш пароля, DATA-04 ───
export async function setPassword(password) {
  const salt = uuid();
  const hash = await sha256(salt + password);
  await saveSettings({ passwordHash: hash, passwordSalt: salt });
}
export async function checkPassword(password) {
  const { passwordHash, passwordSalt } = state.settings;
  if (!passwordHash) return false;
  return (await sha256(passwordSalt + password)) === passwordHash;
}
export async function setUnlocked(v) {
  state.unlocked = v;
  await db.setMeta('unlocked', v);
}
export async function setProfile(p) {
  state.profile = p;
  await db.setMeta('profile', p);
  notify('profile');
}

// ─── Операции ───
export function visibleExpenses() {
  return state.expenses.filter(e => !e.deleted);
}

export async function addExpense({ amount, tips, currency, categoryId, note, spentAt, manualRate }) {
  const now = new Date().toISOString();
  const e = {
    id: uuid(),
    author: state.profile,
    amount, tips: tips || 0,
    currency,
    rates: currentSnapshot(),   // снимок курсов на момент записи (CUR-03)
    manualRate: manualRate || null,
    category: categoryId,
    note: note || '',
    spentAt: spentAt || now,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
  state.expenses.push(e);
  await db.putExpense(e);
  notify('expenses');
  queueSync();
  return e;
}

export async function updateExpense(id, patch) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  Object.assign(e, patch, { updatedAt: new Date().toISOString() });
  await db.putExpense(e);
  notify('expenses');
  queueSync();
}

export async function deleteExpense(id) {
  // tombstone — чтобы удаление синхронизировалось и не воскресало (SYNC-05, правило 8)
  await updateExpense(id, { deleted: true });
}

// ─── Категории ───
export function visibleCategories() {
  return state.categories.filter(c => !c.deleted && !c.hidden);
}
export function categoryById(id) {
  return state.categories.find(c => c.id === id)
    || { id, name: 'Другое', emoji: '📎', color: '#8d8a7e' };
}

export async function addCategory(name, emoji) {
  const c = {
    id: 'c-' + uuid().slice(0, 8),
    name, emoji: emoji || '🏷️',
    color: '#8d8a7e', builtin: false, hidden: false,
    sortOrder: state.categories.length,
    updatedAt: new Date().toISOString(), deleted: false,
  };
  state.categories.push(c);
  await db.putCategory(c);
  notify('categories');
  queueSync();
  return c;
}

export async function updateCategory(id, patch) {
  const c = state.categories.find(x => x.id === id);
  if (!c) return;
  Object.assign(c, patch, { updatedAt: new Date().toISOString() });
  await db.putCategory(c);
  notify('categories');
  queueSync();
}

// Частота использования категорий — для умного порядка в форме добавления
export function categoriesByUsage() {
  const counts = {};
  for (const e of visibleExpenses()) counts[e.category] = (counts[e.category] || 0) + 1;
  return [...visibleCategories()].sort((a, b) => {
    const d = (counts[b.id] || 0) - (counts[a.id] || 0);
    return d !== 0 ? d : (a.sortOrder ?? 99) - (b.sortOrder ?? 99);
  });
}

// ─── Слияние при синхронизации: LWW по updatedAt (SYNC-06) ───
export async function mergeRemote(remoteExpenses, remoteCategories, remoteWallet = null, remoteFamilySettings = null) {
  let changed = false;
  const byId = new Map(state.expenses.map(e => [e.id, e]));
  const toWrite = [];
  for (const r of remoteExpenses || []) {
    const local = byId.get(r.id);
    if (!local) { state.expenses.push(r); toWrite.push(r); changed = true; }
    else if ((r.updatedAt || '') > (local.updatedAt || '')) {
      Object.assign(local, r); toWrite.push(local); changed = true;
    }
  }
  if (toWrite.length) await db.putExpenses(toWrite);

  const catById = new Map(state.categories.map(c => [c.id, c]));
  const catWrite = [];
  for (const r of remoteCategories || []) {
    const local = catById.get(r.id);
    if (!local) { state.categories.push(r); catWrite.push(r); changed = true; }
    else if ((r.updatedAt || '') > (local.updatedAt || '')) {
      Object.assign(local, r); catWrite.push(local); changed = true;
    }
  }
  if (catWrite.length) await db.putCategories(catWrite);

  if (remoteWallet?.balances && (remoteWallet.updatedAt || '') > (state.settings.balancesUpdatedAt || '')) {
    state.settings.balances = { ...state.settings.balances, ...remoteWallet.balances };
    state.settings.balancesUpdatedAt = remoteWallet.updatedAt;
    await db.setMeta('settings', { ...state.settings });
    changed = true;
  }

  if (remoteFamilySettings && (remoteFamilySettings.updatedAt || '') > (state.settings.familySettingsUpdatedAt || '')) {
    const { baseCurrency, hiddenCurrencies, customRates, updatedAt } = remoteFamilySettings;
    if (baseCurrency) state.settings.baseCurrency = baseCurrency;
    if (Array.isArray(hiddenCurrencies)) state.settings.hiddenCurrencies = hiddenCurrencies;
    if (customRates) {
      state.settings.customRates = customRates;
      setCustomRates(customRates);
    }
    state.settings.familySettingsUpdatedAt = updatedAt;
    await db.setMeta('settings', { ...state.settings });
    changed = true;
  }

  if (changed) notify('all');
  return changed;
}

// ─── Хук синхронизации (подставляется sync.js) ───
let syncHook = null;
export function setSyncHook(fn) { syncHook = fn; }
function queueSync() { if (syncHook) syncHook(); }

// ─── Резервная копия (DATA-01, DATA-02) ───
export function backupJSON() {
  return JSON.stringify({
    app: 'family-money',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      baseCurrency: state.settings.baseCurrency,
      customRates: state.settings.customRates,
      hiddenCurrencies: state.settings.hiddenCurrencies,
      balances: state.settings.balances,
    },
    categories: state.categories,
    expenses: state.expenses,
  }, null, 2);
}

export async function restoreBackup(json) {
  const data = JSON.parse(json);
  if (data.app !== 'family-money' || !Array.isArray(data.expenses)) {
    throw new Error('Это не резервная копия «Наших денег»');
  }
  // восстановление сливается с текущими данными (побеждает более свежее updatedAt)
  await mergeRemote(data.expenses, data.categories);
  notify('expenses');
  return data.expenses.filter(e => !e.deleted).length;
}
