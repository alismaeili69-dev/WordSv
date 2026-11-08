// Tiny IndexedDB key-value store, used to keep the last loaded Moments (with photos) on the device
// so the tab can open instantly. Any failure (private mode, quota) just means "no cache".

let dbp = null;
function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('wordsv-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => { dbp = null; throw e; });
  }
  return dbp;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction('kv', mode);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const idbGet = (key) => tx('readonly', (s) => s.get(key)).catch(() => undefined);
export const idbSet = (key, value) => tx('readwrite', (s) => s.put(value, key)).catch(() => {});
export const idbDel = (key) => tx('readwrite', (s) => s.delete(key)).catch(() => {});
