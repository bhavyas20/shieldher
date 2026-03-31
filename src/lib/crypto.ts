/**
 * ShieldHer Client-Side Encryption Library
 * 
 * Zero Admin Access: All encryption/decryption happens in the user's browser.
 * Uses Web Crypto API (AES-256-GCM) — built into all modern browsers.
 * The server never sees plaintext data.
 */

const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12;   // 96 bits for AES-GCM

// ═══ KEY DERIVATION ═══

/**
 * Generate a random salt for a new user.
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return uint8ArrayToBase64(salt);
}

/**
 * Derive a 256-bit AES-GCM key from a password + salt using PBKDF2.
 * The derived key never leaves the browser.
 */
export async function deriveKey(password: string, saltBase64: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = base64ToUint8Array(saltBase64);

  // Import the password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive the actual AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed for sessionStorage export
    ['encrypt', 'decrypt']
  );
}

// ═══ ENCRYPT / DECRYPT TEXT ═══

export interface EncryptedPayload {
  iv: string;       // base64-encoded IV
  ciphertext: string; // base64-encoded encrypted data
}

/**
 * Encrypt a string (e.g. JSON) using AES-256-GCM.
 */
export async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(plaintext)
  );

  return {
    iv: uint8ArrayToBase64(iv),
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt an EncryptedPayload back to a string.
 */
export async function decryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const iv = base64ToUint8Array(payload.iv);
  const ciphertext = base64ToUint8Array(payload.ciphertext);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );

  return new TextDecoder().decode(plaintext);
}

// ═══ ENCRYPT / DECRYPT FILES (IMAGES) ═══

export interface EncryptedFile {
  iv: string;             // base64-encoded IV
  encryptedBlob: Blob;    // encrypted binary data
}

/**
 * Encrypt a File (image) using AES-256-GCM.
 */
export async function encryptFile(key: CryptoKey, file: File): Promise<EncryptedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    arrayBuffer
  );

  return {
    iv: uint8ArrayToBase64(iv),
    encryptedBlob: new Blob([ciphertext], { type: 'application/octet-stream' }),
  };
}

/**
 * Decrypt an encrypted blob back to an image Blob.
 */
export async function decryptFile(
  key: CryptoKey,
  encryptedData: ArrayBuffer,
  ivBase64: string,
  mimeType: string = 'image/png'
): Promise<Blob> {
  const iv = base64ToUint8Array(ivBase64);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encryptedData
  );

  return new Blob([plaintext], { type: mimeType });
}

// ═══ KEY STORAGE (SESSION ONLY) ═══

const KEY_STORAGE_KEY = 'shieldher_encryption_key';
const SALT_STORAGE_KEY = 'shieldher_encryption_salt';

/**
 * Export the CryptoKey to a base64 string and store in sessionStorage.
 * The key is cleared when the browser tab is closed.
 */
export async function storeKey(key: CryptoKey, salt: string): Promise<void> {
  const exported = await crypto.subtle.exportKey('raw', key);
  const keyBase64 = uint8ArrayToBase64(new Uint8Array(exported));
  sessionStorage.setItem(KEY_STORAGE_KEY, keyBase64);
  sessionStorage.setItem(SALT_STORAGE_KEY, salt);
}

/**
 * Retrieve the CryptoKey from sessionStorage.
 * Returns null if no key is stored (user needs to re-authenticate).
 */
export async function retrieveKey(): Promise<CryptoKey | null> {
  const keyBase64 = sessionStorage.getItem(KEY_STORAGE_KEY);
  if (!keyBase64) return null;

  const keyData = base64ToUint8Array(keyBase64);
  return crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Clear the stored encryption key (on logout).
 */
export function clearKey(): void {
  sessionStorage.removeItem(KEY_STORAGE_KEY);
  sessionStorage.removeItem(SALT_STORAGE_KEY);
}

/**
 * Get the stored salt from sessionStorage.
 */
export function getStoredSalt(): string | null {
  return sessionStorage.getItem(SALT_STORAGE_KEY);
}

// ═══ UTILITY: Base64 ↔ Uint8Array ═══

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
