"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Camera, ChevronRight, ClipboardList, Download, FlaskConical, LineChart, Mail, MessageCircle, Repeat, Trash2, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { btnSecondary, card } from "@/components/ui/page";
import { IconWell, Skel, ToggleRow } from "@/components/ui/kit";
import { CONSENT_TEXTS, type NewConsentPurpose } from "@/lib/feature-contracts/consents";
import { consentsUi, dataExportUi } from "@/lib/ui-flags";
import { fetchExport, getConsents, optimistic, postConsent, retryIn, saveBlob } from "./accountApi";
import { ACCOUNT_COPY } from "./copy";

const D = ACCOUNT_COPY.data;
const PURPOSES = Object.keys(CONSENT_TEXTS) as NewConsentPurpose[];
const CONSENT_ICON: Record<NewConsentPurpose, LucideIcon> = { personalisation: BarChart3, product_improvement: LineChart, research: FlaskConical, marketing: Mail };
const ROW_ICON: Record<(typeof D.rows)[number]["key"], LucideIcon> = { photos: Camera, checks: BarChart3, routine: Repeat, answers: ClipboardList, echo: MessageCircle };

const sectionTitle = "text-[22px] font-semibold leading-tight tracking-[-0.01em] text-brand-text";

/** Icon, label, one-line note, optional action word, chevron. A link (kit request E3: SettingsRow with a note). */
function DataRow({ icon, label, note, href, action }: { icon: LucideIcon; label: string; note: string; href: string; action?: string }) {
  return (
    <Link href={href} className="flex min-h-[64px] items-center gap-3 py-2.5 transition-colors duration-fast hover:bg-brand-50">
      <IconWell icon={icon} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-brand-text">{label}</span>
        <span className="mt-0.5 block text-sm text-brand-text-muted">{note}</span>
      </span>
      {action && <span className="text-sm font-medium text-brand-700">{action}</span>}
      <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-text-muted" />
    </Link>
  );
}

/** Mockup 22: Your data, Data controls (H36, consentsUi), Download (H37, dataExportUi) and Delete. */
export function PrivacyControls() {
  return (
    <>
      {consentsUi() && (
        <section aria-labelledby="yours-title">
          <h2 id="yours-title" className={sectionTitle}>
            {D.yoursTitle}
          </h2>
          <p className="mt-1 text-brand-text-muted">{D.yoursNote}</p>
          <div className={`${card} mt-3 !py-1 divide-y divide-brand-border`}>
            {D.rows.map((r) => (
              <DataRow key={r.key} icon={ROW_ICON[r.key]} label={r.label} note={r.note} href={r.href} action={D.manage} />
            ))}
          </div>
        </section>
      )}
      {consentsUi() && <Consents />}
      <section aria-labelledby="download-title">
        <h2 id="download-title" className={sectionTitle}>
          {D.downloadTitle}
        </h2>
        <p className="mt-1 text-brand-text-muted">{D.downloadNote}</p>
        <div className={`${card} mt-3 !py-1 divide-y divide-brand-border`}>
          {dataExportUi() && <ExportRow />}
          <DataRow icon={Trash2} label={D.deleteRow} note={D.deleteNote} href="/account?tab=privacy#delete-account" />
        </div>
      </section>
    </>
  );
}

function Consents() {
  const { user } = useAuth();
  const [state, setState] = useState<Record<NewConsentPurpose, boolean> | null | "failed">(null);
  const [busy, setBusy] = useState<NewConsentPurpose | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const r = await getConsents(fetch, await user.getIdToken());
    if (!r.ok) return setState("failed");
    const got = Object.fromEntries(r.data.consents.map((c) => [c.purpose, c.granted]));
    setState(Object.fromEntries(PURPOSES.map((p) => [p, got[p] ?? CONSENT_TEXTS[p].defaultGranted])) as Record<NewConsentPurpose, boolean>);
  }, [user]);
  useEffect(() => void load(), [load]);

  const toggle = async (purpose: NewConsentPurpose, on: boolean) => {
    if (!user || busy) return;
    setBusy(purpose);
    setMessage(null);
    const token = await user.getIdToken();
    const set = (v: boolean) => setState((s) => (s && s !== "failed" ? { ...s, [purpose]: v } : s));
    const r = await optimistic(set, on, () => postConsent(fetch, token, purpose, on));
    if (!r.ok && r.code === "VERSION_STALE") {
      setMessage(D.stale);
      await load();
    } else if (!r.ok) setMessage(D.saveFailed);
    setBusy(null);
  };

  return (
    <section aria-labelledby="controls-title">
      <h2 id="controls-title" className={sectionTitle}>
        {D.controlsTitle}
      </h2>
      <p className="mt-1 text-brand-text-muted">{D.controlsNote}</p>
      {state === null ? (
        <div role="status" aria-label={D.loading} className="mt-3">
          <Skel.Hero />
        </div>
      ) : state === "failed" ? (
        <div className={`${card} mt-3 flex flex-col items-start gap-3`}>
          <p role="alert">{D.loadFailed}</p>
          <button type="button" className={btnSecondary} onClick={() => void load()}>
            {D.retry}
          </button>
        </div>
      ) : (
        <div className={`${card} mt-3 !py-1 divide-y divide-brand-border`}>
          {PURPOSES.map((p) => (
            // H29: every text is a draft until the legal review; the note says so.
            <ToggleRow
              key={p}
              icon={CONSENT_ICON[p]}
              label={CONSENT_TEXTS[p].title}
              description={`${CONSENT_TEXTS[p].copy} ${D.draft}.`}
              checked={state[p]}
              busy={busy === p}
              onChange={(v) => void toggle(p, v)}
            />
          ))}
        </div>
      )}
      {message && (
        <p role="alert" className="mt-2 text-sm text-brand-error">
          {message}
        </p>
      )}
    </section>
  );
}

function ExportRow() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "tooMany" | "notAllowed" | "failed">("idle");
  const [wait, setWait] = useState<ReturnType<typeof retryIn>>(null);
  const run = async () => {
    if (!user || status === "busy") return;
    setStatus("busy");
    const r = await fetchExport(fetch, await user.getIdToken());
    if (r.ok) saveBlob(r.data.blob, r.data.name);
    else setWait(retryIn(r.retryAfter));
    setStatus(r.ok ? "done" : r.status === 429 ? "tooMany" : r.status === 403 ? "notAllowed" : "failed");
  };
  const later = wait === null ? D.tryAgainLater : "hours" in wait ? D.tryAgainIn(wait.hours, "hour") : D.tryAgainIn(wait.minutes, "minute");
  const line = { idle: null, busy: D.exporting, done: D.exportDone, tooMany: `${D.exportTooMany} ${later}`, notAllowed: D.exportNotAllowed, failed: D.exportFailed }[status];
  return (
    <div>
      <button type="button" aria-disabled={status === "busy" || undefined} onClick={() => void run()} className="flex min-h-[64px] w-full items-center gap-3 py-2.5 text-left transition-colors duration-fast hover:bg-brand-50">
        <IconWell icon={Download} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-brand-text">{ACCOUNT_COPY.privacy.exportRow}</span>
          <span className="mt-0.5 block text-sm text-brand-text-muted">{D.exportNote}</span>
        </span>
        <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-text-muted" />
      </button>
      {line && (
        <p role={status === "failed" || status === "tooMany" || status === "notAllowed" ? "alert" : "status"} className="pb-2 text-sm">
          {line}
        </p>
      )}
    </div>
  );
}
