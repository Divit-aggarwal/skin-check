"use client";

import { useCallback, useEffect, useState } from "react";
import { getIdToken } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import type { RoutineEvent, RoutineItem } from "@/lib/routine/events";
import type { Adherence } from "@/lib/routine/adherence";

// The user's own routine record, read and written through /api/routine/events
// only (R-6 A). Shared by /routine, Home's "Today's routine" and the timeline.

export type ProductOption = { id: string; name: string; available: boolean };
export type RoutineData = { today: string; products: ProductOption[]; events: RoutineEvent[]; routine: RoutineItem[]; adherence: Adherence };

export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

export function useRoutine() {
  const { user } = useAuth();
  const [data, setData] = useState<RoutineData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (init?: RequestInit) => {
      if (!user) throw new Error("signed out");
      const token = await getIdToken(user);
      const url = init ? "/api/routine/events" : `/api/routine/events?tz=${encodeURIComponent(timeZone())}`;
      const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
      if (!res.ok) throw new Error(`routine ${res.status}`);
      return res.json();
    },
    [user]
  );

  const load = useCallback(async () => {
    try {
      setData(await call());
      setFailed(false);
    } catch (error) {
      console.error("[routine] load failed", error);
      setFailed(true);
    }
  }, [call]);

  useEffect(() => {
    if (user) void load();
    else setData(null);
  }, [user, load]);

  const send = useCallback(
    async (event: Record<string, unknown>) => {
      if (!data) return;
      setBusy(true);
      try {
        await call({
          method: "POST",
          body: JSON.stringify({ eventId: crypto.randomUUID(), effectiveDate: data.today, timeZone: timeZone(), ...event }),
        });
        await load();
      } catch (error) {
        console.error("[routine] save failed", error);
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [call, data, load]
  );

  return { data, failed, busy, send };
}
