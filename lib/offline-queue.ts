/**
 * GateSathi Offline Queue for Security Guards
 * Uses IndexedDB to store visit entries (including compressed photo blobs)
 * when connectivity drops at the school gate, ensuring zero lost entries.
 */

const DB_NAME = 'gatesathi_gate_offline_v2';
const PENDING_STORE = 'pending_visits';
const FAILED_STORE = 'failed_visits';
const DB_VERSION = 1;

export interface OfflineVisitPayload {
  schoolId: string;
  clientId: string;
  phone: string;
  name: string;
  studentIds: string[];
  purpose: string;
  purposeNote?: string;
  reasonCode?: string;
  reasonText?: string;
  relation?: string;
  consentAt?: string;
  consentVersion?: string;
  photoKey?: string;
  entryAt?: string;
  pickupBlocked?: boolean;
}

export interface OfflineVisitRecord {
  clientId: string;
  schoolId: string;
  payload: OfflineVisitPayload;
  photoBlob?: Blob | null;
  createdAt: number;
}

export interface FailedVisitRecord extends OfflineVisitRecord {
  error: string;
  statusCode?: number;
  failedAt: number;
}

function getIndexedDB(): IDBFactory | undefined {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  return undefined;
}

export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDB();
    if (!idb) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: 'clientId' });
      }
      if (!db.objectStoreNames.contains(FAILED_STORE)) {
        db.createObjectStore(FAILED_STORE, { keyPath: 'clientId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineVisit(record: OfflineVisitRecord): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_STORE);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineVisits(): Promise<OfflineVisitRecord[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readonly');
      const store = tx.objectStore(PENDING_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getOfflineVisitsCount(): Promise<number> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readonly');
      const store = tx.objectStore(PENDING_STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

export async function removeOfflineVisit(clientId: string): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_STORE);
    const req = store.delete(clientId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function moveVisitToFailed(
  entry: OfflineVisitRecord,
  error: string,
  statusCode?: number
): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PENDING_STORE, FAILED_STORE], 'readwrite');
    const pendingStore = tx.objectStore(PENDING_STORE);
    const failedStore = tx.objectStore(FAILED_STORE);

    pendingStore.delete(entry.clientId);
    const failedRecord: FailedVisitRecord = {
      ...entry,
      error,
      statusCode,
      failedAt: Date.now(),
    };
    failedStore.put(failedRecord);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFailedVisits(): Promise<FailedVisitRecord[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FAILED_STORE, 'readonly');
      const store = tx.objectStore(FAILED_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getFailedVisitsCount(): Promise<number> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FAILED_STORE, 'readonly');
      const store = tx.objectStore(FAILED_STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

export async function retryFailedVisit(clientId: string): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([FAILED_STORE, PENDING_STORE], 'readwrite');
    const failedStore = tx.objectStore(FAILED_STORE);
    const pendingStore = tx.objectStore(PENDING_STORE);

    const getReq = failedStore.get(clientId);
    getReq.onsuccess = () => {
      const record = getReq.result as FailedVisitRecord | undefined;
      if (!record) {
        return resolve();
      }
      failedStore.delete(clientId);
      const pendingRecord: OfflineVisitRecord = {
        clientId: record.clientId,
        schoolId: record.schoolId,
        payload: record.payload,
        photoBlob: record.photoBlob,
        createdAt: record.createdAt,
      };
      pendingStore.put(pendingRecord);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dismissFailedVisit(clientId: string): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FAILED_STORE, 'readwrite');
    const store = tx.objectStore(FAILED_STORE);
    const req = store.delete(clientId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Uploads any queued photo blob to R2 and posts the visit to /api/gate/visits.
 * - If photo upload fails, does NOT send visit without photo; leaves in queue.
 * - On 401, leaves entry in queue for session re-login.
 * - On 4xx/5xx rejection, moves entry to failed_visits store (no silent loss).
 */
export async function syncOfflineVisits(
  onProgress?: (synced: number, remaining: number) => void
): Promise<{
  synced: number;
  remaining: number;
  sessionExpired?: boolean;
  failedCount?: number;
}> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    const count = await getOfflineVisitsCount();
    const failed = await getFailedVisitsCount();
    return { synced: 0, remaining: count, failedCount: failed };
  }

  const entries = await getOfflineVisits();
  if (entries.length === 0) {
    const failed = await getFailedVisitsCount();
    return { synced: 0, remaining: 0, failedCount: failed };
  }

  let synced = 0;
  let sessionExpired = false;

  for (const entry of entries) {
    try {
      let finalPhotoKey = entry.payload.photoKey;

      // 1. If photo blob was queued without a photoKey, upload to R2
      if (entry.photoBlob && !finalPhotoKey) {
        let photoUploaded = false;
        try {
          const signRes = await fetch('/api/uploads/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schoolId: entry.schoolId,
              purpose: 'visitor_photo',
              contentType: entry.photoBlob.type || 'image/jpeg',
              contentLength: entry.photoBlob.size,
            }),
          });

          if (signRes.ok) {
            const { uploadUrl, photoKey } = await signRes.json();
            const uploadRes = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': entry.photoBlob.type || 'image/jpeg',
              },
              body: entry.photoBlob,
            });

            if (uploadRes.ok) {
              finalPhotoKey = photoKey;
              entry.payload.photoKey = photoKey;
              await enqueueOfflineVisit(entry);
              photoUploaded = true;
            }
          }
        } catch (photoErr) {
          console.warn('[OfflineQueue] Photo upload failed during sync:', photoErr);
        }

        // NO SILENT LOSS: If photo upload failed, do NOT send without photo; leave in queue
        if (!photoUploaded) {
          continue;
        }
      }

      // 2. Submit visit to /api/gate/visits
      const visitRes = await fetch('/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...entry.payload,
          photoKey: finalPhotoKey,
        }),
      });

      if (visitRes.ok) {
        await removeOfflineVisit(entry.clientId);
        synced++;
      } else if (visitRes.status === 401) {
        // Treat 401 as "session expired, log in again" and keep the entry
        sessionExpired = true;
        break;
      } else {
        // Server rejected (400, 403, 422, 500, etc.)
        // Never delete: move to failed store along with error message
        let errorMsg = `Server error (${visitRes.status})`;
        try {
          const errData = await visitRes.json();
          errorMsg = errData.error || errData.message || errorMsg;
        } catch {
          // ignore parsing error
        }
        await moveVisitToFailed(entry, errorMsg, visitRes.status);
      }
    } catch (entryErr) {
      console.warn('[OfflineQueue] Transient error syncing entry; will retry next online event:', entryErr);
      break; // Network dropped mid-sync
    }
  }

  const remaining = await getOfflineVisitsCount();
  const failedCount = await getFailedVisitsCount();
  if (onProgress) {
    onProgress(synced, remaining);
  }

  return { synced, remaining, sessionExpired, failedCount };
}
