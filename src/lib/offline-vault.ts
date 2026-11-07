/**
 * Encrypted, per-device offline vault.
 *
 * Sensitive application records are encrypted with AES-GCM before they enter
 * IndexedDB. The AES key is derived from the user's existing password with
 * PBKDF2 and is kept only in memory while the vault is unlocked.
 *
 * This module deliberately does not implement authentication or sync by
 * itself; auth.ts and the data layer must call it after a verified online
 * login and after an explicit offline unlock.
 */
const DB_NAME = "storbem-offline-vault";
const DB_VERSION = 1;
const META_STORE = "vault_meta";
const RECORD_STORE = "encrypted_records";
const PBKDF2_ITERATIONS = 310_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type VaultMeta = {
  id: string;
  userId: string;
  email: string;
  salt: ArrayBuffer;
  verifierIv: ArrayBuffer;
  verifierCipher: ArrayBuffer;
  version: 1;
  createdAt: string;
};

type EncryptedRecord = {
  id: string;
  userId: string;
  store: string;
  recordId: string;
  iv: ArrayBuffer;
  cipher: ArrayBuffer;
  updatedAt: string;
};

const unlockedKeys = new Map<string, CryptoKey>();

function requireBrowserCrypto() {
  if (typeof window === "undefined" || !window.indexedDB || !window.crypto?.subtle) {
    throw new Error("O armazenamento offline seguro não está disponível neste navegador.");
  }
}

function openDatabase(): Promise<IDBDatabase> {
  requireBrowserCrypto();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        const records = db.createObjectStore(RECORD_STORE, { keyPath: "id" });
        records.createIndex("by_user_store", ["userId", "store"], { unique: false });
        records.createIndex("by_user", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir o armazenamento offline."));
    request.onblocked = () => reject(new Error("Feche outras abas do sistema para preparar o armazenamento offline."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento offline."));
  });
}

async function readMeta(email: string): Promise<VaultMeta | undefined> {
  const db = await openDatabase();
  try {
    return await requestResult(db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(metaId(email)));
  } finally {
    db.close();
  }
}

function metaId(email: string) {
  return email.trim().toLowerCase();
}

async function deriveKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(key: CryptoKey, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: iv.buffer.slice(0), cipher };
}

async function decrypt<T>(key: CryptoKey, iv: ArrayBuffer, cipher: ArrayBuffer): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, cipher);
  return JSON.parse(decoder.decode(plain)) as T;
}

/** Create the device vault after a successful online login. Existing vaults are unlocked, never overwritten. */
export async function prepareOfflineVault(email: string, userId: string, password: string): Promise<void> {
  requireBrowserCrypto();
  if (!email.trim() || !userId || !password) throw new Error("Não foi possível preparar o acesso offline.");
  const id = metaId(email);
  const existing = await readMeta(id);
  if (existing) {
    if (existing.userId !== userId) throw new Error("Este e-mail já está vinculado a outro perfil neste dispositivo.");
    await unlockOfflineVault(email, password, userId);
    return;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt.buffer);
  const verification = await encrypt(key, { purpose: "storbem-offline-vault", userId, version: 1 });
  const meta: VaultMeta = {
    id,
    userId,
    email: id,
    salt: salt.buffer.slice(0),
    verifierIv: verification.iv,
    verifierCipher: verification.cipher,
    version: 1,
    createdAt: new Date().toISOString(),
  };

  const db = await openDatabase();
  try {
    await requestResult(db.transaction(META_STORE, "readwrite").objectStore(META_STORE).put(meta));
  } finally {
    db.close();
  }
  unlockedKeys.set(userId, key);
}

/** Unlock only a vault previously provisioned by a verified online login on this device. */
export async function unlockOfflineVault(email: string, password: string, expectedUserId?: string): Promise<string> {
  requireBrowserCrypto();
  const meta = await readMeta(email);
  if (!meta || (expectedUserId && meta.userId !== expectedUserId)) {
    throw new Error("Este dispositivo ainda não foi preparado para acesso offline por esta conta. Conecte-se à internet e entre primeiro.");
  }
  try {
    const key = await deriveKey(password, meta.salt);
    const proof = await decrypt<{ purpose: string; userId: string; version: number }>(
      key, meta.verifierIv, meta.verifierCipher,
    );
    if (proof.purpose !== "storbem-offline-vault" || proof.userId !== meta.userId || proof.version !== 1) {
      throw new Error("Credencial inválida.");
    }
    unlockedKeys.set(meta.userId, key);
    return meta.userId;
  } catch {
    throw new Error("Senha incorreta ou armazenamento offline danificado.");
  }
}

