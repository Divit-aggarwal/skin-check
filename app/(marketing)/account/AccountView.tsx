"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, ChevronLeft, ChevronRight, ClipboardList, MapPin, Phone, ShieldCheck, UserRound, Users, Cake, Droplets, Sun, Leaf, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PhoneOtpForm } from "@/components/auth/PhoneOtpForm";
import { ConsentSection } from "@/components/dashboard/ConsentSection";
import { HomeSettingsSection } from "@/components/dashboard/HomeSettingsSection";
import { DashboardLink } from "@/components/dashboard/DashboardLink";
import { btnGhost, btnSecondary, card, h2, LoadingState, PageHeader, subtitle, tintCard, titleSub } from "@/components/ui/page";
import { AppHeader, IconWell, SettingsRow, Skel, TabBar } from "@/components/ui/kit";
import { DeleteAccount } from "./DeleteAccount";
import { QuestionsCard } from "@/components/skin-check/QuestionsChoice";
import { loadDashboard } from "@/components/dashboard/data";
import { loadHomeSettings } from "@/components/dashboard/homeSettings";
import { newestPhoto, waitingQuestions, type Dashboard } from "@/components/dashboard/state";
import { initials, profileFrom, type Profile, type ProfileField } from "./profile";
import { NotificationsScreen, type ProductInfo } from "./NotificationsScreen";
import { PrivacyControls } from "./PrivacyScreen";
import { formatDate } from "@/components/dashboard/format";
import type { HomeSettings } from "@/lib/home/permissions";
import { weatherOn } from "@/lib/home/switches";
import { consentsUi, dataExportUi, notificationTypesUi } from "@/lib/ui-flags";
import { ACCOUNT_COPY as A } from "./copy";

const N = A.notifications;
const R = A.profile;

type AccountTab = "profile" | "skin" | "privacy" | "notifications";
const TABS: readonly AccountTab[] = ["profile", "skin", "privacy", "notifications"];

