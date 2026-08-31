// Экспорт: Excel (.xlsx) и PDF-отчёт за выбранный период

import { state, categoryById } from './store.js';
import { toBase, tipsToBase, effectiveRate } from './rates.js';
import { summarize } from './agg.js';
import { buildXlsx, S } from './xlsx.js';
import { ReportPainter, buildPdfFromCanvases } from './pdf.js';
import { AUTHORS, CUR_SYMBOL, fmtNum, fmtMoney, periodTitle, downloadBlob, round2, toast } from './util.js';

function base() { return state.settings.baseCurrency; }
const stamp = () => new Date().toISOString().slice(0, 10);

// ─── Excel (11.1): операции построчно + лист сводки ───
export function exportXlsx(expenses, period) {
  const b = base();
  const sorted = [...expenses].sort((a, c) => a.spentAt.localeCompare(c.spentAt));

  const rows = [
    [{ v: `Наши деньги — операции, ${periodTitle(period)}`, style: S.BOLD }],
    [],
    ['Дата', 'Время', 'Автор', 'Категория', 'Комментарий', 'Сумма', 'Чаевые', 'Итого', 'Валюта',
     `Курс к ${b}`, `Сумма в ${b}`].map(v => ({ v, style: S.HEAD })),
    ...sorted.map(e => {
      const d = new Date(e.spentAt);
      const rate = effectiveRate(e, b);
      return [
        d.toLocaleDateString('ru-RU'),
        d.toTimeString().slice(0, 5),
        AUTHORS[e.author]?.name || e.author,
        categoryById(e.category).name,
        e.note || '',
        { v: e.amount, style: S.NUM },
        { v: e.tips || 0, style: S.NUM },
        { v: round2(e.amount + (e.tips || 0)), style: S.NUM },
        e.currency,
        { v: round2(rate * 10000) / 10000, style: S.NUM },
        { v: round2(toBase(e, b)), style: S.NUM },
      ];
    }),
  ];

  const s = summarize(expenses, b);
  const summaryRows = [
    [{ v: `Сводка за период: ${periodTitle(period)}`, style: S.BOLD }],
    [{ v: `Базовая валюта: ${b}`, style: S.NORM }],
    [],
    [{ v: 'Итоги', style: S.HEAD }],
    ['Всего потрачено', { v: round2(s.total), style: S.NUM }],
    ['В том числе чаевые', { v: round2(s.tips), style: S.NUM }],
    ['Количество операций', s.count],
    ['Средний чек (с чаевыми)', { v: s.count ? round2(s.total / s.count) : 0, style: S.NUM }],
    [],
    [{ v: 'По категориям', style: S.HEAD }],
    ...s.cats.map(({ cat, value }) => [cat.name, { v: round2(value), style: S.NUM }]),
    [],
    [{ v: 'По пользователям', style: S.HEAD }],
    ...['sonya', 'nikita'].map(a => [AUTHORS[a].name, { v: round2(s.byAuthor[a] || 0), style: S.NUM }]),
    [],
    [{ v: 'По валютам', style: S.HEAD }],
    ...[...s.byCur.entries()].map(([cur, v]) =>
      [`${cur}`, { v: round2(v.orig), style: S.NUM }, `в ${b}:`, { v: round2(v.base), style: S.NUM }]),
  ];

  const blob = buildXlsx([
    { name: 'Операции', rows, colWidths: [11, 7, 9, 18, 24, 10, 9, 10, 8, 10, 12] },
    { name: 'Сводка', rows: summaryRows, colWidths: [26, 14, 8, 14] },
  ]);
  downloadBlob(blob, `nashi-dengi-${stamp()}.xlsx`);
  toast('Excel сохранён');
}

// ─── PDF (11.2): компактный отчёт ───
export function exportPdf(expenses, period) {
  const b = base();
  const s = summarize(expenses, b);
  const p = new ReportPainter();
  const money = v => `${fmtNum(round2(v))} ${CUR_SYMBOL[b]}`;

  p.title('Наши деньги', `Отчёт о расходах · ${periodTitle(period)} · Соня и Никита`);

  p.sectionHead('Итоги');
  p.kv('Всего потрачено', money(s.total), true);
  p.kv('В том числе чаевые', money(s.tips));
  if (s.total > 0) p.kv('Доля чаевых', `${(s.tips / s.total * 100).toFixed(1).replace('.', ',')} %`);
  p.kv('Количество покупок', String(s.count));
  if (s.count) {
    p.kv('Средний чек (с чаевыми)', money(s.total / s.count));
    p.kv('Средний чек (без чаевых)', money((s.total - s.tips) / s.count));
  }

  if (s.cats.length) {
    p.sectionHead('По категориям');
    for (const { cat, value } of s.cats) {
      const pct = s.total > 0 ? Math.round(value / s.total * 100) : 0;
      p.kv(`${cat.emoji} ${cat.name}  ·  ${pct}%`, money(value));
    }
  }

  p.sectionHead('Кто сколько потратил');
  for (const a of ['sonya', 'nikita']) {
    const v = s.byAuthor[a] || 0;
    const pct = s.total > 0 ? Math.round(v / s.total * 100) : 0;
    p.kv(`${AUTHORS[a].name}  ·  ${pct}%`, money(v));
  }

  if (s.byCur.size) {
    p.sectionHead('По валютам');
    for (const [cur, v] of [...s.byCur.entries()].sort((x, y) => y[1].base - x[1].base)) {
      p.kv(`${cur} — ${v.count} опер.`, `${fmtNum(round2(v.orig))} ${CUR_SYMBOL[cur]}  ≈  ${money(v.base)}`);
    }
  }

  // таблица операций
  const sorted = [...expenses].sort((a, c) => c.spentAt.localeCompare(a.spentAt)).slice(0, 400);
  if (sorted.length) {
    p.sectionHead('Операции');
    const widths = [0.15, 0.10, 0.33, 0.20, 0.22];
    p.row(['Дата', 'Автор', 'Категория / комментарий', 'Сумма', `В ${b}`], widths,
      { bold: true, size: 21, color: '#85806f' });
    for (const e of sorted) {
      const d = new Date(e.spentAt);
      const cat = categoryById(e.category);
      const label = e.note ? `${cat.name} · ${e.note}` : cat.name;
      const amt = `${fmtNum(e.amount)}${e.tips ? `−${fmtNum(e.tips)}` : ''} ${CUR_SYMBOL[e.currency]}`;
      p.row([
        d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }),
        AUTHORS[e.author]?.name || '',
        label, amt, fmtNum(round2(toBase(e, b))),
      ], widths, { size: 21 });
    }
    if (expenses.length > 400) {
      p.row([`… и ещё ${expenses.length - 400} операций (полный список — в Excel)`, '', '', '', ''], [1, 0, 0, 0, 0], { size: 20, color: '#85806f' });
    }
  }

  const blob = buildPdfFromCanvases(p.pages);
  downloadBlob(blob, `nashi-dengi-${stamp()}.pdf`);
  toast('PDF сохранён');
}
