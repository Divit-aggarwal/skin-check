"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { CATALOGUE, getProduct } from "@/lib/catalog/catalogue";
import { OWN_PRODUCT_INFO } from "@/lib/context/products";
import { METRIC_LABELS } from "@/lib/skin-check-skus";
import { sinceStarted } from "@/lib/readings/series";
import type { SinceStarted as SinceData } from "@/lib/feature-contracts/readings-series";
import { loadDashboard, type DashboardData } from "@/components/dashboard/data";
import { seriesChecks } from "@/components/dashboard/state";
import { DASHBOARD_COPY as D } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/format";
import { useRoutine } from "@/components/routine/useRoutine";
import { startedProducts } from "@/lib/routine/events";
import { AppHeader, ChangeSlot, LevelTimeline, MetricTile, PhotoStrip } from "@/components/ui/kit";
import { btnPrimary, card, EmptyState, ErrorState, h2, LoadingState, page, ReloadButton, SignedOutCard, textLink } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { PRODUCTS_COPY as C } from "./copy";
import { ProductPhoto } from "./ProductPhoto";
import { productHref, sinceHref } from "./ProductTile";
import { useStoreProducts } from "./useStoreProducts";

// Screen 16 (TD-53): the user's own checks on or after the day they started one
// product (routine events, `since`). Association only: the title says "since
// you started", and nothing says the product did anything. Per reading: the
// level word at the latest check, a ChangeSlot (closed until C12), and the
// level at each check (LevelTimeline). Own kept photos only (/api/checks/photo).
// No claim tags, no response score, no insight line, no other users.

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: DashboardData };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const dayDate = (ymd: string) => formatDate(new Date(`${ymd}T12:00:00+05:30`));
const ORDER = CATALOGUE.products.map((p) => p.id);

