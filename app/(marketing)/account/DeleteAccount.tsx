"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { clearDraft } from "@/lib/skin-check-draft";
import { clearUnder18Chosen, ERASE_CONFIRMATION, ERASE_COPY, ERASE_MAX_AUTH_AGE_SECONDS } from "@/lib/consent";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { IconWell } from "@/components/ui/kit";
import { btnPrimary, btnSecondary, h2 } from "@/components/ui/page";
import { ACCOUNT_COPY as A } from "./copy";
import { forgetHomeDevice } from "@/components/dashboard/homeSettings";

// H01b: a signed-in user deletes their account and every copy of their data
// we hold (S3 photos, Firestore, the sign-in account). The server does the
// work (app/api/account/erase); this only confirms, calls it, and then clears
// this device's draft and signs out. Other devices keep their local drafts
// until their next save or clear (design §5.1, gap 7).

type State =
  | { kind: "idle" }
  | { kind: "confirming"; typed: string }
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function DeleteAccount() {
  const { user, signOut } = useAuth();
  const [state, setState] = useState<State>({ kind: "idle" });

  if (state.kind === "done") {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-card border border-brand-border bg-brand-surface p-4 sm:p-5">
        <p className="font-semibold">{ERASE_COPY.done}</p>
        <p className="text-brand-muted">{ERASE_COPY.doneLate}</p>
        <Link href="/skin-check" className={btnPrimary}>
          {A.startCheck}
        </Link>
      </div>
    );
  }
  if (!user) return null;

  async function erase() {
    if (!user) return;
    setState({ kind: "working" });
    try {
      const res = await fetch("/api/account/erase", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ confirm: ERASE_CONFIRMATION }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (res.ok) {
        await clearDraft();
        // The server erased the under-18 record with the account; this tab's
        // marker goes too, or the next sign-in here would re-attest it.
        clearUnder18Chosen();
        // TD-47: this device's weather reading and push subscription.
        await forgetHomeDevice().catch(() => undefined);
        await signOut().catch(() => undefined);
        setState({ kind: "done" });
        return;
      }
      // Sessions are revoked as the erase starts, so any retry needs a fresh sign-in.
      const message =
        body.code === "REAUTH_REQUIRED"
          ? `For your safety, please sign out, sign in again, and then delete your account within ${Math.round(ERASE_MAX_AUTH_AGE_SECONDS / 60)} minutes.`
          : "Your account could not be fully deleted. Please sign in again and try once more.";
      if (body.code !== "REAUTH_REQUIRED") await signOut().catch(() => undefined);
      setState({ kind: "error", message });
    } catch {
      setState({ kind: "error", message: "Something went wrong. Please try again." });
    }
  }

  return (
    <section aria-labelledby="delete-title" className="flex flex-col items-start gap-3 rounded-card border border-brand-error bg-brand-surface p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <IconWell icon={Trash2} className="bg-brand-error-soft text-brand-error" />
        <h2 id="delete-title" className={h2}>
          {A.deleteTitle}
        </h2>
      </div>
      <p>{ERASE_COPY.explain}</p>
      <p className="text-brand-muted">{ERASE_COPY.gemini}</p>
      <p className="text-brand-muted">{ERASE_COPY.otherBrowsers}</p>
      {state.kind === "idle" && (
        <button type="button" className={`${btnSecondary} border-brand-error text-brand-error hover:bg-brand-error-soft`} onClick={() => setState({ kind: "confirming", typed: "" })}>
          {A.deleteButton}
        </button>
      )}
      {state.kind === "confirming" && (
        <div className="flex w-full flex-col gap-2">
          <label htmlFor="erase-confirm" className="text-sm font-medium">
            Type <span className="font-semibold">{ERASE_CONFIRMATION}</span> to confirm.
          </label>
          <input
            id="erase-confirm"
            className="h-12 w-full rounded-tile border border-brand-border bg-brand-surface px-3 text-base text-brand-text"
            value={state.typed}
            autoComplete="off"
            onChange={(e) => setState({ kind: "confirming", typed: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-transparent bg-brand-error px-6 font-semibold text-white transition-colors duration-fast hover:opacity-90 disabled:border-brand-border disabled:bg-brand-50 disabled:text-brand-text-muted"
              disabled={state.typed !== ERASE_CONFIRMATION}
              onClick={() => void erase()}
            >
              {A.deletePermanently}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setState({ kind: "idle" })}>
              {A.cancel}
            </button>
          </div>
        </div>
      )}
      {state.kind === "working" && <p role="status">{A.deleting}</p>}
      {state.kind === "error" && (
        <p role="alert" className="text-brand-error">
          {state.message}
        </p>
      )}
    </section>
  );
}
