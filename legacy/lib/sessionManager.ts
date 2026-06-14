/**
 * @module sessionManager
 * @description Inactivity-based session management with configurable warning
 * and timeout thresholds.
 *
 * The {@link SessionManager} class monitors user activity (mouse, keyboard,
 * scroll, touch, click) with 1-second debouncing and fires callbacks when the
 * user approaches or exceeds the inactivity limit.
 *
 * {@link requireReAuth} dispatches a Custom Event requesting re-authentication
 * and returns a Promise that resolves once the UI confirms or cancels the flow.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration accepted by the {@link SessionManager} constructor. */
export interface SessionManagerOptions {
  /** Called when the user crosses the warning threshold (default 25 min). */
  onWarning: () => void;
  /** Called when the user crosses the timeout threshold (default 30 min). */
  onTimeout: () => void;
  /** Called whenever user activity resets the inactivity timer. */
  onActivity: () => void;
  /** Total inactivity timeout in milliseconds. @default 1_800_000 (30 min) */
  timeoutMs?: number;
  /** Warning threshold in milliseconds. @default 1_500_000 (25 min) */
  warningMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Events that count as user activity. */
const ACTIVITY_EVENTS: ReadonlyArray<keyof DocumentEventMap> = [
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];

/** Debounce interval for activity detection (ms). */
const DEBOUNCE_MS = 1_000;

/** Default inactivity timeout: 30 minutes. */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1_000;

/** Default warning threshold: 25 minutes. */
const DEFAULT_WARNING_MS = 25 * 60 * 1_000;

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

/**
 * Monitors user activity on the page and fires callbacks when the session
 * approaches or reaches its inactivity timeout.
 *
 * @example
 * ```ts
 * const manager = new SessionManager({
 *   onWarning:  () => showWarningToast(),
 *   onTimeout:  () => supabase.auth.signOut(),
 *   onActivity: () => hideWarningToast(),
 * });
 * manager.start();
 * ```
 */
export class SessionManager {
  // -- Config ---------------------------------------------------------------
  private readonly onWarning: () => void;
  private readonly onTimeout: () => void;
  private readonly onActivity: () => void;
  private readonly timeoutMs: number;
  private readonly warningMs: number;

  // -- Internal state -------------------------------------------------------
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityTime: number = Date.now();
  private warningFired: boolean = false;
  private running: boolean = false;

  /** Debounce guard — timestamp of last processed activity event. */
  private lastProcessedActivity: number = 0;

  /** Bound handler reference so we can remove listeners cleanly. */
  private readonly handleActivity: () => void;

  constructor(options: SessionManagerOptions) {
    this.onWarning = options.onWarning;
    this.onTimeout = options.onTimeout;
    this.onActivity = options.onActivity;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.warningMs = options.warningMs ?? DEFAULT_WARNING_MS;

    // Bind once to preserve reference identity for add/removeEventListener.
    this.handleActivity = this.onUserActivity.bind(this);
  }

  // -- Public API -----------------------------------------------------------

  /**
   * Start monitoring user activity. Attaches listeners to `document` for
   * mousemove, keydown, scroll, touchstart, and click events.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, this.handleActivity, { passive: true });
    }

    this.resetTimers();
  }

  /**
   * Stop monitoring. Removes all event listeners and clears pending timers.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, this.handleActivity);
    }

    this.clearTimers();
  }

  /**
   * Manually reset the inactivity timer — typically called when the user
   * clicks "Stay Logged In" in the warning dialog.
   */
  reset(): void {
    this.resetTimers();
  }

  /**
   * Returns the number of milliseconds remaining until the session times out.
   */
  getTimeRemaining(): number {
    const elapsed = Date.now() - this.lastActivityTime;
    return Math.max(0, this.timeoutMs - elapsed);
  }

  /**
   * Returns `true` if the warning threshold has been crossed but the session
   * has not yet timed out.
   */
  isWarningActive(): boolean {
    return this.warningFired;
  }

  // -- Internals ------------------------------------------------------------

  /** Debounced activity handler attached to DOM events. */
  private onUserActivity(): void {
    const now = Date.now();

    // Debounce: ignore events that arrive within DEBOUNCE_MS of the last one.
    if (now - this.lastProcessedActivity < DEBOUNCE_MS) {
      return;
    }

    this.lastProcessedActivity = now;
    this.onActivity();
    this.resetTimers();
  }

  /** Clear existing warning and timeout timers. */
  private clearTimers(): void {
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /** Reset timers and record the latest activity timestamp. */
  private resetTimers(): void {
    this.clearTimers();
    this.lastActivityTime = Date.now();
    this.warningFired = false;

    // Schedule warning callback.
    this.warningTimer = setTimeout(() => {
      this.warningFired = true;
      this.onWarning();
    }, this.warningMs);

    // Schedule timeout callback.
    this.timeoutTimer = setTimeout(() => {
      this.onTimeout();
    }, this.timeoutMs);
  }
}

// ---------------------------------------------------------------------------
// Re-authentication helper
// ---------------------------------------------------------------------------

/** Custom event name dispatched to request re-authentication. */
const REAUTH_REQUIRED_EVENT = 'book-keeper:reauth-required';
/** Custom event name dispatched when re-authentication succeeds. */
const REAUTH_SUCCESS_EVENT = 'book-keeper:reauth-success';
/** Custom event name dispatched when re-authentication is cancelled. */
const REAUTH_CANCELLED_EVENT = 'book-keeper:reauth-cancelled';

/**
 * Request re-authentication from the user.
 *
 * Dispatches a `book-keeper:reauth-required` Custom Event and returns a
 * Promise that resolves to `true` when `book-keeper:reauth-success` fires, or
 * `false` when `book-keeper:reauth-cancelled` fires.
 *
 * The actual UI (e.g. a `<ReAuthModal />`) listens for the required event,
 * collects credentials, and dispatches the result event.
 *
 * @returns `true` if re-authentication succeeded, `false` if cancelled.
 *
 * @example
 * ```ts
 * if (await requireReAuth()) {
 *   // proceed with sensitive operation
 * }
 * ```
 */
export function requireReAuth(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    /** Clean up listeners after either outcome. */
    const cleanup = () => {
      window.removeEventListener(REAUTH_SUCCESS_EVENT, onSuccess);
      window.removeEventListener(REAUTH_CANCELLED_EVENT, onCancelled);
    };

    const onSuccess = () => {
      cleanup();
      resolve(true);
    };

    const onCancelled = () => {
      cleanup();
      resolve(false);
    };

    window.addEventListener(REAUTH_SUCCESS_EVENT, onSuccess, { once: true });
    window.addEventListener(REAUTH_CANCELLED_EVENT, onCancelled, { once: true });

    // Signal the UI to show the re-auth modal.
    window.dispatchEvent(new CustomEvent(REAUTH_REQUIRED_EVENT));
  });
}
