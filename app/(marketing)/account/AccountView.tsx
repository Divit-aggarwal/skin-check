"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, ChevronLeft, ClipboardList, Download, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PhoneOtpForm } from "@/components/auth/PhoneOtpForm";
import { ConsentSection } from "@/components/dashboard/ConsentSection";
import { HomeSettingsSection } from "@/components/dashboard/HomeSettingsSection";
import { DashboardLink } from "@/components/dashboard/DashboardLink";
import { btnGhost, btnSecondary, card, eyebrow, h2, LoadingState, PageHeader, tintCard } from "@/components/ui/page";
import { IconWell, SettingsRow, TabBar, ToggleRow } from "@/components/ui/kit";
import { DeleteAccount } from "./DeleteAccount";
import { QuestionsCard } from "@/components/skin-check/QuestionsChoice";
import { loadDashboard } from "@/components/dashboard/data";
import { loadHomeSettings } from "@/components/dashboard/homeSettings";
import { newestPhoto, waitingQuestions, type Dashboard } from "@/components/dashboard/state";
import { formatDate } from "@/components/dashboard/format";
import type { HomeSettings } from "@/lib/home/permissions";
import { weatherOn } from "@/lib/home/switches";
import { consentsUi, dataExportUi, notificationTypesUi } from "@/lib/ui-flags";
import { ACCOUNT_COPY as A } from "./copy";

const N = A.notifications;
const P = A.privacy;

type AccountTab = "profile" | "skin" | "privacy" | "notifications";
const TABS: readonly AccountTab[] = ["profile", "skin", "privacy", "notifications"];

