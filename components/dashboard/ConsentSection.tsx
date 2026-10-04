"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { Button } from "@/components/ui/button";
import { DASHBOARD_COPY } from "./copy";
import { loadLedger } from "./data";
import { aiShareStatus, withdrawalOutcome, type AiShareStatus } from "./state";

const C = DASHBOARD_COPY.privacy;

// H14: consent status and the AI-share withdrawal, on /dashboard and /account.
// A withdrawal is one more ledger entry (granted: false) through the existing
// consent route (H03c); the server reads the newest entry, so Echo asks again.
export function ConsentSection({ photoKept = null, deleteLink = false }: { photoKept?: boolean | null; deleteLink?: boolean }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<AiShareStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<false | "load" | "retry" | "stale">(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setStatus(aiShareStatus(await loadLedger(user.uid)));
    } catch (error) {
      console.error("[dashboard] consent status not loaded", error instanceof Error ? error.name : error);
      setFailed("load");
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!user) return null;

  async function withdraw() {
    if (!user) return;
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch("/api/account/consent", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ purpose: "ai_share", granted: false, version: AI_SHARE_CONSENT_VERSION }),
      });
      const outcome = withdrawalOutcome(res.status);
      if (outcome === "saved") await refresh();
      else setFailed(outcome);
    } catch (error) {
      console.error("[dashboard] withdrawal not saved", error instanceof Error ? error.message : error);
      setFailed("retry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="privacy-title" className="flex flex-col gap-3">
      <h2 id="privacy-title" className="font-display text-lg text-text">
        {C.title}
      </h2>
      {status === "on" && (
        <>
          <p className="text-body text-text/70">{C.aiOn}</p>
          <Button variant="outline" className="self-start" disabled={saving} onClick={() => void withdraw()}>
            {saving ? C.saving : C.stop}
          </Button>
        </>
      )}
      {status === null && !failed && <p className="text-body text-text/60">{C.loading}</p>}
      {status === "off" && <p className="text-body text-text/70">{C.aiOff}</p>}
      {status === "not_asked" && <p className="text-body text-text/70">{C.aiNotAsked}</p>}
      {failed && (
        <p role="alert" className="text-body text-text">
          {failed === "stale" ? C.stale : failed === "load" ? C.loadFailed : C.failed}
        </p>
      )}
      {photoKept !== null && <p className="text-body text-text/70">{photoKept ? C.photoKept : C.photoNotKept}</p>}
      {deleteLink && (
        <Link href="/account#delete-account" className="w-fit text-sm text-text underline underline-offset-4">
          {C.delete}
        </Link>
      )}
    </section>
  );
}
