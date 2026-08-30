// IndexedDB — локальное offline-first хранилище (источник истины на устройстве)

const DB_NAME = 'family-money';
const DB_VER = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('expenses')) {
        const s = db.createObjectStore('expenses', { keyPath: 'id' });
        s.createIndex('spentAt', 'spentAt');
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && result._val !== undefined ? result._val : undefined);
    t.onerror = () => reject(t.error);
  }));
}

function getAll(store) {
  return open().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const db = {
  allExpenses: () => getAll('expenses'),
  putExpense: e => tx('expenses', 'readwrite', s => s.put(e)),
  putExpenses: list => tx('expenses', 'readwrite', s => list.forEach(e => s.put(e))),

  allCategories: () => getAll('categories'),
  putCategory: c => tx('categories', 'readwrite', s => s.put(c)),
  putCategories: list => tx('categories', 'readwrite', s => list.forEach(c => s.put(c))),

  getMeta: key => open().then(dbi => new Promise((resolve, reject) => {
    const req = dbi.transaction('meta').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  })),
  setMeta: (key, value) => tx('meta', 'readwrite', s => s.put({ key, value })),

  wipe: () => open().then(dbi => new Promise((resolve, reject) => {
    const t = dbi.transaction(['expenses', 'categories', 'meta'], 'readwrite');
    ['expenses', 'categories', 'meta'].forEach(n => t.objectStore(n).clear());
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  })),
};
