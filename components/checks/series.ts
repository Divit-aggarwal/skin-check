"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { User } from "firebase/auth";
import { echoRecord, pastCheck, type HistoryRow } from "@/components/dashboard/state";
import { loadDashboard, type DashboardData } from "@/components/dashboard/data";
import { toSkinState2 } from "@/lib/skin-state-2";
import type { SeriesCheck } from "@/lib/readings/series";
import type { SeriesWindow } from "@/lib/feature-contracts/readings-series";
import { PHOTO_ROUTE } from "@/lib/feature-contracts/check-photos";
import type { ShownMetric } from "@/lib/skin-check-skus";

// Lane mm/a (screens 09-12): the checks the dashboard loader already read, as
// lib/readings/series.ts takes them. Levels and change slots come from there
// only; nothing here compares two checks.

export type ChecksLoad = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: DashboardData };

/** The signed-in user's own checks and analyses, read once per user (the dashboard loader). */
export function useChecksData(user: User | null | undefined): ChecksLoad {
  const [load, setLoad] = useState<ChecksLoad>({ kind: "loading" });
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad({ kind: "loading" });
    loadDashboard(user.uid).then(
      (data) => active && setLoad({ kind: "ready", data }),
      (error) => {
        console.error("[checks] load failed", error instanceof Error ? error.name : error);
        if (active) setLoad({ kind: "error" });
      }
    );
    return () => {
      active = false;
    };
  }, [user]);
  return load;
}

/** Every check with a reading, newest first (history order), with its skinstate-2 read for the engine's gate. */
export function seriesChecks(uid: string, data: DashboardData, history: readonly HistoryRow[]): SeriesCheck[] {
  return history.flatMap((row) => {
    const view = pastCheck(uid, row.scanId, data.checks, data.analyses)?.view;
    if (!view) return [];
    // The record picked as Echo picks it; its document id names it for the engine.
    const record = view.source === "measured" ? echoRecord(uid, row.scanId, data.analyses) : null;
    const doc = record ? data.analyses.find((a) => a.data === record) : undefined;
    const state = doc ? toSkinState2(doc.data, `users/${uid}/scanAnalyses/${doc.id}`, uid) : null;
    // C10: side photos as the record says they were kept (as components/dashboard/state.ts reads them).
    const sides = data.checks.find((c) => c.id === row.scanId)?.data.sideImages as Record<string, { stored?: unknown } | undefined> | undefined;
    return [{ view, state, photos: { front: row.photoClaimed, left: sides?.left?.stored === true, right: sides?.right?.stored === true } }];
  });
}

/** Mockup order of the readings (fixed; never sorted by a level). */
export const READING_ORDER: readonly ShownMetric[] = ["blemishes", "redness", "pigment", "texture", "oiliness"];

export const WINDOWS: readonly SeriesWindow[] = ["4w", "8w", "12w", "all"];

/** A window from the address (?window=), else the default. */
export function parseWindow(v: string | null | undefined, fallback: SeriesWindow = "12w"): SeriesWindow {
  return (WINDOWS as readonly string[]).includes(v ?? "") ? (v as SeriesWindow) : fallback;
}

type Url = { scanId: string; url: string | null };

/**
 * Short-lived links to the user's own kept photos, from PHOTO_ROUTE (the
 * server checks the login, the owner and that the photo was kept). A check
 * whose photo is not found gets null. Links are never stored.
 */
export function usePhotoUrls(scanIds: readonly string[]): Map<string, string | null> | null {
  const { user } = useAuth();
  const key = scanIds.join("|");
  const [state, setState] = useState<{ uid: string; key: string; urls: Url[] } | null>(null);
  useEffect(() => {
    setState(null);
    if (!user || !key) return;
    let live = true;
    (async () => {
      const token = await user.getIdToken().catch(() => null);
      const urls = await Promise.all(
        key.split("|").map(async (scanId): Promise<Url> => {
          try {
            const res = await fetch(`${PHOTO_ROUTE}?scanId=${encodeURIComponent(scanId)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
            const body = res.ok ? ((await res.json()) as { url?: unknown }) : null;
            return { scanId, url: typeof body?.url === "string" ? body.url : null };
          } catch {
            return { scanId, url: null };
          }
        })
      );
      if (live) setState({ uid: user.uid, key, urls });
    })();
    return () => {
      live = false;
    };
  }, [user, key]);
  if (!key) return new Map();
  // Never links from another user or another set of checks (security review G03, L1).
  return user && state?.uid === user.uid && state.key === key ? new Map(state.urls.map((u) => [u.scanId, u.url])) : null;
}
