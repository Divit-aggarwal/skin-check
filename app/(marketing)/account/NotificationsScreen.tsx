"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Camera, Lightbulb, Moon, Sparkles, Sun, Tag, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { HomeSettingsSection } from "@/components/dashboard/HomeSettingsSection";
import { btnSecondary, card } from "@/components/ui/page";
import { ProductTile, Skel, ToggleRow } from "@/components/ui/kit";
import { WAITS_ON, type NotificationPrefs, type NotificationType } from "@/lib/feature-contracts/notifications";
import { getPrefs, optimistic, patchType, rowState, timeLabel, type Result } from "./accountApi";
import { ACCOUNT_COPY } from "./copy";

const N = ACCOUNT_COPY.notify;

/** Store title and first photo per catalogue id (read on the server, page.tsx). */
export type ProductInfo = Record<string, { title: string; image: string | null }>;

const ICON: Record<NotificationType, { icon: LucideIcon; well?: string }> = {
  routine_morning: { icon: Sun, well: "bg-amber-50 text-amber-600" },
  routine_evening: { icon: Moon, well: "bg-sky-50 text-sky-700" },
  weekly_checkin: { icon: Camera },
  product_usage: { icon: Sparkles },
  weekly_summary: { icon: BarChart3, well: "bg-sky-50 text-sky-700" },
  recommendations: { icon: Lightbulb, well: "bg-amber-50 text-amber-600" },
  echo_tips: { icon: Sparkles },
  marketing: { icon: Tag, well: "bg-rose-50 text-rose-600" },
};

const SECTIONS: { key: keyof typeof N.sections; types: NotificationType[] }[] = [
  { key: "routine", types: ["routine_morning", "routine_evening"] },
  { key: "checkin", types: ["weekly_checkin"] },
  { key: "products", types: [] },
  { key: "updates", types: ["weekly_summary", "recommendations", "echo_tips"] },
  { key: "marketing", types: ["marketing"] },
];

const failLine = (r: Result<unknown>) =>
  !r.ok && r.code === "NOT_SENDABLE" ? N.notSendable : !r.ok && r.code === "NEEDS_CONSENT" ? N.needsConsent : !r.ok && r.status === 403 ? N.notAllowed : !r.ok && r.status === 429 ? N.tooMany : N.saveFailed;

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="mt-1.5 shrink-0 self-start whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1.5 text-center text-xs leading-tight text-brand-text">{children}</span>
);

/** Mockup 20 (G31): the per-type switches. Behind notificationTypesUi(); the live daily reminder (TD-47) stays on top. */
export function NotificationsScreen({ products }: { products: ProductInfo }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null | "failed">(null);
  const [busy, setBusy] = useState<NotificationType | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setPrefs(null);
    const r = await getPrefs(fetch, await user.getIdToken());
    setPrefs(r.ok ? r.data : "failed");
  }, [user]);
  useEffect(() => void load(), [load]);

  const toggle = async (type: NotificationType, on: boolean) => {
    if (!user || busy) return;
    setBusy(type);
    setMessage(null);
    const token = await user.getIdToken();
    // Only this key is rolled back, so another row's state is never overwritten.
    const set = (v: boolean) => setPrefs((p) => (p && p !== "failed" ? { ...p, types: { ...p.types, [type]: v } } : p));
    const r = await optimistic(set, on, () => patchType(fetch, token, type, on));
    if (r.ok) setPrefs(r.data);
    else setMessage(failLine(r));
    setBusy(null);
  };

  const row = (type: NotificationType, p: NotificationPrefs) => {
    const { disabled, waitsOn } = rowState(type);
    const t = N.types[type];
    const chip = type === "routine_morning" ? timeLabel(p.morningTime) : type === "routine_evening" ? timeLabel(p.eveningTime) : type === "weekly_checkin" ? N.everyDay(N.days[p.weeklyCheckinDay]!) : null;
    return (
      <ToggleRow
        key={type}
        icon={ICON[type].icon}
        iconClassName={ICON[type].well}
        label={t.label}
        description={waitsOn ?? (t.note || undefined)}
        checked={p.types[type]}
        disabled={disabled}
        busy={busy === type}
        onChange={(v) => void toggle(type, v)}
        trailing={chip ? <Chip>{chip}</Chip> : undefined}
      />
    );
  };

  return (
    <>
      {prefs === null ? (
        <div role="status" aria-label={N.loading} className="flex flex-col gap-4">
          <Skel.Hero />
          <Skel.Row />
        </div>
      ) : prefs === "failed" ? (
        <section className={`${card} flex flex-col items-start gap-3`}>
          <p role="alert">{N.loadFailed}</p>
          <button type="button" className={btnSecondary} onClick={() => void load()}>
            {N.retry}
          </button>
        </section>
      ) : (
        <>
          {message && (
            <p role="alert" className="text-sm text-brand-error">
              {message}
            </p>
          )}
          {SECTIONS.map(({ key, types }) => (
            <section key={key} aria-labelledby={`n-${key}`} className={`${card} !pb-1`}>
              <h2 id={`n-${key}`} className="text-[17px] font-semibold leading-tight text-brand-text">
                {N.sections[key].title}
              </h2>
              <p className="mt-0.5 text-[13px] text-brand-text-muted">{N.sections[key].note}</p>
              <div className="mt-1 divide-y divide-brand-border">
                {key === "products" ? <ProductRows prefs={prefs} products={products} /> : types.map((t) => row(t, prefs))}
              </div>
            </section>
          ))}
        </>
      )}
      {/* The live daily reminder on this device (TD-47): the only thing that sends today. */}
      <HomeSettingsSection part="reminders" />
    </>
  );
}

/** One disabled switch per stored product id, with its store photo (or the neutral tile). */
function ProductRows({ prefs, products }: { prefs: NotificationPrefs; products: ProductInfo }) {
  const ids = Object.keys(prefs.products);
  if (!ids.length) return <ToggleRow label={N.types.product_usage.label} description={WAITS_ON.product_usage} icon={Sparkles} checked={prefs.types.product_usage} disabled onChange={() => undefined} />;
  return (
    <>
      {ids.map((id) => (
        <div key={id} className="flex items-start gap-3">
          {products[id]?.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- store CDN photo; next.config images is shared (kit-requests).
            <img src={products[id]!.image!} alt="" width={48} height={48} className="mt-2 size-12 shrink-0 rounded-tile bg-brand-50 object-cover" />
          ) : (
            <ProductTile step={null} size={48} className="mt-2" />
          )}
          <div className="min-w-0 flex-1">
            <ToggleRow label={products[id]?.title ?? id} description={WAITS_ON.product_usage} checked={prefs.products[id] === true} disabled onChange={() => undefined} />
          </div>
        </div>
      ))}
    </>
  );
}
