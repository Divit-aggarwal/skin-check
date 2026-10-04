"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { DASHBOARD_COPY } from "./copy";

/**
 * O-D3 (TD-18): the way to /dashboard from the results screen, the account
 * page and the signed-in start page. Shown only to a signed-in user: the
 * dashboard has nothing to show anyone else.
 */
export function DashboardLink({ className = "" }: { className?: string }) {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return (
    <Link href="/dashboard" className={`text-sm font-medium text-text underline underline-offset-4 ${className}`}>
      {DASHBOARD_COPY.entryLink}
    </Link>
  );
}
