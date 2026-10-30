// Tiny IndexedDB store. All data is small enough to keep in memory; every
// write is persisted immediately.

export type StoreName = 'funds' | 'projects' | 'expenses' | 'incomes' | 'meta';
const STORES: StoreName[] = ['funds', 'projects', 'expenses', 'incomes', 'meta'];

let dbp: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('hsabati', 2);
    req.onupgradeneeded = () => {
      for (const s of STORES) {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = () => reject(t.error);
  });
}

export const getAll = <T>(store: StoreName) => tx<T[]>(store, 'readonly', s => s.getAll());
export const put = (store: StoreName, rec: object) => tx(store, 'readwrite', s => { s.put(rec); });
export const clearAll = () => Promise.all(STORES.map(s => tx(s, 'readwrite', st => { st.clear(); })));
export const putMany = (store: StoreName, recs: object[]) => tx(store, 'readwrite', s => { recs.forEach(r => s.put(r)); });

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Ask the browser not to evict our data (usually granted to installed apps). */
export async function persist(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}