export function lockOfflineVault(userId?: string) {
  if (userId) unlockedKeys.delete(userId);
  else unlockedKeys.clear();
}

function getKey(userId: string) {
  const key = unlockedKeys.get(userId);
  if (!key) throw new Error("Armazenamento offline bloqueado. Entre novamente para desbloquear os dados.");
  return key;
}

/** Encrypt and save one record. No plaintext application data is written to IndexedDB. */
export async function saveOfflineRecord<T>(userId: string, store: string, recordId: string, value: T): Promise<void> {
  if (!store || !recordId) throw new Error("Identificador de registro offline inválido.");
  const key = getKey(userId);
  const encrypted = await encrypt(key, value);
  const record: EncryptedRecord = {
    id: `${userId}:${store}:${recordId}`,
    userId,
    store,
    recordId,
    iv: encrypted.iv,
    cipher: encrypted.cipher,
    updatedAt: new Date().toISOString(),
  };
  const db = await openDatabase();
  try {
    await requestResult(db.transaction(RECORD_STORE, "readwrite").objectStore(RECORD_STORE).put(record));
  } finally {
    db.close();
  }
}

/** Read and decrypt one record for the currently unlocked user. */
export async function readOfflineRecord<T>(userId: string, store: string, recordId: string): Promise<T | undefined> {
  const key = getKey(userId);
  const db = await openDatabase();
  let record: EncryptedRecord | undefined;
  try {
    record = await requestResult(db.transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE).get(`${userId}:${store}:${recordId}`));
  } finally {
    db.close();
  }
  return record ? decrypt<T>(key, record.iv, record.cipher) : undefined;
}

/** Read all records in a logical store for one unlocked user. */
export async function listOfflineRecords<T>(userId: string, store: string): Promise<Array<{ id: string; value: T }>> {
  const key = getKey(userId);
  const db = await openDatabase();
  let records: EncryptedRecord[];
  try {
    records = await requestResult(db.transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE)
      .index("by_user_store").getAll(IDBKeyRange.only([userId, store])));
  } finally {
    db.close();
  }
  const output: Array<{ id: string; value: T }> = [];
  for (const record of records) output.push({ id: record.recordId, value: await decrypt<T>(key, record.iv, record.cipher) });
  return output;
}

export async function deleteOfflineRecord(userId: string, store: string, recordId: string): Promise<void> {
  getKey(userId);
  const db = await openDatabase();
  try {
    await requestResult(db.transaction(RECORD_STORE, "readwrite").objectStore(RECORD_STORE).delete(`${userId}:${store}:${recordId}`));
  } finally {
    db.close();
  }
}

/** Remove the device's encrypted cache and vault metadata for a user. */
export async function eraseOfflineVault(userId: string): Promise<void> {
  lockOfflineVault(userId);
  const db = await openDatabase();
  try {
    const tx = db.transaction([META_STORE, RECORD_STORE], "readwrite");
    const metaStore = tx.objectStore(META_STORE);
    const recordStore = tx.objectStore(RECORD_STORE);
    const metaRequest = metaStore.openCursor();
    metaRequest.onsuccess = () => {
      const cursor = metaRequest.result;
      if (cursor) {
        if ((cursor.value as VaultMeta).userId === userId) cursor.delete();
        cursor.continue();
      }
    };
    const recordRequest = recordStore.index("by_user").openCursor(IDBKeyRange.only(userId));
    recordRequest.onsuccess = () => {
      const cursor = recordRequest.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Não foi possível apagar os dados offline."));
      tx.onabort = () => reject(tx.error ?? new Error("A limpeza do armazenamento offline foi cancelada."));
    });
  } finally {
    db.close();
  }
}
