// Tiny IndexedDB store. All data is small enough to keep in memory; every
// write is persisted immediately. Records are never hard-deleted (deleted:
// true) so a future Drive sync can merge by id + updatedAt.

const DB_NAME = 'hsabati';
const STORES = ['projects', 'expenses', 'meta'];

let dbp;
function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) {
        if (!req.result.objectStoreNames.contains(s)) {
          req.result.createObjectStore(s, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  }));
}

export const getAll = store => tx(store, 'readonly', s => s.getAll());
export const put = (store, rec) => tx(store, 'readwrite', s => { s.put(rec); });
export const putMany = (store, recs) => tx(store, 'readwrite', s => { recs.forEach(r => s.put(r)); });
export const clear = store => tx(store, 'readwrite', s => { s.clear(); });

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Ask the browser not to evict our data (usually granted to installed apps). */
export async function persist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* not supported */ }
}
