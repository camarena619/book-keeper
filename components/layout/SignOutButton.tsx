"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/(dashboard)/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </form>
  );
}
