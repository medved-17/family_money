// Экран настроек

import {
  state, saveSettings, setProfile, setPassword, checkPassword,
  visibleExpenses, addCategory, updateCategory, backupJSON, restoreBackup,
} from './store.js';
import { db } from './db.js';
import { AUTHORS, CUR_SYMBOL, CURRENCIES, fmtNum, escapeHtml, toast, downloadBlob } from './util.js';
import { getCachedRates, refreshRates, getCustomRate, rateToBase } from './rates.js';
import { syncState, getConfig, saveConfig, clearConfig, signIn, getCred } from './sync.js';
import { I } from './icons.js';

const $ = id => document.getElementById(id);

const THEME_NAMES = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' };
function getTheme() {
  try { return localStorage.getItem('fm-theme') || 'auto'; } catch { return 'auto'; }
}
export function applyTheme(t) {
  try { t === 'auto' ? localStorage.removeItem('fm-theme') : localStorage.setItem('fm-theme', t); } catch { /* приватный режим */ }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

export function renderSettings() {
  const s = state.settings;
  const prof = AUTHORS[state.profile];
  const rates = getCachedRates();
  const ratesAge = rates.ts ? new Date(rates.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ещё не загружены';
  const cred = getCred();

  const catRows = state.categories.filter(c => !c.deleted).map(c => `
    <div class="cat-manage-row">
      <span class="cat-bar-emoji" style="background:${c.color}22">${c.emoji}</span>
      <span class="cat-manage-name ${c.hidden ? 'hidden-cat' : ''}">${escapeHtml(c.name)}</span>
      <button class="cat-manage-act" data-cat-rename="${c.id}">${I.pencil}</button>
      <button class="cat-manage-act" data-cat-hide="${c.id}">${c.hidden ? 'Вернуть' : 'Скрыть'}</button>
    </div>`).join('');

  $('settings-body').innerHTML = `
    <div class="set-group">
      <div class="set-group-title">Профиль</div>
      <div class="set-card">
        <button class="set-row" id="set-switch-profile">
          <span class="ava ava-${state.profile}" style="width:32px;height:32px;font-size:14px">${prof?.letter || '?'}</span>
          <span class="set-row-label">${prof?.name || '—'}
            <span class="set-row-sub">Профиль этого телефона</span></span>
          <span class="set-row-value">Сменить</span>
          <span class="set-row-chev">${I.fwd}</span>
        </button>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title">Деньги</div>
      <div class="set-card">
        <label class="set-row">
          <span class="set-row-ico">${I.wallet}</span>
          <span class="set-row-label">Базовая валюта
            <span class="set-row-sub">Все итоги и аналитика — в ней</span></span>
          <span class="set-row-value num">${s.baseCurrency} ${CUR_SYMBOL[s.baseCurrency]}</span>
          <span class="set-row-chev">${I.fwd}</span>
          <select id="set-base-cur">
            ${['RUB', 'EUR', 'USD', 'TRY'].map(c =>
              `<option value="${c}" ${c === s.baseCurrency ? 'selected' : ''}>${c} ${CUR_SYMBOL[c]}</option>`).join('')}
          </select>
        </label>
        <button class="set-row" id="set-refresh-rates">
          <span class="set-row-ico">${I.refresh}</span>
          <span class="set-row-label">Обновить рыночные курсы
            <span class="set-row-sub">Загружены: ${ratesAge}</span></span>
          <span class="set-row-chev">${I.fwd}</span>
        </button>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title">Валюты и курсы</div>
      <div class="set-card">
        ${CURRENCIES.filter(c => c !== s.baseCurrency).map(cur => {
          const hidden = (s.hiddenCurrencies || []).includes(cur);
          const custom = getCustomRate(cur, s.baseCurrency);
          const market = rateToBase(getCachedRates().perUSD, cur, s.baseCurrency);
          const sub = custom
            ? `Свой курс: 1 ${CUR_SYMBOL[cur]} = ${fmtNum(custom, 4)} ${CUR_SYMBOL[s.baseCurrency]}`
            : `Рыночный: 1 ${CUR_SYMBOL[cur]} ≈ ${fmtNum(market, 4)} ${CUR_SYMBOL[s.baseCurrency]}`;
          return `
          <div class="cat-manage-row">
            <span class="cat-bar-emoji num" style="background:var(--accent-soft);color:var(--accent);font-size:15px;font-weight:700">${CUR_SYMBOL[cur]}</span>
            <span class="cat-manage-name"><span class="${hidden ? 'struck' : ''}">${cur}</span>
              <span class="set-row-sub num">${hidden ? 'Выключена' : sub}</span></span>
            <button class="cat-manage-act" data-cur-rate="${cur}" title="Свой курс">${I.pencil}</button>
            <button class="cat-manage-act" data-cur-hide="${cur}">${hidden ? 'Включить' : 'Выключить'}</button>
          </div>`;
        }).join('')}
        <div class="set-row" style="pointer-events:none">
          <span class="set-row-ico">${I.spark}</span>
          <span class="set-row-sub" style="flex:1">Свой курс — по которому вы реально покупали валюту: он важнее рыночного. Выключенная валюта не показывается при добавлении траты.</span>
        </div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title">Вид</div>
      <div class="set-card">
        <label class="set-row">
          <span class="set-row-ico">${I.eye}</span>
          <span class="set-row-label">Тема</span>
          <span class="set-row-value">${THEME_NAMES[getTheme()]}</span>
          <span class="set-row-chev">${I.fwd}</span>
          <select id="set-theme">
            ${Object.entries(THEME_NAMES).map(([v, n]) =>
              `<option value="${v}" ${v === getTheme() ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title">Категории</div>
      <div class="set-card">
        ${catRows}
        <button class="set-row" id="set-add-cat">
          <span class="set-row-ico" style="color:var(--accent)">${I.plus}</span>
          <span class="set-row-label" style="color:var(--accent)">Добавить категорию</span>
        </button>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title">Синхронизация</div>
      <div class="set-card">
        <div class="set-row" style="pointer-events:none">
          <span class="set-row-ico" style="color:${syncState.connected ? 'var(--ok)' : 'var(--ink-3)'}">${syncState.connected ? I.cloudCheck : I.cloudOff}</span>
          <span class="set-row-label">${syncState.connected ? 'Подключена' : syncState.configured ? 'Настроена, нужен вход' : 'Не настроена'}
            <span class="set-row-sub">${syncState.connected
              ? (syncState.lastSyncAt ? 'Обновлено ' + syncState.lastSyncAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Ожидание данных…')
              : syncState.error || 'Работает через бесплатный Firebase — см. инструкцию в репозитории'}</span></span>
        </div>
        <button class="set-row" id="set-sync-config">
          <span class="set-row-ico">${I.cloud}</span>
          <span class="set-row-label">${getConfig() ? 'Изменить конфиг Firebase' : 'Вставить конфиг Firebase'}</span>
          <span class="set-row-chev">${I.fwd}</span>
        </button>
        ${getConfig() && !syncState.connected ? `
        <button class="set-row" id="set-sync-login">
          <span class="set-row-ico">${I.key}</span>
          <span class="set-row-label">Войти в общий аккаунт${cred ? `<span class="set-row-sub">${escapeHtml(cred.email)}</span>` : ''}</span>
          <span class="set-row-chev">${I.fwd}</span>
        </button>` : ''}
        ${getConfig() ? `
        <button class="set-row" id="set-sync-off">
          <span class="set-row-ico">${I.x}</span>
          <span class="set-row-label">Отключить синхронизацию на этом телефоне</span>
        </button>` : ''}
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title">Данные</div>
      <div class="set-card">
        <button class="set-row" id="set-backup">
          <span class="set-row-ico">${I.download}</span>
          <span class="set-row-label">Скачать резервную копию
            <span class="set-row-sub">Все операции и категории в одном файле</span></span>
          <span class="set-row-chev">${I.fwd}</span>
        </button>
        <button class="set-row" id="set-restore">
          <span class="set-row-ico">${I.doc}</span>
          <span class="set-row-label">Восстановить из копии</span>
          <span class="set-row-chev">${I.fwd}</span>
          <input type="file" id="set-restore-file" accept=".json,application/json" style="position:absolute;inset:0;opacity:0;width:100%">
        </button>
        <button class="set-row" id="set-change-pass">
          <span class="set-row-ico">${I.lock}</span>
          <span class="set-row-label">Сменить пароль</span>
          <span class="set-row-chev">${I.fwd}</span>
        </button>
      </div>
    </div>

    <div class="set-group">
      <div class="set-card">
        <button class="set-row danger" id="set-logout">
          <span class="set-row-ico">${I.logout}</span>
          <span class="set-row-label">Выйти на этом устройстве</span>
        </button>
      </div>
      <p style="text-align:center;color:var(--ink-3);font-size:12px;padding:16px 0 4px">
        Наши деньги · для Сони и Никиты 💛
      </p>
    </div>
  `;

  bindSettings();
}

function bindSettings() {
  $('set-switch-profile').onclick = async () => {
    const next = state.profile === 'sonya' ? 'nikita' : 'sonya';
    if (confirm(`Сменить профиль этого телефона на «${AUTHORS[next].name}»? Новые траты будут записываться от этого имени.`)) {
      await setProfile(next);
      renderSettings();
      toast(`Теперь вы — ${AUTHORS[next].name}`);
    }
  };

  $('set-base-cur').onchange = async (e) => {
    const next = e.target.value;
    // базовую валюту нельзя держать выключенной
    const hiddenCurrencies = (state.settings.hiddenCurrencies || []).filter(c => c !== next);
    await saveSettings({ baseCurrency: next, hiddenCurrencies });
    renderSettings();
    toast(`Базовая валюта: ${next}`);
  };

  // свой курс валюты («доллар покупали по 82»)
  document.querySelectorAll('[data-cur-rate]').forEach(b => b.onclick = async () => {
    const cur = b.dataset.curRate;
    const bse = state.settings.baseCurrency;
    const current = getCustomRate(cur, bse);
    const raw = prompt(
      `1 ${cur} = ? ${bse}\n\nПустое поле — вернуть рыночный курс.`,
      current ? String(current).replace('.', ',') : '');
    if (raw === null) return;
    const customRates = { ...(state.settings.customRates || {}) };
    const v = parseFloat(raw.replace(',', '.').replace(/\s/g, ''));
    if (raw.trim() === '' || !isFinite(v) || v <= 0) {
      delete customRates[cur];
      await saveSettings({ customRates });
      toast(`${cur}: рыночный курс`);
    } else {
      customRates[cur] = { base: bse, value: v };
      await saveSettings({ customRates });
      toast(`Свой курс: 1 ${CUR_SYMBOL[cur]} = ${fmtNum(v, 4)} ${CUR_SYMBOL[bse]}`);
    }
    renderSettings();
  });

  // выключение валюты
  document.querySelectorAll('[data-cur-hide]').forEach(b => b.onclick = async () => {
    const cur = b.dataset.curHide;
    const list = new Set(state.settings.hiddenCurrencies || []);
    list.has(cur) ? list.delete(cur) : list.add(cur);
    await saveSettings({ hiddenCurrencies: [...list] });
    renderSettings();
  });

  $('set-theme').onchange = (e) => {
    applyTheme(e.target.value);
    renderSettings();
  };

  $('set-refresh-rates').onclick = async () => {
    toast('Обновляю курсы…');
    const r = await refreshRates(true);
    renderSettings();
    toast(r.ts && Date.now() - r.ts < 60000 ? 'Курсы обновлены' : 'Нет сети — используются сохранённые курсы');
  };

  $('set-add-cat').onclick = async () => {
    const name = prompt('Название новой категории:');
    if (!name || !name.trim()) return;
    const emoji = prompt('Эмодзи для категории (одно):', '🏷️') || '🏷️';
    await addCategory(name.trim(), emoji.trim().slice(0, 4));
    renderSettings();
    toast('Категория добавлена');
  };

  document.querySelectorAll('[data-cat-rename]').forEach(b => b.onclick = async () => {
    const id = b.dataset.catRename;
    const c = state.categories.find(x => x.id === id);
    const name = prompt('Новое название:', c.name);
    if (!name || !name.trim()) return;
    const emoji = prompt('Эмодзи:', c.emoji) || c.emoji;
    await updateCategory(id, { name: name.trim(), emoji: emoji.trim().slice(0, 4) });
    renderSettings();
  });
  document.querySelectorAll('[data-cat-hide]').forEach(b => b.onclick = async () => {
    const id = b.dataset.catHide;
    const c = state.categories.find(x => x.id === id);
    await updateCategory(id, { hidden: !c.hidden });
    renderSettings();
  });

  $('set-sync-config').onclick = async () => {
    const raw = prompt('Вставьте JSON-конфиг Firebase (из консоли Firebase → настройки проекта → «Ваши приложения»):',
      getConfig() ? JSON.stringify(getConfig()) : '');
    if (!raw) return;
    try {
      const cfg = JSON.parse(raw);
      if (!cfg.apiKey || !cfg.projectId) throw new Error();
      saveConfig(cfg);
      toast('Конфиг сохранён. Теперь войдите в аккаунт.');
      renderSettings();
    } catch {
      toast('Не похоже на конфиг Firebase');
    }
  };

  const loginBtn = $('set-sync-login');
  if (loginBtn) loginBtn.onclick = async () => {
    const cred = getCred();
    const email = prompt('E-mail общего аккаунта Firebase:', cred?.email || '');
    if (!email) return;
    const password = prompt('Пароль общего аккаунта Firebase:');
    if (!password) return;
    try {
      toast('Подключаюсь…');
      await signIn(email.trim(), password);
      renderSettings();
      toast('Синхронизация подключена 🎉');
    } catch (e) {
      console.warn(e);
      toast('Не удалось войти — проверьте e-mail и пароль');
    }
  };

  const offBtn = $('set-sync-off');
  if (offBtn) offBtn.onclick = () => {
    if (confirm('Отключить синхронизацию на этом телефоне? Локальные данные останутся.')) {
      clearConfig();
      renderSettings();
    }
  };

  $('set-backup').onclick = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([backupJSON()], { type: 'application/json' }), `nashi-dengi-backup-${stamp}.json`);
    toast('Резервная копия скачана');
  };

  $('set-restore-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const n = await restoreBackup(await file.text());
      renderSettings();
      toast(`Восстановлено. Операций в базе: ${n}`);
    } catch (err) {
      toast(err.message || 'Не удалось прочитать файл');
    }
    e.target.value = '';
  };

  $('set-change-pass').onclick = async () => {
    const old = prompt('Текущий пароль:');
    if (old === null) return;
    if (!(await checkPassword(old))) { toast('Неверный текущий пароль'); return; }
    const next = prompt('Новый пароль (минимум 4 символа):');
    if (!next || next.length < 4) { toast('Слишком короткий пароль'); return; }
    await setPassword(next);
    toast('Пароль изменён. Введите его на втором телефоне при следующем входе.');
  };

  $('set-logout').onclick = async () => {
    const hasSync = syncState.connected;
    const msg = hasSync
      ? 'Выйти и удалить данные с этого телефона? В облаке они сохранятся.'
      : 'Выйти и удалить данные с этого телефона?\n\nСинхронизация не подключена — без резервной копии данные будут потеряны безвозвратно. Сначала скачайте копию!';
    if (!confirm(msg)) return;
    if (!hasSync && visibleExpenses().length && !confirm('Точно удалить? Это последнее предупреждение 🙂')) return;
    localStorage.clear();
    await db.wipe();
    location.reload();
  };
}
