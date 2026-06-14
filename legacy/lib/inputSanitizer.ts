/**
 * @module inputSanitizer
 * @description Input validation and sanitization utilities for Book Keeper.
 *
 * All functions are pure (no side-effects, no network) and have zero external
 * dependencies.  HTML stripping is performed via the browser-native `DOMParser`
 * to avoid bundling a full sanitization library.
 *
 * **Design note on {@link sanitizeSQL}:** Supabase already uses parameterised
 * queries, so this function exists purely as a defence-in-depth layer.  It
 * should never be the sole protection against SQL injection.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an email validation check. */
export interface EmailValidationResult {
  valid: boolean;
  error?: string;
}

/** Result of a phone validation check. */
export interface PhoneValidationResult {
  valid: boolean;
  /** Normalised E.164-ish format: +1XXXXXXXXXX */
  normalized?: string;
  error?: string;
}

/** Result of a currency string validation check. */
export interface CurrencyValidationResult {
  valid: boolean;
  /** Amount expressed in integer cents (e.g. $12.34 → 1234). */
  cents?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum length for sanitised text. */
const DEFAULT_MAX_LENGTH = 500;

/**
 * RFC 5322 basic email regex.
 *
 * Intentionally permissive — it validates the vast majority of real-world
 * addresses without rejecting edge-case valid ones.  Server-side validation
 * and verification emails remain the authoritative check.
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Maximum email length per RFC 5321 §4.5.3.1.3. */
const MAX_EMAIL_LENGTH = 254;

/** Maximum currency value in cents (~$9,999,999.99 ≈ $10 M). */
const MAX_CURRENCY_CENTS = 999_999_999;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags, collapse whitespace, and truncate a user-supplied string.
 *
 * Uses the browser-native `DOMParser` to safely extract text content from
 * potentially malicious markup — no regex-based tag stripping.
 *
 * @param input     - The raw user input.
 * @param maxLength - Maximum allowed length after sanitisation.
 *                    Defaults to {@link DEFAULT_MAX_LENGTH} (500).
 * @returns A plain-text, trimmed, whitespace-normalised string.
 *
 * @example
 * ```ts
 * sanitizeText('<b>Hello</b>  world  ');
 * // => "Hello world"
 * ```
 */
export function sanitizeText(input: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  // Parse as HTML and extract text content — this neutralises all tags.
  const doc = new DOMParser().parseFromString(input, 'text/html');
  const text = doc.body.textContent ?? '';

  return text
    .trim()
    .replace(/\s+/g, ' ') // collapse multiple spaces / newlines
    .slice(0, maxLength);
}

/**
 * Validate an email address against RFC 5322 basic rules.
 *
 * @param email - The email address to validate.
 * @returns An object with `valid` and an optional `error` message.
 *
 * @example
 * ```ts
 * validateEmail('user@example.com');
 * // => { valid: true }
 *
 * validateEmail('not-an-email');
 * // => { valid: false, error: 'Email address format is invalid' }
 * ```
 */
export function validateEmail(email: string): EmailValidationResult {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email address is required' };
  }

  const trimmed = email.trim();

  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { valid: false, error: `Email address must not exceed ${MAX_EMAIL_LENGTH} characters` };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Email address format is invalid' };
  }

  // Ensure at least one dot in the domain portion (reject "user@localhost").
  const domainPart = trimmed.split('@')[1];
  if (!domainPart || !domainPart.includes('.')) {
    return { valid: false, error: 'Email address must include a valid domain' };
  }

  return { valid: true };
}

/**
 * Validate and normalise a US phone number.
 *
 * Accepts common formats such as `(555) 123-4567`, `555-123-4567`,
 * `+1 555 123 4567`, `5551234567`, etc.
 *
 * @param phone - The phone number string to validate.
 * @returns An object with `valid`, optional `normalized` (E.164-ish `+1XXXXXXXXXX`),
 *          and optional `error`.
 *
 * @example
 * ```ts
 * validatePhone('(555) 123-4567');
 * // => { valid: true, normalized: '+15551234567' }
 * ```
 */
export function validatePhone(phone: string): PhoneValidationResult {
  if (!phone || phone.trim().length === 0) {
    return { valid: false, error: 'Phone number is required' };
  }

  // Strip everything except digits.
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return { valid: true, normalized: `+1${digits}` };
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return { valid: true, normalized: `+${digits}` };
  }

  return {
    valid: false,
    error: 'Phone number must be 10 digits (or 11 starting with 1)',
  };
}

/**
 * Validate a currency string and convert it to integer cents.
 *
 * Accepted formats: `$1,234.56`, `1234.56`, `1234`, `$1234`.
 *
 * @param amountString - The raw currency string from user input.
 * @returns An object with `valid`, optional `cents` (integer), and optional `error`.
 *
 * @example
 * ```ts
 * validateCurrency('$1,234.56');
 * // => { valid: true, cents: 123456 }
 * ```
 */
export function validateCurrency(amountString: string): CurrencyValidationResult {
  if (!amountString || amountString.trim().length === 0) {
    return { valid: false, error: 'Amount is required' };
  }

  // Strip dollar sign and commas.
  const cleaned = amountString.trim().replace(/[$,]/g, '');

  // Validate numeric format (optional leading minus is intentionally excluded —
  // we only accept non-negative values).
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    return { valid: false, error: 'Amount must be a valid number (e.g. 1234.56)' };
  }

  const parsed = parseFloat(cleaned);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }

  // Convert to integer cents — round to avoid floating-point drift.
  const cents = Math.round(parsed * 100);

  if (cents < 0) {
    return { valid: false, error: 'Amount must not be negative' };
  }

  if (cents > MAX_CURRENCY_CENTS) {
    return { valid: false, error: 'Amount exceeds the maximum allowed value ($9,999,999.99)' };
  }

  return { valid: true, cents };
}

/**
 * Defence-in-depth SQL sanitisation.
 *
 * **Important:** This function is *not* a substitute for parameterised queries
 * (which Supabase uses by default).  It exists to strip obviously malicious
 * patterns from free-text inputs that may end up in RPC arguments or
 * full-text-search queries.
 *
 * Operations performed:
 * 1. Escape single quotes (`'` → `''`)
 * 2. Remove semicolons (`;`)
 * 3. Remove line-comment markers (`--`)
 * 4. Remove block-comment openers (`/*`)
 *
 * @param input - The raw string to sanitise.
 * @returns The sanitised string.
 *
 * @example
 * ```ts
 * sanitizeSQL("Robert'; DROP TABLE users;--");
 * // => "Robert'' DROP TABLE users"
 * ```
 */
export function sanitizeSQL(input: string): string {
  return input
    .replace(/'/g, "''")   // escape single quotes
    .replace(/;/g, '')      // strip semicolons
    .replace(/--/g, '')     // strip line-comment markers
    .replace(/\/\*/g, '');  // strip block-comment openers
}
