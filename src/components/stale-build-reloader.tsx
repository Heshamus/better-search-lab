"use client";

import { useEffect } from "react";
import { maybeReloadForStaleBuild } from "@/lib/stale-build-reload";

/**
 * Mounted once in the root layout. A stale-build Server Action submit throws an
 * uncaught error / unhandled rejection ("An unexpected response was received from
 * the server."); this listens for exactly that and reloads once to pull the
 * current build (see @/lib/stale-build-reload for the matcher + loop guard).
 * Renders nothing.
 */
export function StaleBuildReloader() {
  useEffect(() => {
    const ctx = () => ({ now: Date.now(), storage: window.sessionStorage, reload: () => window.location.reload() });
    const onError = (e: ErrorEvent) => maybeReloadForStaleBuild(e.error?.message ?? e.message, ctx());
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      maybeReloadForStaleBuild(typeof reason === "string" ? reason : reason?.message, ctx());
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
