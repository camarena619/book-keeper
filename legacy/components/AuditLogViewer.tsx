import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ==========================================
// AUDIT LOG VIEWER COMPONENT
// ==========================================
// Searchable, filterable table of all audit events.
// Only visible to organization owners and admins.
// Supports CSV export for compliance.

interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_id: string | null;
  actor_role: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_fields: string[] | null;
  created_at: string;
}

interface AuditLogViewerProps {
  /** Current organization ID to filter logs */
  organizationId: string;
  /** Current user's role in the org */
  userRole: string;
}

export function AuditLogViewer({ organizationId, userRole }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Filters
  const [filterTable, setFilterTable] = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // Access control
  const canView = userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    if (canView) {
      fetchLogs();
    }
  }, [organizationId, page, filterTable, filterAction, filterDateFrom, filterDateTo]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      // Apply filters
      if (filterTable) query = query.eq('table_name', filterTable);
      if (filterAction) query = query.eq('action', filterAction);
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom);
      if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59Z');

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setLogs(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter logs client-side for search text
  const filteredLogs = logs.filter(log => {
    if (!filterSearch) return true;
    const searchLower = filterSearch.toLowerCase();
    return (
      log.table_name.toLowerCase().includes(searchLower) ||
      log.record_id.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower) ||
      (log.actor_role && log.actor_role.toLowerCase().includes(searchLower)) ||
      (log.changed_fields && log.changed_fields.some(f => f.toLowerCase().includes(searchLower)))
    );
  });

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Table', 'Record ID', 'Action', 'Actor Role', 'Changed Fields'];
    const rows = filteredLogs.map(log => [
      new Date(log.created_at).toISOString(),
      log.table_name,
      log.record_id,
      log.action,
      log.actor_role || 'system',
      log.changed_fields?.join('; ') || '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${organizationId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render a diff between old and new data
  const renderDiff = (log: AuditLogEntry) => {
    if (log.action === 'INSERT') {
      return (
        <div className="audit-diff">
          <div className="audit-diff-header audit-diff-add">+ New Record Created</div>
          <pre className="audit-diff-json">{JSON.stringify(log.new_data, null, 2)}</pre>
        </div>
      );
    }
    if (log.action === 'DELETE') {
      return (
        <div className="audit-diff">
          <div className="audit-diff-header audit-diff-remove">− Record Deleted</div>
          <pre className="audit-diff-json">{JSON.stringify(log.old_data, null, 2)}</pre>
        </div>
      );
    }
    // UPDATE: show field-level diff
    if (log.action === 'UPDATE' && log.old_data && log.new_data) {
      const changedKeys = log.changed_fields || Object.keys(log.new_data).filter(
        key => JSON.stringify(log.old_data?.[key]) !== JSON.stringify(log.new_data?.[key])
      );

      return (
        <div className="audit-diff">
          <div className="audit-diff-header">Changed Fields</div>
          <table className="audit-diff-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Old Value</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              {changedKeys.map(key => (
                <tr key={key}>
                  <td className="audit-diff-field">{key}</td>
                  <td className="audit-diff-old">
                    {JSON.stringify(log.old_data?.[key]) ?? '—'}
                  </td>
                  <td className="audit-diff-new">
                    {JSON.stringify(log.new_data?.[key]) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return null;
  };

  const getActionBadge = (action: string) => {
    const classes: Record<string, string> = {
      INSERT: 'audit-badge-insert',
      UPDATE: 'audit-badge-update',
      DELETE: 'audit-badge-delete',
    };
    return <span className={`audit-badge ${classes[action] || ''}`}>{action}</span>;
  };

  const getTableLabel = (table: string) => {
    const icons: Record<string, string> = {
      invoices: '📄',
      clients: '👤',
      expenses: '💰',
      quotes: '📋',
      bank_accounts: '🏦',
      bank_transactions: '💳',
      organizations: '🏢',
      organization_members: '👥',
      suppliers: '🏭',
      expense_rules: '⚙️',
      invoice_items: '📄',
      quote_items: '📋',
    };
    return `${icons[table] || '📝'} ${table}`;
  };

  if (!canView) {
    return (
      <div className="audit-restricted">
        <div className="audit-restricted-icon">🔒</div>
        <h4>Access Restricted</h4>
        <p>Only organization owners and administrators can view audit logs.</p>
      </div>
    );
  }

  return (
    <div className="audit-log-viewer">
      <div className="audit-header">
        <div>
          <h3>📋 Activity Log</h3>
          <p className="audit-subtitle">Complete audit trail of all changes to your organization's data</p>
        </div>
        <button className="btn-secondary" onClick={handleExportCSV} disabled={filteredLogs.length === 0}>
          📥 Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="audit-filters">
        <input
          type="text"
          placeholder="🔍 Search logs..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className="audit-search"
        />
        <select value={filterTable} onChange={e => { setFilterTable(e.target.value); setPage(0); }}>
          <option value="">All Tables</option>
          <option value="invoices">Invoices</option>
          <option value="clients">Clients</option>
          <option value="expenses">Expenses</option>
          <option value="quotes">Quotes</option>
          <option value="bank_accounts">Bank Accounts</option>
          <option value="bank_transactions">Bank Transactions</option>
          <option value="organizations">Organizations</option>
          <option value="organization_members">Members</option>
          <option value="suppliers">Suppliers</option>
        </select>
        <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(0); }}>
          <option value="">All Actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>
        <input
          type="date"
          value={filterDateFrom}
          onChange={e => { setFilterDateFrom(e.target.value); setPage(0); }}
          placeholder="From date"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={e => { setFilterDateTo(e.target.value); setPage(0); }}
          placeholder="To date"
        />
      </div>

      {error && <div className="audit-error">⚠️ {error}</div>}

      {/* Logs Table */}
      {loading ? (
        <div className="audit-loading">
          <div className="audit-spinner" />
          Loading audit logs...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="audit-empty">
          <span>📭</span>
          <p>No audit events found matching your filters.</p>
        </div>
      ) : (
        <div className="audit-table-container">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Table</th>
                <th>Action</th>
                <th>Role</th>
                <th>Changes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <>
                  <tr
                    key={log.id}
                    className={`audit-row ${expandedLog === log.id ? 'audit-row-expanded' : ''}`}
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <td className="audit-timestamp">
                      {new Date(log.created_at).toLocaleDateString()}<br />
                      <small>{new Date(log.created_at).toLocaleTimeString()}</small>
                    </td>
                    <td>{getTableLabel(log.table_name)}</td>
                    <td>{getActionBadge(log.action)}</td>
                    <td>
                      <span className="audit-role-badge">{log.actor_role || 'system'}</span>
                    </td>
                    <td className="audit-changes-summary">
                      {log.changed_fields
                        ? log.changed_fields.slice(0, 3).join(', ') + (log.changed_fields.length > 3 ? ` +${log.changed_fields.length - 3} more` : '')
                        : log.action === 'INSERT' ? 'New record' : log.action === 'DELETE' ? 'Record removed' : '—'
                      }
                    </td>
                    <td className="audit-expand-btn">
                      {expandedLog === log.id ? '▲' : '▼'}
                    </td>
                  </tr>
                  {expandedLog === log.id && (
                    <tr key={`${log.id}-detail`} className="audit-detail-row">
                      <td colSpan={6}>
                        <div className="audit-detail-content">
                          <div className="audit-detail-meta">
                            <span><strong>Record ID:</strong> {log.record_id}</span>
                            <span><strong>Actor ID:</strong> {log.actor_id || 'system'}</span>
                          </div>
                          {renderDiff(log)}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="audit-pagination">
        <button
          className="btn-ghost"
          disabled={page === 0}
          onClick={() => setPage(p => Math.max(0, p - 1))}
        >
          ← Previous
        </button>
        <span className="audit-page-indicator">Page {page + 1}</span>
        <button
          className="btn-ghost"
          disabled={filteredLogs.length < PAGE_SIZE}
          onClick={() => setPage(p => p + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default AuditLogViewer;
