/**
 * Tiny IndexedDB wrapper for large binary files (uploaded 3D models). localStorage is limited to a
 * few MB and only stores strings, so model files live here and products only keep their key.
 */
const DB_NAME = 'home-designer-files'
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('Could not open file storage'))
    })
  }
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('File storage request failed'))
      }),
  )
}

export const putBlob = (key: string, blob: Blob) => run('readwrite', (s) => s.put(blob, key)).then(() => undefined)
export const getBlob = (key: string) => run<Blob | undefined>('readonly', (s) => s.get(key))
export const deleteBlob = (key: string) => run('readwrite', (s) => s.delete(key)).then(() => undefined)

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}
