// Синхронизация через Firebase Firestore (опционально).
// Приложение полностью работает локально; когда в настройках вставлен конфиг Firebase,
// включается автосинк: локальные изменения выталкиваются, удалённые сливаются (LWW).
// Инструкция по созданию бесплатного проекта Firebase — в README.md.

import { state, mergeRemote, setSyncHook, notify } from './store.js';

const LS_CFG = 'fm-firebase-config';
const LS_CRED = 'fm-firebase-cred';
const DEFAULT_CFG = {
  apiKey: 'AIzaSyCJPCaQNtfyNWOUBsAnYFpXlx6kqCIEDhM',
  authDomain: 'family-money-9af01.firebaseapp.com',
  projectId: 'family-money-9af01',
  storageBucket: 'family-money-9af01.firebasestorage.app',
  messagingSenderId: '854158404568',
  appId: '1:854158404568:web:2618ac0444f124c37020ad',
};

export const syncState = {
  configured: false,
  connected: false,
  error: null,
  lastSyncAt: null,
};

let fb = null; // { db, fs, spaceRef }
let pushTimer = null;
let started = false;

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(LS_CFG) || 'null') || DEFAULT_CFG; } catch { return DEFAULT_CFG; }
}
export function hasCustomConfig() { return !!localStorage.getItem(LS_CFG); }
export function saveConfig(cfg) { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); }
export function clearConfig() {
  localStorage.removeItem(LS_CFG);
  localStorage.removeItem(LS_CRED);
  syncState.configured = true;
  syncState.connected = false;
  notify('sync');
}
export function saveCred(email, password) {
  // e-mail общего аккаунта Firebase; пароль здесь не хранится в открытом виде —
  // Firebase SDK сам сохраняет токен сессии
  localStorage.setItem(LS_CRED, JSON.stringify({ email }));
}
export function getCred() {
  try { return JSON.parse(localStorage.getItem(LS_CRED) || 'null'); } catch { return null; }
}

export async function initSync() {
  const cfg = getConfig();
  syncState.configured = !!cfg;
  setSyncHook(schedulePush);
  if (!cfg) return;
  try {
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
    ]);
    const app = initializeApp(cfg);
    const authInst = auth.getAuth(app);

    await new Promise((resolve) => {
      const off = auth.onAuthStateChanged(authInst, () => { off(); resolve(); });
    });
    if (!authInst.currentUser) {
      syncState.error = 'Нужен вход в Firebase-аккаунт';
      notify('sync');
      return;
    }
    connect(app, fs, authInst.currentUser.uid);
  } catch (e) {
    syncState.error = 'Не удалось запустить синхронизацию';
    console.warn('sync init failed', e);
    notify('sync');
  }
}

// Вход по e-mail/паролю общего аккаунта (вызывается из настроек)
export async function signIn(email, password) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Сначала вставьте конфиг Firebase');
  const [{ initializeApp, getApps }, auth, fs] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
  ]);
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  const authInst = auth.getAuth(app);
  const cred = await auth.signInWithEmailAndPassword(authInst, email, password);
  saveCred(email);
  connect(app, fs, cred.user.uid);
}

function connect(app, fs, uid) {
  const dbi = fs.getFirestore(app);
  fb = { fs, db: dbi, uid };
  syncState.connected = true;
  syncState.error = null;
  notify('sync');

  // подписка на удалённые изменения
  const expCol = fs.collection(dbi, 'spaces', uid, 'expenses');
  const catCol = fs.collection(dbi, 'spaces', uid, 'categories');
  const walletRef = fs.doc(dbi, 'spaces', uid, 'wallet', 'balances');
  const settingsRef = fs.doc(dbi, 'spaces', uid, 'settings', 'family');
  fs.onSnapshot(expCol, snap => {
    const remote = snap.docs.map(d => d.data());
    mergeRemote(remote, []).then(() => {
      syncState.lastSyncAt = new Date();
      notify('sync');
    });
  }, err => { syncState.error = 'Ошибка чтения из облака'; console.warn(err); notify('sync'); });
  fs.onSnapshot(catCol, snap => {
    const remote = snap.docs.map(d => d.data());
    mergeRemote([], remote);
  });
  fs.onSnapshot(walletRef, snap => {
    if (!snap.exists()) return;
    mergeRemote([], [], snap.data()).then(() => {
      syncState.lastSyncAt = new Date();
      notify('sync');
    });
  }, err => { syncState.error = 'Ошибка чтения кошелька'; console.warn(err); notify('sync'); });
  fs.onSnapshot(settingsRef, snap => {
    if (!snap.exists()) return;
    mergeRemote([], [], null, snap.data()).then(() => {
      syncState.lastSyncAt = new Date();
      notify('sync');
    });
  }, err => { syncState.error = 'Ошибка чтения настроек'; console.warn(err); notify('sync'); });

  schedulePush();
}

function schedulePush() {
  if (!fb) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushAll, 800);
}

async function pushAll() {
  if (!fb) return;
  const { fs, db: dbi, uid } = fb;
  try {
    const lastPush = localStorage.getItem('fm-last-push') || '';
    const dirtyExp = state.expenses.filter(e => (e.updatedAt || '') > lastPush);
    const dirtyCat = state.categories.filter(c => (c.updatedAt || '') > lastPush);
    const dirtyWallet = (state.settings.balancesUpdatedAt || '') > lastPush;
    const dirtyFamilySettings = (state.settings.familySettingsUpdatedAt || '') > lastPush;
    if (!dirtyExp.length && !dirtyCat.length && !dirtyWallet && !dirtyFamilySettings) return;

    const batchLimit = 400;
    for (let i = 0; i < dirtyExp.length; i += batchLimit) {
      const batch = fs.writeBatch(dbi);
      for (const e of dirtyExp.slice(i, i + batchLimit)) {
        batch.set(fs.doc(dbi, 'spaces', uid, 'expenses', e.id), sanitize(e));
      }
      await batch.commit();
    }
    if (dirtyCat.length) {
      const batch = fs.writeBatch(dbi);
      for (const c of dirtyCat.slice(0, batchLimit)) {
        batch.set(fs.doc(dbi, 'spaces', uid, 'categories', c.id), sanitize(c));
      }
      await batch.commit();
    }
    if (dirtyWallet) {
      await fs.setDoc(fs.doc(dbi, 'spaces', uid, 'wallet', 'balances'), sanitize({
        balances: state.settings.balances || {},
        remainingMode: state.settings.remainingMode || 'auto',
        manualRemaining: state.settings.manualRemaining || {},
        updatedAt: state.settings.balancesUpdatedAt,
      }));
    }
    if (dirtyFamilySettings) {
      await fs.setDoc(fs.doc(dbi, 'spaces', uid, 'settings', 'family'), sanitize({
        baseCurrency: state.settings.baseCurrency,
        hiddenCurrencies: state.settings.hiddenCurrencies || [],
        customRates: state.settings.customRates || {},
        updatedAt: state.settings.familySettingsUpdatedAt,
      }));
    }
    localStorage.setItem('fm-last-push', new Date().toISOString());
    syncState.lastSyncAt = new Date();
    syncState.error = null;
    notify('sync');
  } catch (e) {
    // офлайн или ошибка — повторим позже (SYNC-04)
    console.warn('push failed', e);
    setTimeout(schedulePush, 30000);
  }
}

// Firestore не принимает undefined
function sanitize(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// повторная попытка при появлении сети
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (started || fb) schedulePush(); });
}
export function markStarted() { started = true; }
