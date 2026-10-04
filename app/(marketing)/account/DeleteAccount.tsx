"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { clearDraft } from "@/lib/skin-check-draft";
import { clearUnder18Chosen, ERASE_CONFIRMATION, ERASE_COPY, ERASE_MAX_AUTH_AGE_SECONDS } from "@/lib/consent";
import { Button } from "@/components/ui/button";

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
      <div className="flex flex-col gap-1">
        <p className="text-body text-text/70">{ERASE_COPY.done}</p>
        <p className="text-body text-text/70">{ERASE_COPY.doneLate}</p>
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
    <section className="flex flex-col gap-3 border-t border-text/10 pt-6">
      <h2 className="font-display text-lg text-text">Delete your account</h2>
      <p className="text-body text-text/60">{ERASE_COPY.explain}</p>
      <p className="text-body text-text/60">{ERASE_COPY.gemini}</p>
      <p className="text-body text-text/60">{ERASE_COPY.otherBrowsers}</p>
      {state.kind === "idle" && (
        <Button variant="outline" onClick={() => setState({ kind: "confirming", typed: "" })}>
          Delete my account and data
        </Button>
      )}
      {state.kind === "confirming" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="erase-confirm" className="text-body text-text/70">
            Type <span className="font-medium text-text">{ERASE_CONFIRMATION}</span> to confirm.
          </label>
          <input
            id="erase-confirm"
            className="h-11 rounded-lg border border-text/20 bg-transparent px-3 text-text"
            value={state.typed}
            autoComplete="off"
            onChange={(e) => setState({ kind: "confirming", typed: e.target.value })}
          />
          <div className="flex gap-2">
            <Button variant="destructive" disabled={state.typed !== ERASE_CONFIRMATION} onClick={() => void erase()}>
              Delete permanently
            </Button>
            <Button variant="ghost" onClick={() => setState({ kind: "idle" })}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {state.kind === "working" && <p className="text-body text-text/70">Deleting…</p>}
      {state.kind === "error" && (
        <p role="alert" className="text-body text-text">
          {state.message}
        </p>
      )}
    </section>
  );
}
