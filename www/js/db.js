/* ============================================================
   db.js — 端末内データ保存（IndexedDB）
   すべてのデータはこの端末の中だけに保存されます。
   ============================================================ */
const DB = (() => {
  const NAME = 'cashbook';
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('transactions')) {
          const s = db.createObjectStore('transactions', { keyPath: 'id' });
          s.createIndex('month', 'month', { unique: false });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('cashcounts')) {
          db.createObjectStore('cashcounts', { keyPath: 'month' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }
  function done(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* ---- 取引（引き出し / 使用） ---- */
  async function putTransaction(t) {
    const store = await tx('transactions', 'readwrite');
    await done(store.put(t));
    return t;
  }
  async function getTransaction(id) {
    const store = await tx('transactions', 'readonly');
    return done(store.get(id));
  }
  async function deleteTransaction(id) {
    const store = await tx('transactions', 'readwrite');
    return done(store.delete(id));
  }
  async function getTransactionsByMonth(month) {
    const store = await tx('transactions', 'readonly');
    const idx = store.index('month');
    return done(idx.getAll(IDBKeyRange.only(month)));
  }
  async function getAllTransactions() {
    const store = await tx('transactions', 'readonly');
    return done(store.getAll());
  }

  /* ---- 実額照合 ---- */
  async function putCashCount(c) {
    const store = await tx('cashcounts', 'readwrite');
    await done(store.put(c));
    return c;
  }
  async function getCashCount(month) {
    const store = await tx('cashcounts', 'readonly');
    return done(store.get(month));
  }
  async function getAllCashCounts() {
    const store = await tx('cashcounts', 'readonly');
    return done(store.getAll());
  }
  async function deleteCashCount(month) {
    const store = await tx('cashcounts', 'readwrite');
    return done(store.delete(month));
  }

  /* ---- 設定（meta） ---- */
  async function getMeta(key, fallback) {
    const store = await tx('meta', 'readonly');
    const r = await done(store.get(key));
    return r ? r.value : fallback;
  }
  async function setMeta(key, value) {
    const store = await tx('meta', 'readwrite');
    return done(store.put({ key, value }));
  }

  /* ---- バックアップ（全消去 → 取り込み用） ---- */
  async function clearAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(['transactions', 'cashcounts', 'meta'], 'readwrite');
      t.objectStore('transactions').clear();
      t.objectStore('cashcounts').clear();
      t.objectStore('meta').clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  return {
    putTransaction, getTransaction, deleteTransaction,
    getTransactionsByMonth, getAllTransactions,
    putCashCount, getCashCount, getAllCashCounts, deleteCashCount,
    getMeta, setMeta, clearAll,
  };
})();