// G03 3.7. Signed out: sign in (then Home, TD-24 (3)). Signed in: redesign
// 21 (tabs Profile / Skin / Privacy; Goals has no data), 22 (Privacy: consent
// status and withdrawal H14, location and reminders TD-47, account deletion
// H01b) and 20 (Notifications, from Profile). One history list only, on Checks
// (TD-25 (6)). Flagged parts (G31, H36, H37) are shown disabled and save nothing.
export function AccountView() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const param = useSearchParams()?.get("tab");
  const asked = TABS.find((t) => t === param);
  // TD-24 (3): a sign-in made on this page goes to Home. A visitor who arrives
  // already signed in stays here. Kept here, not in the form, because the form
  // moves on screen when the user signs in.
  const wasSignedOut = useRef(false);
  // Old links to /account#delete-account open the Privacy tab, where Delete is.
  const [hashTab, setHashTab] = useState<AccountTab | undefined>(undefined);
  useEffect(() => {
    if (window.location.hash === "#delete-account") setHashTab("privacy");
  }, []);
  const tab = asked ?? hashTab ?? "profile";
  // TD-33 (1): the way in from Account while questions wait. A failed read shows nothing extra.
  const [questionsWaiting, setQuestionsWaiting] = useState<{ isEcho: boolean; date: string | null } | null>(null);
  // H27: the newest photo's kept or not kept line, moved here from Home with the privacy card (TD-47).
  const [photo, setPhoto] = useState<Dashboard["photo"]>(null);
  // Profile's city row; hidden until read (and if the read fails).
  const [settings, setSettings] = useState<HomeSettings | null | undefined>(undefined);
  useEffect(() => {
    if (!user) return setQuestionsWaiting(null);
    let active = true;
    loadDashboard(user.uid).then(
      (d) => {
        const w = active ? waitingQuestions(user.uid, d.checks, d.analyses, d.laterAnswers) : null;
        if (active) setQuestionsWaiting(w && { isEcho: w.isEcho, date: w.date ? formatDate(w.date) : null });
        if (active) setPhoto(newestPhoto(d.checks));
      },
      () => undefined
    );
    if (weatherOn()) loadHomeSettings(user.uid).then((s) => active && setSettings(s), () => undefined);
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    if (user === null) wasSignedOut.current = true;
    else if (user && wasSignedOut.current) router.replace("/dashboard");
  }, [user, router]);

  const onNotifications = !!user && tab === "notifications";

  return (
    <div className="mx-auto w-full max-w-2xl">
      {onNotifications ? (
        <>
          <Link href="/account" className={`${btnGhost} -ml-4 mt-4`}>
            <ChevronLeft aria-hidden size={20} />
            {N.back}
          </Link>
          <PageHeader title={N.title} intro={N.intro} />
        </>
      ) : (
        <PageHeader title={A.title} intro={user ? A.signedInIntro : A.signedOutIntro} />
      )}
      {loading ? (
        <LoadingState label={A.title} blocks={["h-40"]} />
      ) : (
        // One DeleteAccount in a fixed place: after an erase the user is signed
        // out, and its "deleted" message must stay on screen.
        <div className="flex flex-col gap-4">
          {!user ? (
            <section className={card}>
              <PhoneOtpForm />
            </section>
          ) : onNotifications ? (
            <Notifications />
          ) : (
            <>
              <TabBar
                label={A.tabsLabel}
                current={tab}
                tabs={(["profile", "skin", "privacy"] as const).map((t) => ({ key: t, label: A.tabs[t], href: t === "profile" ? "/account" : `/account?tab=${t}` }))}
              />
              {tab === "profile" && (
                <>
                  <section aria-labelledby="signed-in-title" className={`${tintCard} flex flex-col gap-4`}>
                    <div className="flex items-center gap-3">
                      <IconWell icon={UserRound} size={48} className="bg-brand-surface" />
                      <h2 id="signed-in-title" className={h2}>
                        {A.signedIn}
                      </h2>
                    </div>
                    <PhoneOtpForm />
                    {/* O-D3: the account page links to /dashboard. */}
                    <DashboardLink />
                  </section>
                  <section aria-labelledby="settings-title" className={card}>
                    <h2 id="settings-title" className={h2}>
                      {A.settingsTitle}
                    </h2>
                    <div className="mt-2 divide-y divide-brand-border">
                      {weatherOn() && settings !== undefined && <SettingsRow icon={MapPin} label={A.cityRow} value={settings?.city?.name ?? A.cityNotSet} href="/account?tab=privacy" />}
                      <SettingsRow icon={Bell} label={A.notificationsRow} href="/account?tab=notifications" />
                      <SettingsRow icon={ShieldCheck} label={A.privacyRow} href="/account?tab=privacy" />
                    </div>
                  </section>
                </>
              )}
              {tab === "skin" &&
                (questionsWaiting ? (
                  <QuestionsCard isEcho={questionsWaiting.isEcho} date={questionsWaiting.date} />
                ) : (
                  // No saved-answers view exists: answers belong to a check (lane log).
                  <section aria-labelledby="skin-title" className={`${card} flex flex-col items-start gap-3`}>
                    <div className="flex items-center gap-3">
                      <IconWell icon={ClipboardList} size={40} />
                      <h2 id="skin-title" className={h2}>
                        {A.skinTitle}
                      </h2>
                    </div>
                    <p className="text-brand-text-muted">{A.skinBody}</p>
                    <Link href="/skin-check" className={btnSecondary}>
                      {A.startCheck}
                    </Link>
                  </section>
                ))}
              {tab === "privacy" && (
                <>
                  {/* H14: consent status and the AI-share withdrawal. */}
                  <ConsentSection photo={photo} />
                  {consentsUi() && <MoreChoices />}
                  {/* TD-47: location, city and reminders. */}
                  <HomeSettingsSection />
                  {dataExportUi() && (
                    <section aria-label={P.exportRow} className={`${card} !py-2`}>
                      {/* H37: no export flow yet, so a plain row, not a link or button. */}
                      <SettingsRow icon={Download} label={P.exportRow} value={N.later} />
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {(!user || tab === "privacy") && (
            <div id="delete-account">
              <DeleteAccount />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Switches that wait on a backend: never on, never saved, "Comes later". */
const later = (label: string) => <ToggleRow key={label} label={label} description={N.later} checked={false} busy onChange={() => undefined} />;

/** Redesign 20: the live daily reminder (TD-47), then the G31 types behind their flag. */
function Notifications() {
  return (
    <>
      <HomeSettingsSection part="reminders" />
      {notificationTypesUi() && (
        <section aria-labelledby="types-title" className={card}>
          <h2 id="types-title" className={h2}>
            {N.typesTitle}
          </h2>
          <p className="mt-1 text-sm text-brand-text-muted">{N.typesNote}</p>
          {N.groups.map((g) => (
            <div key={g.title} className="mt-4">
              <p className={eyebrow}>{g.title}</p>
              <div className="divide-y divide-brand-border">{g.items.map(later)}</div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/** H36: the separate consents, DRAFT wording (H29 legal review). */
function MoreChoices() {
  return (
    <section aria-labelledby="choices-title" className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="choices-title" className={h2}>
          {P.choicesTitle}
        </h2>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand-text-muted">{P.choicesTag}</span>
      </div>
      <p className="mt-1 text-sm text-brand-text-muted">{N.typesNote}</p>
      <div className="mt-2 divide-y divide-brand-border">{P.choices.map(later)}</div>
    </section>
  );
}
