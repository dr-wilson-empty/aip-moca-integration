import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * AES-256-GCM encryption for sensitive data (API keys, etc.).
 *
 * Uses API_KEY_ENCRYPTION_SECRET env variable as the base key.
 * Falls back to a deterministic key derived from ESCROW_PRIVATE_KEY if not set.
 *
 * Format: base64(iv:authTag:ciphertext)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let _key: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_key) return _key;

  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (secret) {
    _key = createHash("sha256").update(secret).digest();
  } else {
    const escrowKey = process.env.ESCROW_PRIVATE_KEY;
    if (!escrowKey) {
      throw new Error(
        "API_KEY_ENCRYPTION_SECRET or ESCROW_PRIVATE_KEY must be set for encryption",
      );
    }
    _key = createHash("sha256").update(`aip-encrypt:${escrowKey}`).digest();
  }

  return _key;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a base64-encoded string containing iv + authTag + ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded AES-256-GCM string.
 * Returns the original plaintext.
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Check if a string looks like it's already encrypted (base64 with correct length).
 */
export function isEncrypted(value: string): boolean {
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length > IV_LENGTH + AUTH_TAG_LENGTH && value !== buf.toString("utf8");
  } catch {
    return false;
  }
}
