"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, Lightbulb } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { CHECK_INTERVAL_RULE, nextCheck, type NextCheck } from "@/lib/home/schedule";
import { loadDashboard } from "@/components/dashboard/data";
import { deriveDashboard } from "@/components/dashboard/state";
import { lastReadingDate } from "@/components/dashboard/HomeCards";
import { formatDate } from "@/components/dashboard/format";
import { HOME_COPY as H } from "@/components/dashboard/homeCopy";
import { TintCard } from "@/components/ui/kit";
import { START_COPY as S } from "./flowCopy";

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
const DAY = 86_400_000;
// Calendar days, as Today counts them (HomeCards).
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

type Last = { kind: "hidden" } | { kind: "first"; body: string } | { kind: "last"; date: Date; next: NextCheck };

/**
 * Screen 05: the last check and when the next is due, from the same data and
 * rule as Today's next-check tile (lastReadingDate, nextCheck). Never blocks
 * the check: signed out, still loading or failed, the card is simply absent.
 */
export function LastCheckCard() {
  const { user } = useAuth();
  const [last, setLast] = useState<Last>({ kind: "hidden" });
  useEffect(() => {
    if (!user) return setLast({ kind: "hidden" });
    let active = true;
    loadDashboard(user.uid).then(
      (d) => {
        if (!active) return;
        const dashboard = deriveDashboard(user.uid, d.checks, d.analyses);
        const date = lastReadingDate(dashboard);
        // Checks with no photo reading do not start the count (as on Today).
        setLast(date ? { kind: "last", date, next: nextCheck(date, new Date(), tz()) } : { kind: "first", body: dashboard.history.length ? H.next.noReadingNote : H.next.first });
      },
      // Optional on this screen: the check itself works without it.
      () => active && setLast({ kind: "hidden" })
    );
    return () => {
      active = false;
    };
  }, [user]);

  if (last.kind === "hidden") return null;
  if (last.kind === "first") return <TintCard icon={CalendarCheck} title={S.firstTitle} body={last.body} />;
  const n = last.next;
  const due = n.kind === "in" ? H.next.in(n.days) : n.kind === "today" ? H.next.today : n.kind === "overdue" ? H.next.overdue(n.days) : H.next.first;
  const ago = H.latest.ago(Math.max(0, Math.round((startOfDay(new Date()) - startOfDay(last.date)) / DAY)));
  return (
    <TintCard
      icon={CalendarCheck}
      title={
        <>
          <span className="block text-sm font-normal text-brand-text-muted">{S.lastTitle}</span>
          {ago.charAt(0).toUpperCase() + ago.slice(1)}
        </>
      }
      body={`${formatDate(last.date)}. ${due}. ${H.next.every(CHECK_INTERVAL_RULE.days)}`}
    />
  );
}

/** The lighting tip (mockup 05), Today's own wording. */
export function PhotoTip() {
  return <TintCard icon={Lightbulb} title={<span className="sr-only">{S.tipLabel}</span>} body={H.next.tip} />;
}
