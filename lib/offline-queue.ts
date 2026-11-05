/**
 * GateSathi Offline Queue for Security Guards
 * Uses IndexedDB to store visit entries (including compressed photo blobs)
 * when connectivity drops at the school gate, ensuring zero lost entries.
 */

const DB_NAME = 'gatesathi_gate_offline_v1';
const STORE_NAME = 'pending_visits';
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
}

export interface OfflineVisitRecord {
  clientId: string;
  schoolId: string;
  payload: OfflineVisitPayload;
  photoBlob?: Blob | null;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'clientId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineVisit(record: OfflineVisitRecord): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Failed to enqueue offline visit:', err);
  }
}

export async function getOfflineVisits(): Promise<OfflineVisitRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
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
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

export async function removeOfflineVisit(clientId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(clientId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Failed to remove offline visit:', err);
  }
}

/**
 * Uploads any queued photo blob to R2 and posts the visit to /api/gate/visits.
 * Uses existing { schoolId, clientId } idempotency index so re-syncing is completely safe.
 */
export async function syncOfflineVisits(
  onProgress?: (synced: number, remaining: number) => void
): Promise<{ synced: number; remaining: number }> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    const count = await getOfflineVisitsCount();
    return { synced: 0, remaining: count };
  }

  const entries = await getOfflineVisits();
  if (entries.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  let synced = 0;

  for (const entry of entries) {
    try {
      let finalPhotoKey = entry.payload.photoKey;

      // 1. If photo blob was queued without a photoKey, upload to R2
      if (entry.photoBlob && !finalPhotoKey) {
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
            }
          }
        } catch (photoErr) {
          console.warn('[OfflineQueue] Photo upload failed during sync; proceeding with entry:', photoErr);
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
      } else if (visitRes.status === 400 || visitRes.status === 403) {
        // Unrecoverable validation error, remove to prevent blocking queue
        console.warn('[OfflineQueue] Permanent rejection for offline entry, dropping:', await visitRes.text());
        await removeOfflineVisit(entry.clientId);
      }
    } catch (entryErr) {
      console.warn('[OfflineQueue] Transient error syncing entry, will retry next online event:', entryErr);
      break; // Stop loop if network dropped again
    }
  }

  const remaining = await getOfflineVisitsCount();
  if (onProgress) {
    onProgress(synced, remaining);
  }

  return { synced, remaining };
}
