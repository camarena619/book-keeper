/**
 * @module crypto
 * @description AES-256-GCM encryption/decryption using the Web Crypto API.
 *
 * Zero external dependencies. Key derivation uses PBKDF2 with 100,000 iterations
 * and SHA-256. The derived CryptoKey is cached at module level to avoid redundant
 * derivation on repeated calls.
 *
 * Wire format: base64( IV_12_BYTES || CIPHERTEXT )
 *
 * Graceful fallback: if VITE_ENCRYPTION_KEY is not set, encrypt/decrypt return
 * the input unchanged — this allows local development without configuring secrets.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed, application-scoped salt for PBKDF2 key derivation. */
const PBKDF2_SALT: Uint8Array = new TextEncoder().encode('book-keeper-v1-salt');

/** PBKDF2 iteration count — OWASP-recommended minimum for interactive logins. */
const PBKDF2_ITERATIONS = 100_000;

/** AES-GCM initialisation vector length in bytes. NIST SP 800-38D recommends 12. */
const IV_LENGTH_BYTES = 12;

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

/** Cached derived CryptoKey — populated lazily by `deriveKey()`. */
let cachedKey: CryptoKey | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive an AES-256-GCM CryptoKey from the application encryption secret using
 * PBKDF2.  The result is cached so subsequent calls return immediately.
 *
 * @returns A CryptoKey suitable for AES-256-GCM encrypt / decrypt operations.
 * @throws  If the Web Crypto API is unavailable or key derivation fails.
 */
async function deriveKey(): Promise<CryptoKey> {
  if (cachedKey) {
    return cachedKey;
  }

  const rawSecret = import.meta.env.VITE_ENCRYPTION_KEY as string;

  // Import the raw passphrase as PBKDF2 key material.
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(rawSecret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  // Derive an AES-256-GCM key.
  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: PBKDF2_SALT as any,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );

  return cachedKey;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * The encryption key is derived from `VITE_ENCRYPTION_KEY` via PBKDF2.
 * If the environment variable is not set the plaintext is returned unchanged,
 * enabling frictionless local development.
 *
 * @param plaintext - The UTF-8 string to encrypt.
 * @returns A base64-encoded string containing the 12-byte IV followed by the
 *          ciphertext (including the GCM authentication tag).
 *
 * @example
 * ```ts
 * const sealed = await encrypt('sensitive-data');
 * // => "dG9rZW4..." (base64)
 * ```
 */
export async function encrypt(plaintext: string): Promise<string> {
  // Graceful fallback — no key configured.
  if (!import.meta.env.VITE_ENCRYPTION_KEY) {
    return plaintext;
  }

  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  // Concatenate IV + ciphertext into a single buffer.
  const combined = new Uint8Array(iv.byteLength + ciphertextBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuffer), iv.byteLength);

  // Encode to base64 for safe transport / storage.
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext produced by {@link encrypt}.
 *
 * If the environment variable `VITE_ENCRYPTION_KEY` is not set, or if
 * decryption fails (e.g. tampered data, wrong key), the ciphertext string is
 * returned unchanged to avoid hard crashes in non-critical paths.
 *
 * @param ciphertext - The base64 string previously returned by `encrypt`.
 * @returns The original plaintext string.
 *
 * @example
 * ```ts
 * const original = await decrypt(sealed);
 * // => "sensitive-data"
 * ```
 */
export async function decrypt(ciphertext: string): Promise<string> {
  // Graceful fallback — no key configured.
  if (!import.meta.env.VITE_ENCRYPTION_KEY) {
    return ciphertext;
  }

  try {
    const key = await deriveKey();

    // Decode base64 → raw bytes.
    const raw = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

    // Split IV and ciphertext.
    const iv = raw.slice(0, IV_LENGTH_BYTES);
    const data = raw.slice(IV_LENGTH_BYTES);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data,
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    // Graceful fallback — return ciphertext unchanged when decryption fails.
    return ciphertext;
  }
}
