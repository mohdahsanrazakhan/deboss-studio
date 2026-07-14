"use client";

import { useEffect } from "react";

/**
 * Registers the hand-rolled service worker (public/sw.js) for offline
 * support. Production-only: in dev, its cache-first strategy would serve
 * stale JS chunks over Fast Refresh's freshly rebuilt ones.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is a progressive enhancement, not required */
    });
  }, []);

  return null;
}
