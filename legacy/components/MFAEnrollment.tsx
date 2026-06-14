import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ==========================================
// MFA ENROLLMENT & VERIFICATION COMPONENT
// ==========================================
// Handles TOTP (Time-based One-Time Password) enrollment,
// QR code display, and verification challenge flow.
// Uses Supabase Auth MFA API.

interface MFAEnrollmentProps {
  /** Called when MFA setup is complete or dismissed */
  onComplete: () => void;
  /** Current user email for display */
  userEmail: string;
}

type MFAStep = 'overview' | 'enrolling' | 'verifying' | 'complete';

interface EnrolledFactor {
  id: string;
  friendly_name: string;
  factor_type: string;
  status: string;
  created_at: string;
}

export function MFAEnrollment({ onComplete, userEmail }: MFAEnrollmentProps) {
  const [step, setStep] = useState<MFAStep>('overview');
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [factors, setFactors] = useState<EnrolledFactor[]>([]);
  const [assuranceLevel, setAssuranceLevel] = useState<string>('aal1');

  // Load existing MFA status on mount
  useEffect(() => {
    loadMFAStatus();
  }, []);

  const loadMFAStatus = async () => {
    try {
      // Check current assurance level
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) {
        setAssuranceLevel(aalData.currentLevel || 'aal1');
      }

      // List enrolled factors
      const { data: factorData } = await supabase.auth.mfa.listFactors();
      if (factorData?.totp) {
        setFactors(factorData.totp.map(f => ({
          id: f.id,
          friendly_name: f.friendly_name || 'Authenticator',
          factor_type: f.factor_type,
          status: f.status,
          created_at: f.created_at,
        })));
      }
    } catch (err) {
      console.error('Failed to load MFA status:', err);
    }
  };

  // Step 1: Enroll a new TOTP factor
  const handleEnroll = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Book Keeper (${userEmail})`,
      });

      if (enrollError) throw enrollError;
      if (!data) throw new Error('No enrollment data received');

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep('enrolling');
    } catch (err: any) {
      setError(err.message || 'Failed to start MFA enrollment');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Challenge + Verify the TOTP code
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Create a challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      // Verify the code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      setStep('complete');
      await loadMFAStatus();
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
      setVerifyCode('');
    } finally {
      setLoading(false);
    }
  };

  // Unenroll a factor
  const handleUnenroll = async (fId: string) => {
    if (!confirm('Are you sure you want to remove this authenticator? You will need to re-enroll to use MFA.')) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: fId });
      if (error) throw error;
      await loadMFAStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to remove authenticator');
    } finally {
      setLoading(false);
    }
  };

  // Render based on current step
  return (
    <div className="mfa-enrollment">
      <div className="mfa-header">
        <div className="mfa-icon">🔐</div>
        <h3>Two-Factor Authentication (2FA)</h3>
        <p className="mfa-subtitle">
          Protect your financial data with an authenticator app like Google Authenticator, Authy, or 1Password.
        </p>
      </div>

      {/* Status Badge */}
      <div className={`mfa-status-badge ${assuranceLevel === 'aal2' ? 'mfa-active' : 'mfa-inactive'}`}>
        <span className="mfa-status-dot" />
        {assuranceLevel === 'aal2' ? 'MFA Active (AAL2)' : 'MFA Not Configured'}
      </div>

      {error && (
        <div className="mfa-error">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Overview: Show enrolled factors or enrollment button */}
      {step === 'overview' && (
        <div className="mfa-overview">
          {factors.length > 0 ? (
            <div className="mfa-factors-list">
              <h4>Enrolled Authenticators</h4>
              {factors.map(f => (
                <div key={f.id} className="mfa-factor-card">
                  <div className="mfa-factor-info">
                    <span className="mfa-factor-icon">📱</span>
                    <div>
                      <strong>{f.friendly_name}</strong>
                      <small>Added {new Date(f.created_at).toLocaleDateString()}</small>
                    </div>
                  </div>
                  <button
                    className="btn-danger-sm"
                    onClick={() => handleUnenroll(f.id)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mfa-empty-state">
              <p>No authenticators configured. Enable 2FA to add an extra layer of security to your account.</p>
            </div>
          )}

          <div className="mfa-actions">
            <button className="btn-primary" onClick={handleEnroll} disabled={loading}>
              {loading ? 'Setting up...' : factors.length > 0 ? '+ Add Another Authenticator' : '🛡️ Enable 2FA'}
            </button>
            <button className="btn-ghost" onClick={onComplete}>
              {factors.length > 0 ? 'Done' : 'Skip for Now'}
            </button>
          </div>
        </div>
      )}

      {/* Enrolling: Show QR code */}
      {step === 'enrolling' && (
        <div className="mfa-enroll-step">
          <div className="mfa-step-indicator">Step 1 of 2</div>
          <h4>Scan QR Code</h4>
          <p>Open your authenticator app and scan this QR code:</p>

          <div className="mfa-qr-container">
            <img src={qrCode} alt="MFA QR Code" className="mfa-qr-code" />
          </div>

          <div className="mfa-secret-fallback">
            <small>Can't scan? Enter this secret manually:</small>
            <code className="mfa-secret-code">{secret}</code>
          </div>

          <button className="btn-primary" onClick={() => setStep('verifying')}>
            I've Scanned the Code →
          </button>
          <button className="btn-ghost" onClick={() => { setStep('overview'); setError(''); }}>
            Cancel
          </button>
        </div>
      )}

      {/* Verifying: Enter TOTP code */}
      {step === 'verifying' && (
        <form className="mfa-verify-step" onSubmit={handleVerify}>
          <div className="mfa-step-indicator">Step 2 of 2</div>
          <h4>Verify Code</h4>
          <p>Enter the 6-digit code from your authenticator app:</p>

          <div className="mfa-code-input-container">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mfa-code-input"
              autoFocus
              autoComplete="one-time-code"
            />
          </div>

          <div className="mfa-actions">
            <button className="btn-primary" type="submit" disabled={loading || verifyCode.length !== 6}>
              {loading ? 'Verifying...' : '✓ Verify & Activate'}
            </button>
            <button className="btn-ghost" type="button" onClick={() => setStep('enrolling')}>
              ← Back
            </button>
          </div>
        </form>
      )}

      {/* Complete: Success state */}
      {step === 'complete' && (
        <div className="mfa-complete">
          <div className="mfa-success-icon">✅</div>
          <h4>Two-Factor Authentication Enabled!</h4>
          <p>
            Your account is now protected with MFA. You'll need your authenticator app
            each time you log in or perform sensitive operations.
          </p>
          <button className="btn-primary" onClick={() => { setStep('overview'); onComplete(); }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MFA CHALLENGE GATE
// ==========================================
// Shows a TOTP challenge screen after password login
// if the user has MFA factors enrolled.

interface MFAChallengeProps {
  /** Called when MFA challenge is verified successfully */
  onVerified: () => void;
}

export function MFAChallenge({ onVerified }: MFAChallengeProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string>('');

  useEffect(() => {
    loadFactor();
  }, []);

  const loadFactor = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    if (data?.totp && data.totp.length > 0) {
      // Use the first verified TOTP factor
      const verified = data.totp.find(f => f.status === 'verified');
      if (verified) setFactorId(verified.id);
    }
  };

  const handleChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;

    setLoading(true);
    setError('');
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) throw verifyError;

      onVerified();
    } catch (err: any) {
      setError(err.message || 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mfa-challenge-overlay">
      <div className="mfa-challenge-card">
        <div className="mfa-icon">🔐</div>
        <h3>Two-Factor Verification</h3>
        <p>Enter the 6-digit code from your authenticator app to continue.</p>

        {error && (
          <div className="mfa-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleChallenge}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="mfa-code-input"
            autoFocus
            autoComplete="one-time-code"
          />
          <button className="btn-primary" type="submit" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default MFAEnrollment;
