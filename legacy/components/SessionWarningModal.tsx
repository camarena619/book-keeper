import { useState, useEffect, useCallback } from 'react';

// ==========================================
// SESSION WARNING MODAL
// ==========================================
// Displays a countdown warning when the user has been
// inactive for 25 minutes. Auto-logout at 30 minutes.

interface SessionWarningModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Seconds remaining until forced logout */
  secondsRemaining: number;
  /** Called when user clicks "Stay Logged In" */
  onExtend: () => void;
  /** Called when user clicks "Log Out" or timer expires */
  onLogout: () => void;
}

export function SessionWarningModal({
  isOpen,
  secondsRemaining,
  onExtend,
  onLogout,
}: SessionWarningModalProps) {
  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const urgency = secondsRemaining <= 60 ? 'critical' : secondsRemaining <= 180 ? 'warning' : 'normal';

  return (
    <div className="session-modal-overlay" role="alertdialog" aria-modal="true" aria-label="Session expiring">
      <div className={`session-modal-card session-${urgency}`}>
        <div className="session-modal-icon">
          {urgency === 'critical' ? '🚨' : '⚠️'}
        </div>

        <h3 className="session-modal-title">Session Expiring Soon</h3>

        <p className="session-modal-message">
          Your session will expire due to inactivity.
          <br />
          Any unsaved changes may be lost.
        </p>

        <div className="session-timer-display">
          <span className={`session-timer-value ${urgency}`}>
            {timeDisplay}
          </span>
          <span className="session-timer-label">remaining</span>
        </div>

        <div className="session-modal-actions">
          <button
            className="btn-primary session-extend-btn"
            onClick={onExtend}
            autoFocus
          >
            🔄 Stay Logged In
          </button>
          <button
            className="btn-ghost session-logout-btn"
            onClick={onLogout}
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SESSION TIMER HOOK
// ==========================================
// Custom hook that manages the inactivity timer lifecycle.

interface UseSessionTimerOptions {
  /** Total timeout in milliseconds (default: 30 min) */
  timeoutMs?: number;
  /** Warning threshold in milliseconds (default: 25 min) */
  warningMs?: number;
  /** Called when auto-logout fires */
  onTimeout: () => void;
  /** Whether the timer is active (e.g., user is authenticated) */
  enabled: boolean;
}

interface UseSessionTimerReturn {
  /** Whether the warning modal should be shown */
  showWarning: boolean;
  /** Seconds remaining until forced logout */
  secondsRemaining: number;
  /** Reset the timer (user clicked "Stay Logged In") */
  extendSession: () => void;
}

export function useSessionTimer({
  timeoutMs = 30 * 60 * 1000,
  warningMs = 25 * 60 * 1000,
  onTimeout,
  enabled,
}: UseSessionTimerOptions): UseSessionTimerReturn {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Debounced activity tracker
  const handleActivity = useCallback(() => {
    if (!showWarning) {
      setLastActivity(Date.now());
    }
  }, [showWarning]);

  // Extend session — reset everything
  const extendSession = useCallback(() => {
    setLastActivity(Date.now());
    setShowWarning(false);
    setSecondsRemaining(0);
  }, []);

  // Attach/detach activity listeners
  useEffect(() => {
    if (!enabled) return;

    const events = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'mousedown'];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedHandler = () => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        handleActivity();
        debounceTimer = null;
      }, 1000); // 1-second debounce
    };

    events.forEach(event => document.addEventListener(event, debouncedHandler, { passive: true }));

    return () => {
      events.forEach(event => document.removeEventListener(event, debouncedHandler));
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [enabled, handleActivity]);

  // Main timer tick — check elapsed time every second
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity;

      if (elapsed >= timeoutMs) {
        // Session expired — force logout
        setShowWarning(false);
        clearInterval(interval);
        onTimeout();
      } else if (elapsed >= warningMs) {
        // Warning phase — show countdown
        const remaining = Math.ceil((timeoutMs - elapsed) / 1000);
        setSecondsRemaining(remaining);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, lastActivity, timeoutMs, warningMs, onTimeout]);

  return { showWarning, secondsRemaining, extendSession };
}

export default SessionWarningModal;
