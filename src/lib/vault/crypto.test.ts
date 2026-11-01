import { describe, expect, test } from 'vitest';
import {
  buildCipherBlob,
  buildKdfParams,
  createNewVaultKey,
  decryptUtf8,
  encryptUtf8,
  envelopeFromParts,
  deriveAesGcmKey,
  fromB64,
  randomBytes,
  unlockKeyFromEnvelope,
} from './crypto';
import { PBKDF2_ITERATIONS } from './constants';

describe('vault crypto', () => {
  test('round-trips UTF-8 JSON', async () => {
    const passphrase = 'correct horse battery staple';
    const payload = JSON.stringify({ hello: '世界', emoji: '🎉', n: 42 });

    const { aesKey, salt, iterations } = await createNewVaultKey(passphrase);
    const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
    const envelope = envelopeFromParts(buildKdfParams(salt, iterations), buildCipherBlob(iv, ciphertext));

    const unlockedKey = await unlockKeyFromEnvelope(passphrase, envelope);
    const ivDecoded = fromB64(envelope.cipher.ivB64);
    const ctDecoded = fromB64(envelope.cipher.ciphertextB64);
    const ciphertextBuf = ctDecoded.buffer.slice(
      ctDecoded.byteOffset,
      ctDecoded.byteOffset + ctDecoded.byteLength,
    ) as ArrayBuffer;

    const roundTrip = await decryptUtf8(unlockedKey, ivDecoded, ciphertextBuf);
    expect(roundTrip).toBe(payload);
  });

  test('fails decrypt with wrong passphrase', async () => {
    const passphrase = 'right-password';

    const { aesKey, salt, iterations } = await createNewVaultKey(passphrase);
    const { iv, ciphertext } = await encryptUtf8('{"x":1}', aesKey);
    const envelope = envelopeFromParts(buildKdfParams(salt, iterations), buildCipherBlob(iv, ciphertext));

    const wrongKey = await unlockKeyFromEnvelope('wrong-password', envelope);
    const ivDecoded = fromB64(envelope.cipher.ivB64);
    const ctDecoded = fromB64(envelope.cipher.ciphertextB64);
    const ciphertextBuf = ctDecoded.buffer.slice(
      ctDecoded.byteOffset,
      ctDecoded.byteOffset + ctDecoded.byteLength,
    ) as ArrayBuffer;

    await expect(decryptUtf8(wrongKey, ivDecoded, ciphertextBuf)).rejects.toThrow();
  });
});

describe('KDF strength', () => {
  test('writes a new vault at the current guidance', async () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    const { iterations } = await createNewVaultKey('pass');
    expect(iterations).toBe(PBKDF2_ITERATIONS);
  });

  test('unlocks an older vault at the iteration count it was written with', async () => {
    // Every envelope records its own KDF parameters, so raising the constant
    // must not orphan a vault created by an earlier version.
    const legacyIterations = 310_000;
    const salt = randomBytes(16);
    const key = await deriveAesGcmKey('pass', salt, legacyIterations);
    const { iv, ciphertext } = await encryptUtf8('secret', key);
    const envelope = envelopeFromParts(
      buildKdfParams(salt, legacyIterations),
      buildCipherBlob(iv, ciphertext),
    );

    const reopened = await unlockKeyFromEnvelope('pass', envelope);
    const ivDecoded = fromB64(envelope.cipher.ivB64);
    const ctDecoded = fromB64(envelope.cipher.ciphertextB64);
    const buf = ctDecoded.buffer.slice(
      ctDecoded.byteOffset,
      ctDecoded.byteOffset + ctDecoded.byteLength,
    ) as ArrayBuffer;
    await expect(decryptUtf8(reopened, ivDecoded, buf)).resolves.toBe('secret');
  });
});
