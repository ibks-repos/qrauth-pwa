// Minimal promise wrapper around IndexedDB.
//
// Stores: accounts (key: account), log (auto-increment id), settings (explicit keys).
// CryptoKey objects are stored as they are: IndexedDB keeps them through structured cloning, and WebKit encrypts
// them with a master key from the Keychain before writing them to disk.

const NAME = "qrauth";
const VERSION = 1;

export type StoreName = "accounts" | "log" | "settings";

let opening: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("accounts", { keyPath: "account" });
      db.createObjectStore("log", { keyPath: "id", autoIncrement: true });
      db.createObjectStore("settings");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await openDb()).transaction(name, mode).objectStore(name);
}

export async function get<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return request((await store(name, "readonly")).get(key));
}

export async function getAll<T>(name: StoreName): Promise<T[]> {
  return request((await store(name, "readonly")).getAll());
}

export async function put(name: StoreName, value: unknown, key?: IDBValidKey): Promise<IDBValidKey> {
  return request((await store(name, "readwrite")).put(value, key));
}

export async function remove(name: StoreName, key: IDBValidKey | IDBKeyRange): Promise<void> {
  await request((await store(name, "readwrite")).delete(key));
}

export async function clear(name: StoreName): Promise<void> {
  await request((await store(name, "readwrite")).clear());
}

export async function count(name: StoreName): Promise<number> {
  return request((await store(name, "readonly")).count());
}

/** Keys of a store in ascending order. */
export async function keys(name: StoreName): Promise<IDBValidKey[]> {
  return request((await store(name, "readonly")).getAllKeys());
}
