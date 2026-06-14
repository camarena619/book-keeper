import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ==========================================
// RE-AUTHENTICATION MODAL
// ==========================================
// Requires password (and optionally TOTP) re-entry before
// sensitive operations like changing bank details, exporting
// data, or deleting records. Enforces step-up authentication.

interface ReAuthModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Description of the sensitive action being performed */
  actionDescription: string;
  /** Called with true on success, false on cancel */
  onResult: (authenticated: boolean) => void;
  /** Database connection status to bypass real auth in offline mode */
  isDbConnected?: boolean;
}

export function ReAuthModal({ isOpen, actionDescription, onResult, isDbConnected = false }: ReAuthModalProps) {
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMFA, setHasMFA] = useState(false);
  const [factorId, setFactorId] = useState<string>('');

  // Check if user has MFA enabled
  useEffect(() => {
    if (!isOpen || !isDbConnected) return;
    checkMFAStatus();
    // Reset fields when modal opens
    setPassword('');
    setTotpCode('');
    setError('');
  }, [isOpen, isDbConnected]);

  const checkMFAStatus = async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      if (data?.totp) {
        const verified = data.totp.find(f => f.status === 'verified');
        if (verified) {
          setHasMFA(true);
          setFactorId(verified.id);
        }
      }
    } catch {
      // If MFA check fails, continue without it
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Password is required');
      return;
    }
    if (isDbConnected && hasMFA && totpCode.length !== 6) {
      setError('Please enter your 6-digit authenticator code');
      return;
    }

    setLoading(true);
    setError('');

    if (!isDbConnected) {
      // Simulate successful verification delay for offline dev
      setTimeout(() => {
        setLoading(false);
        onResult(true);
      }, 800);
      return;
    }

    try {
      // Get current user email
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No active session');

      // Create a temporary client instance just for verification.
      // This prevents storage lock conflicts and preserves the main session.
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL || '',
        import.meta.env.VITE_SUPABASE_ANON_KEY || '',
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );

      // Re-authenticate with password using the temporary client
      const { error: signInError } = await tempClient.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (signInError) throw new Error('Incorrect password. Please try again.');

      // If MFA is enabled, also verify TOTP using the temporary client
      if (hasMFA && factorId) {
        const { data: challengeData, error: challengeError } = await tempClient.auth.mfa.challenge({
          factorId,
        });
        if (challengeError) throw challengeError;

        const { error: verifyError } = await tempClient.auth.mfa.verify({
          factorId,
          challengeId: challengeData.id,
          code: totpCode,
        });
        if (verifyError) throw new Error('Invalid authenticator code. Please try again.');
      }

      // Success
      onResult(true);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setPassword('');
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setTotpCode('');
    setError('');
    onResult(false);
  };

  // Handle keyboard escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="reauth-overlay" role="dialog" aria-modal="true" aria-label="Re-authentication required">
      <div className="reauth-card">
        <div className="reauth-header">
          <div className="reauth-icon">🔒</div>
          <h3>Confirm Your Identity</h3>
          <p className="reauth-description">
            This action requires verification:
          </p>
          <div className="reauth-action-badge">
            {actionDescription}
          </div>
        </div>

        {error && (
          <div className="reauth-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="reauth-form">
          <div className="reauth-field">
            <label htmlFor="reauth-password">Password</label>
            <input
              id="reauth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoFocus
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {hasMFA && (
            <div className="reauth-field">
              <label htmlFor="reauth-totp">Authenticator Code</label>
              <input
                id="reauth-totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                autoComplete="one-time-code"
                disabled={loading}
              />
            </div>
          )}

          <div className="reauth-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'Verifying...' : '🔓 Confirm'}
            </button>
          </div>
        </form>

        <div className="reauth-security-note">
          <small>🔐 Your credentials are verified directly with our authentication server and are never stored locally.</small>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// RE-AUTH HOOK
// ==========================================
// Provides a simple hook for components to request re-authentication.

interface UseReAuthReturn {
  /** Whether the re-auth modal should be shown */
  showReAuth: boolean;
  /** Description of the action requiring re-auth */
  actionDescription: string;
  /** Request re-authentication for a sensitive action. Returns true if verified. */
  requestReAuth: (description: string) => Promise<boolean>;
  /** Handle the modal result */
  handleReAuthResult: (authenticated: boolean) => void;
}

export function useReAuth(): UseReAuthReturn {
  const [showReAuth, setShowReAuth] = useState(false);
  const [actionDescription, setActionDescription] = useState('');
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const requestReAuth = useCallback((description: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setActionDescription(description);
      setShowReAuth(true);
      setResolvePromise(() => resolve);
    });
  }, []);

  const handleReAuthResult = useCallback((authenticated: boolean) => {
    setShowReAuth(false);
    if (resolvePromise) {
      resolvePromise(authenticated);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  return { showReAuth, actionDescription, requestReAuth, handleReAuthResult };
}

export default ReAuthModal;
