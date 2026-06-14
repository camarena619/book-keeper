import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Server-side AES-256-GCM encryption for sensitive financial data
 * (bank routing / account numbers, Plaid access tokens).
 *
 * SECURITY: The key comes from ENCRYPTION_KEY — a server-only env var with NO
 * NEXT_PUBLIC_ prefix, so it is never bundled into client JavaScript. The
 * `import "server-only"` guard above makes the build fail if this module is
 * ever imported from a Client Component. This is the fix for the previous
 * design, where a VITE_-prefixed key shipped to every browser.
 *
 * Wire format: base64( IV(12) || AUTH_TAG(16) || CIPHERTEXT ).
 */

const IV_LENGTH = 12; // GCM standard nonce length
const TAG_LENGTH = 16; // GCM auth tag length

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`.",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 bytes (64 hex chars). Generate with `openssl rand -hex 32`.",
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
