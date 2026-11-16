export const LEGACY_STORAGE_KEY = 'mast2-tower-report-generator-v1';
export const WORKSPACE_STORAGE_KEY = 'mast2-tower-projects-workspace-v1';
export const FIRST_LAUNCH_COMPLETED_KEY = 'mast2-launcher-completed-v1';

const DB_NAME = 'mast-tower-report-db';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB is unavailable in this environment.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error('Failed to open IndexedDB.'));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error('IndexedDB open request was blocked.'));
      };
    } catch (error) {
      dbPromise = null;
      reject(error);
    }
  });

  return dbPromise;
}

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  if (!isIndexedDbAvailable()) return undefined;
  const db = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB get failed for "${key}".`));
  });
}

export async function idbSet<T = unknown>(key: string, value: T): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`IndexedDB set failed for "${key}".`));
    tx.onabort = () => reject(tx.error ?? new Error(`IndexedDB transaction aborted for "${key}".`));
  });
}

export async function idbDelete(key: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`IndexedDB delete failed for "${key}".`));
    tx.onabort = () => reject(tx.error ?? new Error(`IndexedDB delete aborted for "${key}".`));
  });
}

/**
 * Serializes, optionally debounces, and coalesces rapid IndexedDB writes for a given key
 * so typing/sliders do not saturate structured-clone I/O while always finishing with the latest snapshot.
 */
export function createCoalescedIdbWriter<T>(
  key: string,
  options: { debounceMs?: number } = {}
): {
  enqueue: (value: T) => void;
  flush: () => Promise<void>;
} {
  const debounceMs = Math.max(0, options.debounceMs ?? 0);
  let pendingValue: T | undefined;
  let hasPending = false;
  let activePromise: Promise<void> | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const pump = async () => {
    while (hasPending) {
      const next = pendingValue as T;
      hasPending = false;
      pendingValue = undefined;
      try {
        await idbSet(key, next);
      } catch {
        // Ignore storage write errors (e.g. restricted private browsing)
      }
    }
  };

  const ensureRunning = () => {
    if (!activePromise) {
      activePromise = pump().finally(() => {
        activePromise = null;
        if (hasPending) {
          ensureRunning();
        }
      });
    }
  };

  return {
    enqueue: (value: T) => {
      if (!isIndexedDbAvailable()) return;
      pendingValue = value;
      hasPending = true;
      if (debounceMs > 0) {
        if (timerId !== null) {
          clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
          timerId = null;
          ensureRunning();
        }, debounceMs);
      } else {
        ensureRunning();
      }
    },
    flush: async () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (hasPending) {
        ensureRunning();
      }
      while (activePromise) {
        await activePromise;
      }
    },
  };
}

