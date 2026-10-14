"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { ShieldCheck } from "lucide-react";
import { btnSecondary, card, h2 } from "@/components/ui/page";
import { IconWell } from "@/components/ui/kit";
import { DASHBOARD_COPY } from "./copy";
import { loadLedger } from "./data";
import { aiShareStatus, photoKeptFrom, withdrawalOutcome, type AiShareStatus, type Dashboard } from "./state";

const C = DASHBOARD_COPY.privacy;

// H14: consent status and the AI-share withdrawal, on /dashboard and /account.
// A withdrawal is one more ledger entry (granted: false) through the existing
// consent route (H03c); the server reads the newest entry, so Echo asks again.
export function ConsentSection({ photo = null, deleteLink = false }: { photo?: Dashboard["photo"]; deleteLink?: boolean }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<AiShareStatus | null>(null);
  // H27: from the ledger too; until it loads (or if it fails) nothing is said.
  const [photoKept, setPhotoKept] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<false | "load" | "retry" | "stale">(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const ledger = await loadLedger(user.uid);
      setStatus(aiShareStatus(ledger));
      setPhotoKept(photoKeptFrom(photo, ledger));
    } catch (error) {
      console.error("[dashboard] consent status not loaded", error instanceof Error ? error.name : error);
      setFailed("load");
    }
  }, [user, photo]);

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
    <section aria-labelledby="privacy-title" className={`${card} flex flex-col items-start gap-3`}>
      <div className="flex items-center gap-3">
        <IconWell icon={ShieldCheck} />
        <h2 id="privacy-title" className={h2}>
          {C.title}
        </h2>
      </div>
      {status === "on" && (
        <>
          <p>{C.aiOn}</p>
          <button type="button" className={btnSecondary} disabled={saving} onClick={() => void withdraw()}>
            {saving ? C.saving : C.stop}
          </button>
        </>
      )}
      {status === null && !failed && <p role="status" className="text-brand-muted">{C.loading}</p>}
      {status === "off" && <p>{C.aiOff}</p>}
      {status === "not_asked" && <p>{C.aiNotAsked}</p>}
      {failed && (
        <p role="alert">
          {failed === "stale" ? C.stale : failed === "load" ? C.loadFailed : C.failed}
        </p>
      )}
      {photoKept !== null && <p className="text-brand-muted">{photoKept ? C.photoKept : C.photoNotKept}</p>}
      {deleteLink && (
        <Link href="/account?tab=privacy#delete-account" className="inline-flex min-h-11 items-center font-medium text-brand-forest underline-offset-4 hover:underline">
          {C.delete}
        </Link>
      )}
    </section>
  );
}