export function SinceStarted({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const routine = useRoutine();
  const store = useStoreProducts();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad({ kind: "loading" });
    loadDashboard(user.uid).then(
      (data) => active && setLoad({ kind: "ready", data }),
      (error) => {
        console.error("[product checks] load failed", error instanceof Error ? error.name : error);
        if (active) setLoad({ kind: "error" });
      }
    );
    return () => {
      active = false;
    };
  }, [user]);

  const started = useMemo(() => startedProducts(routine.data?.routine ?? [], ORDER), [routine.data]);
  const current = started.find((r) => r.productId === id);
  const result = useMemo(
    () => (user && current && load.kind === "ready" ? sinceStarted(seriesChecks(user.uid, load.data.checks, load.data.analyses), id, current.startedOn, new Date()) : null),
    [user, current, load, id]
  );

  const name = getProduct(id)?.name ?? id;
  const head = (
    <>
      <AppHeader back backLabel={C.back} />
      <div className="flex flex-col gap-1 pt-2">
        <h1 className="break-words text-[28px] font-semibold leading-tight text-brand-text sm:text-[32px]">{C.sinceTitle(name)}</h1>
        <p className="text-brand-text-muted">{C.sinceIntro}</p>
      </div>
    </>
  );
  const shell = (body: React.ReactNode) => (
    <main className={page}>
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {head}
        {body}
      </div>
    </main>
  );

  if (loading || (user && !routine.data && !routine.failed)) return shell(<LoadingState label={C.loading} blocks={["h-28", "h-40", "h-40"]} />);
  if (!user) return shell(<SignedOutCard body={C.signIn} />);
  if (!routine.data) return shell(<ErrorState body={C.error} action={<ReloadButton label={C.tryAgain} />} />);
  if (started.length === 0)
    return shell(<EmptyState title={C.emptyTitle} body={C.empty} action={<Link href="/routine" className={btnPrimary}>{C.toRoutine}</Link>} />);

  const chips = (
    <nav aria-label={C.yourProducts} className="-mx-4 sm:mx-0">
      <ul className="flex gap-2 overflow-x-auto px-4 pb-1 sm:px-0">
        {started.map((r) => {
          const on = r.productId === id;
          const n = getProduct(r.productId)!.name;
          return (
            <li key={r.productId} className="shrink-0">
              <Link
                href={sinceHref(r.productId)}
                aria-current={on ? "page" : undefined}
                className={cn("flex h-full min-h-11 w-[84px] flex-col items-center gap-1 rounded-tile border bg-brand-surface p-2 text-center", on ? "border-2 border-brand-700" : "border-brand-border hover:bg-brand-50")}
              >
                <ProductPhoto image={store?.find((s) => s.productId === r.productId)?.images[0]} step={OWN_PRODUCT_INFO[r.productId]?.step} width={48} />
                <span className={cn("line-clamp-2 text-[11px] leading-tight", on ? "font-semibold text-brand-700" : "text-brand-text")}>{n}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  if (!current) return shell(<>{chips}<EmptyState body={C.notStarted(name)} action={<Link href="/routine" className={btnPrimary}>{C.toRoutine}</Link>} /></>);

  const image = store?.find((s) => s.productId === id)?.images[0];
  return shell(
    <>
      {chips}
      <section aria-label={name} className={cn(card, "flex items-stretch gap-4 overflow-hidden p-0 sm:p-0")}>
        <div className="grid w-32 shrink-0 place-items-center bg-brand-100 p-3">
          <ProductPhoto image={image} step={OWN_PRODUCT_INFO[id]?.step} width={104} priority />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-4 pr-4">
          <p className="break-words text-lg font-semibold leading-snug text-brand-text">{name}</p>
          <p className="text-sm text-brand-text-muted">{C.startedOn(dayDate(current.startedOn))}</p>
          <Link href={productHref(id)} aria-label={C.detailsLabel(name)} className={cn(textLink, "self-start text-sm")}>
            {C.details}
          </Link>
        </div>
      </section>
      {load.kind === "loading" ? (
        <LoadingState label={C.loading} blocks={["h-40", "h-40"]} />
      ) : load.kind === "error" || !result ? (
        <ErrorState body={C.error} action={<ReloadButton label={C.tryAgain} />} />
      ) : (
        <Readings result={result} />
      )}
    </>
  );
}

function Readings({ result }: { result: SinceData }) {
  const series = result.readings.series;
  const points = series[0]?.points ?? [];
  if (points.length === 0)
    return <EmptyState body={C.noChecks} action={<Link href="/skin-check" className={btnPrimary}>{C.takeCheck}</Link>} />;
  const kept = points.filter((p) => p.photos.front).map((p) => ({ scanId: p.scanId, label: shortDate(p.at) }));
  return (
    <>
      <section aria-labelledby="readings-title" className="flex flex-col gap-3">
        <div>
          <h2 id="readings-title" className={h2}>{C.readings}</h2>
          <p className="text-sm text-brand-text-muted">{C.readingsIntro}</p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {series.map((s) => {
            const last = [...s.points].reverse().find((p) => p.band);
            return (
              <li key={s.metric}>
                <MetricTile
                  reading={s.metric}
                  label={METRIC_LABELS[s.metric]}
                  level={last?.band ?? C.noReading}
                  tag={s.points[0]?.earlyEstimate ? D.table.earlyEstimate : undefined}
                  context={last ? `${C.latest}: ${shortDate(last.at)}` : undefined}
                  footer={<ChangeSlot slot={s.change} />}
                />
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="timelines-title" className="flex flex-col gap-3">
        <h2 id="timelines-title" className={h2}>{C.timelines}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {series.map((s) => (
            <li key={s.metric} className={cn(card, "flex flex-col gap-2")}>
              <p className="font-semibold text-brand-text">{METRIC_LABELS[s.metric]}</p>
              <LevelTimeline reading={s.metric} label={METRIC_LABELS[s.metric]} points={s.points.map((p) => ({ key: p.scanId, dateLabel: shortDate(p.at), band: p.band }))} />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="photos-title" className="flex flex-col gap-3">
        <h2 id="photos-title" className={h2}>{C.photos}</h2>
        {kept.length === 0 ? <p className="text-brand-text-muted">{C.photosNone}</p> : <OwnPhotos kept={kept.slice(-4)} />}
      </section>
    </>
  );
}

/** The user's own kept photos through /api/checks/photo (H27: only what the server finds). Never stock. */
function OwnPhotos({ kept }: { kept: { scanId: string; label: string }[] }) {
  const { user } = useAuth();
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const ids = kept.map((k) => k.scanId).join(",");
  useEffect(() => {
    setUrls(null); // never a photo from another user or list (security review G03, L1)
    if (!user) return;
    let active = true;
    (async () => {
      const token = await user.getIdToken();
      const found = await Promise.all(
        ids.split(",").map(async (scanId) => {
          try {
            const res = await fetch(`/api/checks/photo?scanId=${encodeURIComponent(scanId)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
            const body = res.ok ? ((await res.json()) as { url?: unknown }) : null;
            return typeof body?.url === "string" ? ([scanId, body.url] as const) : null;
          } catch {
            return null;
          }
        })
      );
      if (active) setUrls(Object.fromEntries(found.filter((f) => f !== null)));
    })();
    return () => {
      active = false;
    };
  }, [user, ids]);
  if (!urls) return <p role="status" className="text-sm text-brand-text-muted">{C.photosLoading}</p>;
  const photos = kept.flatMap((k) => (urls[k.scanId] ? [{ key: k.scanId, src: urls[k.scanId]!, alt: C.ownPhotoAlt(k.label), label: k.label }] : []));
  if (photos.length === 0) return <p className="text-brand-text-muted">{C.photosNone}</p>;
  return <PhotoStrip photos={photos} />;
}
