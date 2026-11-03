import { FORMAT_VERSION, PBKDF2_ITERATIONS } from './constants';
import type { VaultCipherBlob, VaultKdfParams, VaultEnvelope } from './types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  bytes.forEach((x) => {
    binary += String.fromCharCode(x);
  });
  return btoa(binary);
}

export function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptUtf8(
  plaintext: string,
  aesKey: CryptoKey,
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    aesKey,
    textEncoder.encode(plaintext),
  );
  return { iv, ciphertext: ct };
}

export async function decryptUtf8(
  aesKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: BufferSource,
): Promise<string> {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    aesKey,
    ciphertext,
  );
  return textDecoder.decode(buf);
}

export async function exportAesKeyRaw(aesKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', aesKey);
  return toB64(raw);
}

export async function importAesKeyRaw(b64: string): Promise<CryptoKey> {
  const raw = fromB64(b64);
  const keyBytes = new Uint8Array(raw.length);
  keyBytes.set(raw);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export function buildKdfParams(salt: Uint8Array, iterations: number): VaultKdfParams {
  return {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    saltB64: toB64(salt),
  };
}

export function buildCipherBlob(
  iv: Uint8Array,
  ciphertext: ArrayBuffer,
): VaultCipherBlob {
  return {
    name: 'AES-GCM',
    ivB64: toB64(iv),
    ciphertextB64: toB64(ciphertext),
  };
}

export function envelopeFromParts(
  kdf: VaultKdfParams,
  cipher: VaultCipherBlob,
): VaultEnvelope {
  return {
    formatVersion: FORMAT_VERSION,
    kdf,
    cipher,
    updatedAt: new Date().toISOString(),
  };
}

export async function createNewVaultKey(passphrase: string): Promise<{
  aesKey: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}> {
  const salt = randomBytes(16);
  const iterations = PBKDF2_ITERATIONS;
  const aesKey = await deriveAesGcmKey(passphrase, salt, iterations);
  return { aesKey, salt, iterations };
}

export async function unlockKeyFromEnvelope(
  passphrase: string,
  envelope: VaultEnvelope,
): Promise<CryptoKey> {
  const salt = fromB64(envelope.kdf.saltB64);
  return deriveAesGcmKey(passphrase, salt, envelope.kdf.iterations);
}
