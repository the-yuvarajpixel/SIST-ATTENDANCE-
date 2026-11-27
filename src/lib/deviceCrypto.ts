import type { DataSourceMode, ErpUserRole } from '../core/types';

/**
 * Device-only Web Crypto API (AES-GCM 256-bit) encryption for optional
 * "Keep me signed in" credential recall.
 *
 * Security model:
 * - A non-extractable AES-GCM CryptoKey is generated on this device and kept in IndexedDB.
 * - Only the random IV + authenticated ciphertext envelope is stored in localStorage.
 * - Neither plaintext passwords nor raw key bytes are ever written to localStorage.
 * - Calling clearRememberedCredentials() wipes both the ciphertext and the IndexedDB key.
 */

const STORAGE_KEY = 'sist_remembered_erp_v1';
const DB_NAME = 'sist_device_vault_v1';
const STORE_NAME = 'keys';
const KEY_ID = 'device_aes_gcm_key';

export interface RememberedCredentials {
  registerNumber: string;
  password: string;
  erpRole: ErpUserRole;
  mode: DataSourceMode;
  savedAt: string;
}

export interface EncryptedEnvelope {
  v: 1;
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function getSubtleCrypto(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

/**
 * Pure Web Crypto AES-GCM encryption helper (usable in browser and Node tests).
 */
export async function encryptJsonWithKey<T>(
  key: CryptoKey,
  payload: T
): Promise<EncryptedEnvelope> {
  const subtle = getSubtleCrypto();
  if (!subtle) {
    throw new Error('Web Crypto API is unavailable in this environment');
  }
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    v: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

/**
 * Pure Web Crypto AES-GCM decryption helper (throws on tampered ciphertext or wrong key).
 */
export async function decryptJsonWithKey<T>(
  key: CryptoKey,
  envelope: EncryptedEnvelope
): Promise<T> {
  const subtle = getSubtleCrypto();
  if (!subtle) {
    throw new Error('Web Crypto API is unavailable in this environment');
  }
  if (!envelope || envelope.v !== 1 || !envelope.iv || !envelope.ciphertext) {
    throw new Error('Invalid encrypted credential envelope');
  }
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  const text = new TextDecoder().decode(decrypted);
  return JSON.parse(text) as T;
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open device key vault'));
  });
}

async function readDeviceKey(): Promise<CryptoKey | null> {
  try {
    const db = await openKeyDb();
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY_ID);
      req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('Failed to read key'));
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function getOrCreateDeviceKey(): Promise<CryptoKey | null> {
  const subtle = getSubtleCrypto();
  if (!subtle) return null;

  const existing = await readDeviceKey();
  if (existing) return existing;

  try {
    const key = await subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // Non-extractable: raw key material cannot be read out by JS
      ['encrypt', 'decrypt']
    );
    const db = await openKeyDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(key, KEY_ID);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to persist key'));
      };
    });
    return key;
  } catch {
    return null;
  }
}

export async function saveRememberedCredentials(
  creds: Omit<RememberedCredentials, 'savedAt'>
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const key = await getOrCreateDeviceKey();
    if (!key) return false;
    const envelope = await encryptJsonWithKey<RememberedCredentials>(key, {
      ...creds,
      savedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export async function loadRememberedCredentials(): Promise<RememberedCredentials | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as EncryptedEnvelope;
    const key = await readDeviceKey();
    if (!key) return null;
    return await decryptJsonWithKey<RememberedCredentials>(key, envelope);
  } catch {
    return null;
  }
}

export async function clearRememberedCredentials(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage restrictions
    }
  }
  try {
    const db = await openKeyDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(KEY_ID);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore IndexedDB restrictions
  }
}