// G03 3.7. Signed out: sign in (then Home, TD-24 (3)). Signed in: redesign
// 21 (tabs Profile / Skin / Privacy; Goals has no data), 22 (Privacy: consent
// status and withdrawal H14, location and reminders TD-47, account deletion
// H01b) and 20 (Notifications, from Profile). One history list only, on Checks
// (TD-25 (6)). Flagged parts (G31, H36, H37) are shown disabled and save nothing.
export function AccountView({ products = {} }: { products?: ProductInfo }) {
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
  // Mockup 21: the stored fields (G37). undefined while loading.
  const [profile, setProfile] = useState<Profile | "failed" | undefined>(undefined);
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
        if (active) setProfile(profileFrom(d.checks, d.laterAnswers));
      },
      () => active && setProfile("failed")
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
  // Mockups 20 and 22 (G37) are screens of their own, behind their flags.
  const notify20 = onNotifications && notificationTypesUi();
  const privacy22 = !!user && tab === "privacy" && (consentsUi() || dataExportUi());

  return (
    <div className="mx-auto w-full max-w-2xl">
      {notify20 || privacy22 ? (
        <>
          <AppHeader back="/account" backLabel={N.back} />
          <ScreenTitle title={notify20 ? A.notify.title : A.data.title} intro={notify20 ? A.notify.intro : A.data.intro} icon={notify20 ? Bell : ShieldCheck} />
        </>
      ) : onNotifications ? (
        <>
          <Link href="/account" className={`${btnGhost} -ml-4 mt-4`}>
            <ChevronLeft aria-hidden size={20} />
            {N.back}
          </Link>
          <PageHeader title={N.title} intro={N.intro} />
        </>
      ) : user ? (
        <>
          <div className="sm:hidden">
            <AppHeader back="/dashboard" backLabel={R.back} />
          </div>
          <ScreenTitle title={R.title} intro={R.intro} />
        </>
      ) : (
        <PageHeader title={A.title} intro={A.signedOutIntro} />
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
          ) : notify20 ? (
            <NotificationsScreen products={products} />
          ) : onNotifications ? (
            // The live daily reminder (TD-47); the per-type switches are mockup 20, behind G31's flag.
            <HomeSettingsSection part="reminders" />
          ) : privacy22 ? (
            <>
              {/* H14 (ai_share keeps its own route and states), then mockup 22, then location (TD-47). */}
              <PrivacyControls />
              <ConsentSection photo={photo} />
              <HomeSettingsSection />
            </>
          ) : (
            <>
              <TabBar
                label={A.tabsLabel}
                current={tab}
                tabs={(["profile", "skin", "privacy"] as const).map((t) => ({ key: t, label: A.tabs[t], href: t === "profile" ? "/account" : `/account?tab=${t}` }))}
              />
              {tab === "profile" && (
                <>
                  {/* TD-33 (1): waiting questions on Account's first screen too (owner answer 12). */}
                  {questionsWaiting && <QuestionsCard isEcho={questionsWaiting.isEcho} date={questionsWaiting.date} />}
                  <ProfileCard profile={profile} />
                  <section aria-labelledby="about-title" className={card}>
                    <h2 id="about-title" className={h2}>
                      {R.personalTitle}
                    </h2>
                    <p className="mt-1 text-sm text-brand-text-muted">{R.personalNote}</p>
                    <div className="mt-2 divide-y divide-brand-border">
                      {profile === undefined ? (
                        <div role="status" aria-label={R.loading} className="py-2"><Skel.Row /></div>
                      ) : (
                        profile !== "failed" && profile.about.map((f) => <InfoRow key={f.id} icon={FIELD_ICON[f.id]} label={R.fields[f.id]} value={f.text} />)
                      )}
                      {user.phoneNumber && <InfoRow icon={Phone} label={R.phone} value={R.phoneEnding(user.phoneNumber.slice(-4))} />}
                      {weatherOn() && settings !== undefined && <InfoRow icon={MapPin} label={A.cityRow} value={settings?.city?.name ?? A.cityNotSet} href="/account?tab=privacy" />}
                    </div>
                  </section>
                  <SkinAnswers profile={profile} />
                  <section aria-labelledby="settings-title" className={card}>
                    <h2 id="settings-title" className={h2}>
                      {R.appTitle}
                    </h2>
                    <div className="mt-2 divide-y divide-brand-border">
                      <SettingsRow icon={Bell} label={A.notificationsRow} href="/account?tab=notifications" />
                      <SettingsRow icon={ShieldCheck} label={A.privacyRow} href="/account?tab=privacy" />
                    </div>
                  </section>
                </>
              )}
              {tab === "skin" && (
                <>
                  {questionsWaiting && <QuestionsCard isEcho={questionsWaiting.isEcho} date={questionsWaiting.date} />}
                  <SkinAnswers profile={profile} />
                </>
              )}
              {tab === "privacy" && (
                <>
                  {/* H14: consent status and the AI-share withdrawal. */}
                  <ConsentSection photo={photo} />
                  {/* TD-47: location, city and reminders. */}
                  <HomeSettingsSection />
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

const FIELD_ICON: Record<ProfileField, LucideIcon> = { name: UserRound, age: Cake, gender: Users, skin_type: Droplets, primary_concerns: ClipboardList, skin_tone: Sun, skin_factors: Leaf };

/** Mockup 21 row: icon, label, value; a link only where an edit path exists. */
function InfoRow({ icon, label, value, href }: { icon: LucideIcon; label: string; value: string; href?: string }) {
  const inner = (
    <>
      <IconWell icon={icon} size={32} />
      <span className="w-[38%] max-w-[180px] shrink-0 text-[15px] font-medium text-brand-text">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sm text-brand-text-muted">{value}</span>
      {href && <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-text-muted" />}
    </>
  );
  const cls = "flex min-h-11 items-center gap-3 py-1.5";
  return href ? <Link href={href} className={`${cls} hover:bg-brand-50`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/** Mockup 21 header: initials from the stored name (or the person icon), the age band and gender, sign-in and sign-out. */
function ProfileCard({ profile }: { profile: Profile | "failed" | undefined }) {
  const about = profile && profile !== "failed" ? profile.about : [];
  const name = about.find((f) => f.id === "name")?.text ?? "";
  const meta = about.filter((f) => f.id !== "name").map((f) => f.text).join(" · ");
  const mark = initials(name);
  return (
    <section aria-labelledby="signed-in-title" className={`${tintCard} flex flex-col gap-4`}>
      <div className="flex items-center gap-4">
        {mark ? (
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-surface text-[22px] font-semibold text-brand-700">{mark}</span>
        ) : (
          <IconWell icon={UserRound} size={64} className="bg-brand-surface" />
        )}
        <div className="min-w-0">
          <h2 id="signed-in-title" className="break-words text-[22px] font-semibold leading-tight text-brand-text">
            {name || A.signedIn}
          </h2>
          {meta && <p className="mt-1 text-brand-text-muted">{meta}</p>}
        </div>
      </div>
      <PhoneOtpForm />
      {/* O-D3: the account page links to /dashboard. */}
      <DashboardLink />
    </section>
  );
}

/** The newest stored answers (labels only); a new check is the only way to give new ones. */
function SkinAnswers({ profile }: { profile: Profile | "failed" | undefined }) {
  const rows = profile && profile !== "failed" ? profile.skin : [];
  return (
    <section aria-labelledby="skin-title" className={`${card} flex flex-col items-start gap-2`}>
      <h2 id="skin-title" className={h2}>
        {A.skinTitle}
      </h2>
      {profile === undefined ? (
        <div role="status" aria-label={R.loading} className="w-full"><Skel.Row /></div>
      ) : profile === "failed" ? (
        <p role="alert">{R.loadFailed}</p>
      ) : rows.length ? (
        <>
          <p className="text-sm text-brand-text-muted">{R.skinNote}</p>
          <div className="w-full divide-y divide-brand-border">
            {rows.map((f) => <InfoRow key={f.id} icon={FIELD_ICON[f.id]} label={R.fields[f.id]} value={f.text} />)}
          </div>
        </>
      ) : (
        <p className="text-brand-text-muted">{R.skinEmpty}</p>
      )}
      <Link href="/skin-check" className={`${btnSecondary} mt-2`}>
        {A.startCheck}
      </Link>
    </section>
  );
}

/** Mockups 20 and 22: big title and intro with a decorative icon. */
function ScreenTitle({ title, intro, icon }: { title: string; intro: string; icon?: LucideIcon }) {
  return (
    <header className="flex items-start gap-3 pb-4 sm:pt-8">
      <div className="min-w-0 flex-1">
        <h1 className={titleSub}>{title}</h1>
        <p className={`mt-1 ${subtitle}`}>{intro}</p>
      </div>
      {icon && <IconWell icon={icon} size={72} />}
    </header>
  );
}
