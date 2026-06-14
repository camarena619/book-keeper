import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getDeviceInfo } from '../lib/deviceFingerprint';

// ==========================================
// ACTIVE SESSIONS MANAGEMENT COMPONENT
// ==========================================
// Fetches, displays, and manages active login sessions
// from the `user_sessions` table. Provides options to
// revoke individual remote sessions or all other sessions.

export interface UserSession {
  id: string;
  user_id: string;
  ip_address: string;
  user_agent: string;
  device_fingerprint: string;
  city: string | null;
  country: string | null;
  is_current: boolean;
  last_active_at: string;
  created_at: string;
  revoked_at: string | null;
}

interface ActiveSessionsProps {
  currentFingerprint?: string;
}

export function ActiveSessions({ currentFingerprint }: ActiveSessionsProps) {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, [currentFingerprint]);

  const fetchSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user found');

      // Fetch active (non-revoked) sessions
      const { data, error: fetchError } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('last_active_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Map sessions and identify the current one based on fingerprint or storage
      const mappedSessions = (data || []).map((session: any) => {
        // If fingerprint matches and it's marked or matching, tag it
        const isCurrentSession = 
          session.device_fingerprint === currentFingerprint || 
          session.is_current === true ||
          (session.user_agent === navigator.userAgent && !currentFingerprint);

        return {
          ...session,
          is_current: isCurrentSession,
        };
      });

      setSessions(mappedSessions);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      setError(err.message || 'Failed to load active sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setActionLoading(sessionId);
    setError('');
    try {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('user_sessions')
        .update({ revoked_at: now })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      // Update local state
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err: any) {
      setError(err.message || 'Failed to revoke session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    setActionLoading('all-others');
    setError('');
    try {
      const currentSessionIds = sessions.filter(s => s.is_current).map(s => s.id);
      const now = new Date().toISOString();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user found');

      let query = supabase
        .from('user_sessions')
        .update({ revoked_at: now })
        .eq('user_id', user.id)
        .is('revoked_at', null);

      if (currentSessionIds.length > 0) {
        query = query.not('id', 'in', `(${currentSessionIds.join(',')})`);
      }

      const { error: updateError } = await query;
      if (updateError) throw updateError;

      // Keep only current sessions in state
      setSessions(prev => prev.filter(s => s.is_current));
    } catch (err: any) {
      setError(err.message || 'Failed to revoke other sessions');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Helper to get browser/OS details for user agent
  const parseUserAgent = (userAgent: string) => {
    const info = getDeviceInfo(userAgent);
    return info;
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'mobile':
        return '📱';
      case 'tablet':
        return '📟';
      default:
        return '💻';
    }
  };

  return (
    <div className="active-sessions-card">
      <div className="card-header">
        <h3 className="card-title">Active Login Sessions</h3>
        <p className="card-subtitle">
          Manage and revoke your active sessions on different devices.
        </p>
      </div>

      {error && <div className="error-banner mb-4">{error}</div>}

      {loading ? (
        <div className="loading-spinner-container">
          <div className="loading-spinner"></div>
          <p>Loading active sessions...</p>
        </div>
      ) : (
        <div className="sessions-list-container">
          {sessions.length > 0 && sessions.some(s => !s.is_current) && (
            <div className="actions-toolbar mb-4">
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleRevokeAllOtherSessions}
                disabled={actionLoading !== null}
              >
                {actionLoading === 'all-others' ? 'Revoking...' : 'Revoke All Other Sessions'}
              </button>
            </div>
          )}

          <div className="sessions-list">
            {sessions.map((session) => {
              const deviceDetails = parseUserAgent(session.user_agent);
              return (
                <div
                  key={session.id}
                  className={`session-item ${session.is_current ? 'current-session' : ''}`}
                >
                  <div className="session-icon">
                    {getDeviceIcon(deviceDetails.device)}
                  </div>
                  <div className="session-details">
                    <div className="session-device-name">
                      {deviceDetails.browser} on {deviceDetails.os}
                      {session.is_current && (
                        <span className="badge badge-success ml-2">Current Session</span>
                      )}
                    </div>
                    <div className="session-meta">
                      <span>IP: {session.ip_address || 'Unknown'}</span>
                      {session.city && (
                        <span>
                          Location: {session.city}
                          {session.country ? `, ${session.country}` : ''}
                        </span>
                      )}
                      <span>
                        Last active: {formatDate(session.last_active_at)}
                      </span>
                    </div>
                  </div>
                  <div className="session-actions">
                    {!session.is_current && (
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleRevokeSession(session.id)}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === session.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {sessions.length === 0 && (
              <p className="empty-message">No active sessions found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
