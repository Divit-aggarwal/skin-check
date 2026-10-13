"use client";

import { useState } from "react";
import { Bell, CalendarCheck, Download, MessageCircle, Shield, Sun, Trash2 } from "lucide-react";
import { btnGhost, btnPrimary, btnSecondary, card, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/page";
import {
  AppHeader,
  Arrow,
  btnOnDark,
  ChatBubble,
  ChatInput,
  Chip,
  ChoiceGrid,
  HeroCard,
  InsightRow,
  MetricTile,
  ProgressRing,
  SegmentedControl,
  SettingsRow,
  Skel,
  StepRow,
  Stepper,
  SuggestionChips,
  TabBar,
  TintCard,
  ToggleRow,
} from "@/components/ui/kit";
import { EchoMark } from "@/components/skin-check/EchoMark";

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 mt-10 border-t border-brand-border pt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-text-subtle">{children}</h2>;

export function Showcase() {
  const [slot, setSlot] = useState<"am" | "pm">("am");
  const [chips, setChips] = useState<string[]>(["oily"]);
  const [choice, setChoice] = useState<string[]>([]);
  const [on, setOn] = useState(true);
  const [text, setText] = useState("");
  return (
    <main className="mx-auto w-full max-w-[480px] px-4 pb-24">
      <AppHeader back="/dashboard" right={<span className="grid size-11 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">S</span>} />
      <PageHeader kicker="Sample eyebrow" title="Page title, sentence case" intro="Subtitle in muted text. Samples only; no real data." />

      <H>Buttons</H>
      <div className="flex flex-wrap gap-3">
        <button className={btnPrimary}>Primary <Arrow /></button>
        <button className={btnSecondary}>Secondary</button>
        <button className={btnGhost}>Ghost</button>
      </div>

      <H>Hero, tint and white cards</H>
      <div className="flex flex-col gap-3">
        <HeroCard eyebrow="Your next step" title="Morning routine" meta="4 steps" action={<button className={btnOnDark}>Start routine <Arrow /></button>} />
        <TintCard icon={Sun} title="Today's conditions" body="Shown only when the weather switch is on" href="#" />
        <TintCard tinted={false} icon={CalendarCheck} title="Next check" body="Date from the schedule" href="#" />
      </div>

      <H>Ring and tiles</H>
      <div className="grid grid-cols-2 gap-3">
        <div className={card}><ProgressRing done={2} total={4} label="Steps today" size={64} /></div>
        <div className={card}><p className="text-sm text-brand-text-muted">Next check</p><p className="mt-1 text-xl font-semibold">Date</p></div>
      </div>

      <H>Metric tiles (level words only)</H>
      <div className="grid grid-cols-2 gap-3">
        <MetricTile reading="redness" label="Redness" level="Moderate" context="Whole face" />
        <MetricTile reading="oiliness" label="Oiliness" level="Low" context="Whole face" />
        <MetricTile reading="blemishes" label="Breakouts" level="Elevated" tag="Early estimate" />
        <MetricTile reading="texture" label="Texture" level="Low" tag="Early estimate" />
        <MetricTile reading="pigment" label="Dark marks" level="Moderate" tag="Early estimate" />
        <Skel.Tile />
      </div>

      <H>Routine steps: Done, Skipped, Not logged</H>
      <div className="flex flex-col gap-3">
        <StepRow n={1} name="Sample cleanser" subtitle="Cleanse" chip="30 seconds" status="used" href="#" />
        <StepRow n={2} name="Sample serum" subtitle="Treat" status="skipped" href="#" />
        <StepRow n={3} name="Sample moisturiser" subtitle="Moisturise" status="unknown" href="#" />
        <Skel.Row />
      </div>

      <H>Segmented control, tabs, chips</H>
      <SegmentedControl label="Time of day" value={slot} onChange={setSlot} options={[{ value: "am", label: "Morning" }, { value: "pm", label: "Evening" }]} />
      <div className="mt-4"><TabBar label="Sections" current="overview" tabs={[{ key: "overview", label: "Overview", href: "#" }, { key: "list", label: "Checks", href: "#" }, { key: "timeline", label: "Timeline", href: "#" }]} /></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["oily", "dry", "combination"].map((c) => (
          <Chip key={c} selected={chips.includes(c)} onClick={() => setChips((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}>{c}</Chip>
        ))}
      </div>

      <H>Choice grid and stepper</H>
      <ChoiceGrid label="Sample question" value={choice} onChange={setChoice} options={[{ value: "a", label: "Option A", emoji: "🌤️" }, { value: "b", label: "Option B", emoji: "🌙" }, { value: "c", label: "Option C", emoji: "💧" }, { value: "d", label: "Option D", emoji: "🧴" }]} />
      <div className="mt-6"><Stepper steps={["Front", "Left", "Right"]} current={1} /></div>

      <H>Insight row, settings, toggles</H>
      <div className={card}>
        <InsightRow icon={MessageCircle} title="Row title" body="A plain description. No status pill." />
        <div className="border-t border-brand-border" />
        <ToggleRow label="Reminders" description="One push a day when something is due" checked={on} onChange={setOn} />
        <div className="border-t border-brand-border" />
        <SettingsRow icon={Bell} label="Notifications" value="On" href="#" />
        <SettingsRow icon={Shield} label="Privacy" href="#" />
        <SettingsRow icon={Download} label="Export my data" value="Coming later" />
        <SettingsRow icon={Trash2} label="Delete account" danger onClick={() => undefined} />
      </div>

      <H>Echo</H>
      <div className="flex flex-col gap-3 rounded-card bg-brand-50 p-3">
        <ChatBubble from="echo" avatar={<span className="shrink-0"><EchoMark className="size-7" /></span>}>Echo explains what your checks show. Sample text.</ChatBubble>
        <ChatBubble from="user">A sample question</ChatBubble>
        <SuggestionChips label="Suggested questions" items={["Sample question one", "Sample question two", "Sample question three"]} onPick={setText} />
        <ChatInput label="Ask Echo" sendLabel="Send" value={text} onChange={setText} onSend={() => setText("")} />
      </div>

      <H>States</H>
      <div className="flex flex-col gap-3">
        <LoadingState label="Loading" blocks={["h-24"]} />
        <EmptyState title="Not enough checks yet" body="After your next check this fills in." action={<button className={btnPrimary}>Start a check <Arrow /></button>} />
        <ErrorState body="This could not be loaded just now." action={<button className={btnSecondary}>Try again</button>} />
      </div>
    </main>
  );
}
