import { handleSupabaseError } from "@/lib/error-handler";

let legacyDraftsPurged = false;

/**
 * Deletes legacy shared fuel draft keys on first start so an old draft never leaks across drivers or vehicles (Fix A11).
 */
export async function purgeLegacySharedFuelDrafts(): Promise<void> {
  if (legacyDraftsPurged) return;
  legacyDraftsPurged = true;

  try {
    localStorage.removeItem("fuel_draft");
    localStorage.removeItem("fleet_fuel_draft");
    localStorage.removeItem("fuel-draft");
    localStorage.removeItem("fuel_log_draft");
  } catch {}

  return new Promise<void>((resolve) => {
    try {
      const request = indexedDB.open("fleet-pwa-drafts", 1);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("drafts")) {
          db.createObjectStore("drafts");
        }
      };
      request.onsuccess = (e) => {
        try {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains("drafts")) {
            resolve();
            return;
          }
          const tx = db.transaction("drafts", "readwrite");
          const store = tx.objectStore("drafts");
          const keysReq = store.getAllKeys();
          keysReq.onsuccess = () => {
            const keys = keysReq.result || [];
            for (const k of keys) {
              const keyStr = String(k);
              // Keep only drafts keyed by BOTH driverId and vehicleId: fuel_draft_<driverId>_<vehicleId>
              const parts = keyStr.split("_");
              if (!keyStr.startsWith("fuel_draft_") || parts.length < 4 || keyStr.includes("undefined") || keyStr.includes("anon")) {
                store.delete(k);
              }
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

if (typeof window !== "undefined") {
  purgeLegacySharedFuelDrafts();
}

export async function saveFuelDraft(key: string, data: any) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("fleet-pwa-drafts", 1);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts");
      }
    };
    
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const transaction = db.transaction("drafts", "readwrite");
      const store = transaction.objectStore("drafts");
      store.put(data, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}

export async function getFuelDraft(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fleet-pwa-drafts", 1);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts");
      }
    };
    
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      // In case the store wasn't created (e.g. database already existed but store didn't, which is rare)
      if (!db.objectStoreNames.contains("drafts")) {
        resolve(null);
        return;
      }
      const transaction = db.transaction("drafts", "readonly");
      const store = transaction.objectStore("drafts");
      const getReq = store.get(key);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}

export async function clearFuelDraft(key: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("fleet-pwa-drafts", 1);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts");
      }
    };
    
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("drafts")) {
        resolve();
        return;
      }
      const transaction = db.transaction("drafts", "readwrite");
      const store = transaction.objectStore("drafts");
      store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}
