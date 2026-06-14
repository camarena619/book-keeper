"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SettingsView } from "./SettingsView";
import { MfaEnrollment } from "./MfaEnrollment";
import { ActiveSessions } from "./ActiveSessions";
import { AuditLogViewer } from "./AuditLogViewer";
import type { OrgSettingsInput } from "@/lib/schemas/org";

export function SettingsTabs({
  initial,
  isOwner,
  role,
  userEmail,
}: {
  initial: OrgSettingsInput;
  isOwner: boolean;
  role: string;
  userEmail: string;
}) {
  const canAudit = role === "owner" || role === "admin";
  const tabs = [
    { id: "org", label: "Organization" },
    { id: "mfa", label: "Two-Factor" },
    { id: "sessions", label: "Sessions" },
    ...(canAudit ? [{ id: "audit", label: "Audit Log" }] : []),
  ];
  const [tab, setTab] = useState("org");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">Organization, security &amp; access</p>
      </header>

      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "org" && <SettingsView initial={initial} isOwner={isOwner} />}
      {tab === "mfa" && <MfaEnrollment userEmail={userEmail} />}
      {tab === "sessions" && <ActiveSessions />}
      {tab === "audit" && <AuditLogViewer canView={canAudit} />}
    </div>
  );
}
