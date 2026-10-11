"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { CHECKS_COPY as K } from "./copy";

// A kept photo, from GET /api/checks/photo (TD-25 (2)): the server checks the
// login, that the photo is this user's, and that it was kept. Nothing kept,
// or any failure, shows nothing at all. The short-lived link is never stored.

type State = { kind: "loading" } | { kind: "none" } | { kind: "ready"; url: string };

// TD-47: `fallback` (Home's face drawing) shows instead of nothing when no photo comes back.
export function Thumb({ scanId, date, size = 48, fallback = null }: { scanId: string; date: string; size?: 48 | 112; fallback?: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    // Never keep a photo across a change of check or user (security review G03, L1).
    setState(user ? { kind: "loading" } : { kind: "none" });
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/checks/photo?scanId=${encodeURIComponent(scanId)}`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        const body = res.ok ? ((await res.json()) as { url?: unknown }) : null;
        if (active) setState(typeof body?.url === "string" ? { kind: "ready", url: body.url } : { kind: "none" });
      } catch {
        if (active) setState({ kind: "none" });
      }
    })();
    return () => {
      active = false;
    };
  }, [user, scanId]);

  const box = size === 48 ? "size-12 rounded-lg" : "size-28 rounded-2xl";
  if (state.kind === "none") return <>{fallback}</>;
  if (state.kind === "loading") return <span role="img" aria-label={K.photoLoading} className={`${box} shrink-0 animate-pulse bg-brand-linen2`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not a static asset
    <img
      src={state.url}
      alt={K.photoAlt(date)}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setState({ kind: "none" })}
      className={`${box} shrink-0 border border-brand-line object-cover`}
    />
  );
}
