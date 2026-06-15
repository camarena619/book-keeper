"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (production only — avoids interfering with the
 * Turbopack dev HMR). Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration is best-effort */
    });
  }, []);

  return null;
}
