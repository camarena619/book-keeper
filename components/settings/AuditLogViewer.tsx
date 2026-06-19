"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  actor_id: string | null;
  actor_role: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  created_at: string;
}

const PAGE_SIZE = 25;
const ACTION_BADGE: Record<string, string> = {
  INSERT: "bg-green-100 text-green-700",
  UPDATE: "bg-sky-100 text-sky-700",
  DELETE: "bg-red-100 text-red-700",
};

export function AuditLogViewer({ canView }: { canView: boolean }) {
  const supabase = createClient();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let q = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (filterTable) q = q.eq("table_name", filterTable);
      if (filterAction) q = q.eq("action", filterAction);
      const { data, error } = await q;
      if (error) throw error;
      setLogs((data as AuditEntry[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, page, filterTable, filterAction]);

  useEffect(() => {
    if (canView) fetchLogs();
  }, [canView, fetchLogs]);

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.table_name.toLowerCase().includes(s) ||
      l.record_id.toLowerCase().includes(s) ||
      l.action.toLowerCase().includes(s) ||
      (l.actor_role ?? "").toLowerCase().includes(s) ||
      (l.changed_fields ?? []).some((f) => f.toLowerCase().includes(s))
    );
  });

  function exportCsv() {
    const headers = ["Timestamp", "Table", "Record ID", "Action", "Role", "Changed Fields"];
    const rows = filtered.map((l) => [
      new Date(l.created_at).toISOString(),
      l.table_name,
      l.record_id,
      l.action,
      l.actor_role ?? "system",
      (l.changed_fields ?? []).join("; "),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!canView) {
    return (
      <div className="card max-w-xl text-center text-sm text-slate-500">
        🔒 Only organization owners and admins can view the audit log.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Activity Log</h2>
          <p className="text-sm text-slate-500">Audit trail of changes to your organization&rsquo;s data.</p>
        </div>
        <button className="btn-secondary text-xs" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-auto"
          value={filterTable}
          onChange={(e) => {
            setFilterTable(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All tables</option>
          {["invoices", "clients", "expenses", "quotes", "accounts", "journal_entries", "organizations", "organization_members"].map(
            (t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ),
          )}
        </select>
        <select
          className="input w-auto"
          value={filterAction}
          onChange={(e) => {
            setFilterAction(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>
      </div>

      {error && (
        <div className="mb-3 alert alert-danger">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No audit events found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-2 font-medium">When</th>
                <th className="pb-2 font-medium">Table</th>
                <th className="pb-2 font-medium">Action</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Changes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <Fragment key={l.id}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                  >
                    <td className="py-2 text-xs text-slate-500">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 font-mono text-xs">{l.table_name}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${ACTION_BADGE[l.action]}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="py-2 text-xs">{l.actor_role ?? "system"}</td>
                    <td className="py-2 text-xs text-slate-500">
                      {l.changed_fields
                        ? l.changed_fields.slice(0, 3).join(", ") +
                          (l.changed_fields.length > 3 ? ` +${l.changed_fields.length - 3}` : "")
                        : l.action === "INSERT"
                          ? "New record"
                          : l.action === "DELETE"
                            ? "Removed"
                            : "—"}
                    </td>
                  </tr>
                  {expanded === l.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={5} className="p-3">
                        <div className="mb-2 text-xs text-slate-500">
                          Record {l.record_id} · actor {l.actor_id ?? "system"}
                        </div>
                        <pre className="max-h-64 overflow-auto rounded bg-slate-200 border border-line p-3 text-xs">
                          {JSON.stringify(
                            l.action === "DELETE" ? l.old_data : l.new_data,
                            null,
                            2,
                          )}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          className="btn-secondary"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← Previous
        </button>
        <span className="text-slate-400">Page {page + 1}</span>
        <button
          className="btn-secondary"
          disabled={logs.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
