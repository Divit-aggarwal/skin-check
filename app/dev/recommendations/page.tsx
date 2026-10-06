import { notFound } from "next/navigation";
import { CATALOGUE } from "@/lib/catalog/catalogue";
import type { Catalogue } from "@/lib/catalog/schema";
import type { RecommendationResult } from "@/lib/contracts/recommendation-result";
import { adminDb, usesEmulators } from "@/lib/firebase/admin";
import { recommend } from "@/lib/rules/recommend";
import { RULE_INPUT_FIELDS, type RuleInputField } from "@/lib/rules/settings";
import { SECTIONS } from "@/lib/skin-check-steps";
import { RECONFIRM_EACH_SCAN_IDS } from "@/lib/skin-check-validation";
import { MISMATCHES } from "./mismatches";
import { STORE_CATALOGUE, STORE_LEFT_OUT, STORE_PRODUCTS, STORE_READ_ON, STORE_SOURCE } from "./store-catalogue";

// G03 part 4: the recommendation preview. Local development only: "not found"
// in any other build (tests/dev-recommendations.test.ts). Shows what lib/rules
// returns for chosen quiz answers or a seeded user, for the synthetic
// catalogue and for the public store's products. Reads the rules, changes
// nothing; nothing here is shown to users (O-D1).

export const dynamic = "force-dynamic";
export const metadata = { title: "Recommendation preview (local only)", robots: { index: false } };

type Params = Record<string, string | string[] | undefined>;

const STEPS = new Map(SECTIONS.flatMap((s) => s.steps).map((s) => [s.id, s]));
const stepOf = (field: RuleInputField) => STEPS.get(field) as { prompt: string; type: string; options: { value: string; label: string }[] };
const isSingle = (field: RuleInputField) => stepOf(field).type.startsWith("single");
const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const RECONFIRM = RULE_INPUT_FIELDS.filter((f) => RECONFIRM_EACH_SCAN_IDS.includes(f));

const SAMPLE: Record<string, unknown> = {
  gender: "female",
  primary_concerns: ["blemishes"],
  breakout_pattern: ["small_bumps"],
  pih_scar_tendency: "dark_mark_fades",
  current_products: ["cleanser_moisturizer"],
  female_skin_context: ["none_not_sure"],
};

const CATEGORY_STEP: Record<string, string> = { cleanser: "Cleanse", serum: "Treat", moisturiser: "Moisturise", sunscreen: "Protect", other: "No step in the rules" };

type Seeded = { uid: string; answers: Record<string, unknown> | null };

/** Seeded users and the answers of their newest check. Emulator only: never a real database. */
async function seededUsers(): Promise<Seeded[] | null> {
  if (!usesEmulators()) return null;
  const users = await adminDb().collection("users").listDocuments();
  return Promise.all(
    users.map(async (u) => {
      const snap = await u.collection("skinChecks").orderBy("createdAt", "desc").limit(1).get();
      const answers = snap.docs[0]?.get("answers");
      return { uid: u.id, answers: answers && typeof answers === "object" ? (answers as Record<string, unknown>) : null };
    })
  ).then((all) => all.filter((s) => s.answers).sort((a, b) => a.uid.localeCompare(b.uid)));
}

function run(answers: Record<string, unknown>, confirmed: string[], catalogue: Catalogue): RecommendationResult | string {
  try {
    return recommend({ answers, confirmedThisScan: confirmed }, catalogue);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export default async function RecommendationPreview({ searchParams }: { searchParams: Params }) {
  // First, before any read: this page exists only under `next dev`.
  if (process.env.NODE_ENV !== "development") notFound();

  let seeded: Seeded[] | null = null;
  let seedError = "";
  try {
    seeded = await seededUsers();
  } catch (error) {
    seedError = error instanceof Error ? error.message : String(error);
  }
  const seedUid = typeof searchParams.seed === "string" ? searchParams.seed : "";
  const fromSeed = seeded?.find((s) => s.uid === seedUid)?.answers ?? null;

  // The form wins; then a chosen seeded user; then the sample answers.
  const fromForm = searchParams.form === "1";
  const answers: Record<string, unknown> = fromForm
    ? Object.fromEntries(
        RULE_INPUT_FIELDS.flatMap((f) => {
          const v = list(searchParams[f]).filter(Boolean);
          if (v.length === 0) return [];
          return [[f, isSingle(f) ? v[0] : v]];
        })
      )
    : fromSeed ?? SAMPLE;
  const confirmed = fromForm ? list(searchParams.confirmed) : [...RECONFIRM];
  const results = [
    { title: "Synthetic catalogue (lib/catalog, the app's catalogue)", catalogue: CATALOGUE, result: run(answers, confirmed, CATALOGUE) },
    { title: `Public store catalogue: ${STORE_SOURCE.toLowerCase()}`, catalogue: STORE_CATALOGUE, result: run(answers, confirmed, STORE_CATALOGUE) },
  ];
  const storeResult = results[1]!.result;

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-eyebrow">Local development only</p>
        <h1 className="font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-brand-title sm:text-[40px]">Recommendation preview</h1>
        <p className="max-w-prose text-brand-muted">
          What lib/rules returns for these answers. This page is not in any production build, and no recommendation is shown to users (O-D1). The rules are
          provisional until clinical sign-off.
        </p>
      </header>

      <section aria-labelledby="input-title" className="flex flex-col gap-4 rounded-2xl border border-brand-card-line bg-brand-paper p-5 sm:p-6">
        <h2 id="input-title" className="font-display text-xl font-semibold uppercase tracking-[0.04em] text-brand-title">
          Answers
        </h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Seeded user (local emulator)
            <select name="seed" defaultValue={seedUid} className="h-12 max-w-full rounded-lg border border-brand-line bg-brand-paper px-3 text-base">
              <option value="">Choose a seeded user</option>
              {seeded?.map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.uid}
                </option>
              ))}
            </select>
          </label>
          <button className="min-h-12 rounded-full border border-brand-line px-[22px] text-[15px] font-semibold">Use this user&apos;s answers</button>
          {seeded === null && <p className="text-sm text-brand-muted">{seedError ? `Seeded users could not be read: ${seedError}` : "Seeded users need the local stack (npm run dev:local)."}</p>}
          {seedUid && !fromSeed && !fromForm && <p className="text-sm text-brand-error">That user has no saved answers. The sample answers are shown.</p>}
        </form>

        <form method="get" className="flex flex-col gap-5">
          <input type="hidden" name="form" value="1" />
          <div className="grid gap-5 md:grid-cols-2">
            {RULE_INPUT_FIELDS.map((f) => {
              const step = stepOf(f);
              const current = list(answers[f] as string | string[] | undefined);
              const single = isSingle(f);
              return (
                <fieldset key={f} className="flex flex-col gap-2 rounded-xl border border-brand-line p-4">
                  <legend className="px-1 text-sm font-semibold">
                    {f} <span className="font-normal text-brand-muted">({single ? "one" : "any"})</span>
                  </legend>
                  <p className="text-sm text-brand-muted">{step.prompt}</p>
                  {single && (
                    <label className="flex min-h-9 items-center gap-2 text-sm">
                      <input type="radio" name={f} value="" defaultChecked={current.length === 0} /> Not answered
                    </label>
                  )}
                  {step.options.map((o) => (
                    <label key={o.value} className="flex min-h-9 items-center gap-2 text-sm">
                      <input type={single ? "radio" : "checkbox"} name={f} value={o.value} defaultChecked={current.includes(o.value)} />
                      {o.label} <code className="text-xs text-brand-muted">{o.value}</code>
                    </label>
                  ))}
                  {RECONFIRM.includes(f) && (
                    <label className="mt-1 flex min-h-9 items-center gap-2 border-t border-brand-line pt-2 text-sm font-medium">
                      <input type="checkbox" name="confirmed" value={f} defaultChecked={confirmed.includes(f)} /> Confirmed on this check
                    </label>
                  )}
                </fieldset>
              );
            })}
          </div>
          <button className="min-h-[52px] self-start rounded-full bg-brand-action px-6 text-base font-medium text-white hover:bg-brand-action-hover">
            Show what the rules return
          </button>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {results.map((r) => (
          <ResultView key={r.title} title={r.title} catalogue={r.catalogue} result={r.result} />
        ))}
      </div>

      <section aria-labelledby="store-title" className="flex flex-col gap-4 rounded-2xl border border-brand-card-line bg-brand-paper p-5 sm:p-6">
        <h2 id="store-title" className="font-display text-xl font-semibold uppercase tracking-[0.04em] text-brand-title">
          The store&apos;s products
        </h2>
        <p className="rounded-xl bg-brand-mist px-4 py-3 text-sm font-semibold">
          {STORE_SOURCE}. Read from the product pages on {STORE_READ_ON}. The ingredient classes are assumptions made to run the rules.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-brand-line text-xs uppercase tracking-[0.06em] text-brand-muted">
              <tr>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Store step</th>
                <th className="py-2 pr-3">Key ingredient</th>
                <th className="py-2 pr-3">Size</th>
                <th className="py-2 pr-3">Price</th>
                <th className="py-2 pr-3">How the rules see it</th>
                <th className="py-2">What the rules did now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line align-top">
              {Object.entries(STORE_PRODUCTS).map(([id, p]) => {
                const item = typeof storeResult === "string" ? undefined : storeResult.items.find((i) => i.productId === id);
                const out = typeof storeResult === "string" ? undefined : storeResult.excluded.find((e) => e.productId === id);
                return (
                  <tr key={id}>
                    <td className="py-2 pr-3 font-semibold">
                      <a href={p.url} className="text-brand-forest underline" target="_blank" rel="noreferrer">
                        {p.name}
                      </a>
                      {!p.inStock && <span className="block font-normal text-brand-muted">Sold out</span>}
                    </td>
                    <td className="py-2 pr-3">{p.step}</td>
                    <td className="py-2 pr-3">{p.keyIngredient}</td>
                    <td className="py-2 pr-3">{p.size}</td>
                    <td className="py-2 pr-3">{p.price}</td>
                    <td className="py-2 pr-3">
                      {p.rules.category}; classes {p.rules.ingredientClasses.join(", ")}; active {p.rules.active ? `${p.rules.active.ingredient} ${p.rules.active.concentrationPct}%` : "none"}
                      <ul className="mt-1 list-disc pl-4 text-brand-muted">
                        {p.assumed.map((a) => (
                          <li key={a}>Assumed: {a}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-2">{item ? `Chosen (${item.ruleId})` : out ? `Left out (${out.ruleId}): ${out.reason}` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-brand-muted">
          Left out of this catalogue: {STORE_LEFT_OUT.map((k) => `${k.name} (${k.price}): ${k.why}`).join(" ")}
        </p>
      </section>

      <section aria-labelledby="mismatch-title" className="flex flex-col gap-4 rounded-2xl border border-brand-card-line bg-brand-paper p-5 sm:p-6">
        <h2 id="mismatch-title" className="font-display text-xl font-semibold uppercase tracking-[0.04em] text-brand-title">
          Where the rules and the real products do not fit
        </h2>
        <p className="text-sm text-brand-muted">Questions for the clinical reviewer (some for the owner, as marked). The rules are not changed.</p>
        <ol className="flex flex-col gap-4">
          {MISMATCHES.map((m, i) => (
            <li key={m.id} id={m.id} className="flex flex-col gap-1 rounded-xl border border-brand-line p-4">
              <p className="font-semibold">
                {i + 1}. {m.products.length > 0 ? m.products.join(", ") : "Step names"}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Store: </span>
                {m.store}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Rules: </span>
                {m.rules}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Question: </span>
                {m.question}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function ResultView({ title, catalogue, result }: { title: string; catalogue: Catalogue; result: RecommendationResult | string }) {
  const nameOf = (id: string) => catalogue.products.find((p) => p.id === id)?.name ?? id;
  const box = "flex flex-col gap-4 rounded-2xl border border-brand-card-line bg-brand-paper p-5 sm:p-6";
  if (typeof result === "string")
    return (
      <section className={box}>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p role="alert" className="text-brand-error">
          The rules refused this input: {result}
        </p>
      </section>
    );
  const firedBy = (ruleId: string) =>
    result.fired
      .filter((f) => f.ruleId === ruleId)
      .flatMap((f) => f.triggeredBy.map((t) => `${t.field} = ${t.value}`))
      .join("; ");
  const s = result.safety;
  const h3 = "text-xs font-bold uppercase tracking-[0.08em] text-brand-eyebrow";
  return (
    <section aria-label={title} className={box}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="text-xs text-brand-muted">
        {result.rulesetVersion} · {result.catalogVersion} · {result.reviewStatus} · input {result.inputSha256.slice(0, 12)}
      </p>

      <div>
        <h3 className={h3}>Red flag</h3>
        <p data-testid="red-flag">
          {s.redFlag ? `Yes: ${s.raisedBy.join(", ")}` : "No"}
          {s.extraCaution ? ` · Extra caution: ${s.extraCautionRaisedBy.map((c) => `${c.field} = ${c.value}`).join(", ")}` : " · No extra caution"}
        </p>
      </div>

      <div>
        <h3 className={h3}>Recommended routine, by step</h3>
        {result.items.length === 0 ? (
          <p>Nothing.</p>
        ) : (
          <ol className="divide-y divide-brand-line">
            {result.items.map((i) => {
              const p = catalogue.products.find((x) => x.id === i.productId);
              return (
                <li key={i.productId} className="py-2">
                  <p className="font-semibold">
                    {i.position}. {CATEGORY_STEP[p?.category ?? "other"]}: {nameOf(i.productId)} <span className="font-normal text-brand-muted">({i.slot})</span>
                  </p>
                  <p className="text-sm">
                    Rule <code>{i.ruleId}</code>
                    {firedBy(i.ruleId) ? `, because ${firedBy(i.ruleId)}` : ", for everyone"}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div>
        <h3 className={h3}>Limits and notices</h3>
        <ul className="list-disc pl-5 text-sm">
          {[...result.limits, ...result.notices].map((l) => (
            <li key={l.ruleId}>
              <code>{l.ruleId}</code>: {l.text}
            </li>
          ))}
          {result.limits.length + result.notices.length === 0 && <li>None.</li>}
        </ul>
      </div>

      <div>
        <h3 className={h3}>Left out, and why</h3>
        <ul className="list-disc pl-5 text-sm">
          {result.excluded.map((e) => (
            <li key={e.productId}>
              {nameOf(e.productId)}: <code>{e.ruleId}</code>, {e.reason}
            </li>
          ))}
          {result.excluded.length === 0 && <li>Nothing.</li>}
        </ul>
      </div>

      <div>
        <h3 className={h3}>Unknown</h3>
        <ul className="list-disc pl-5 text-sm">
          {result.unknowns.map((u) => (
            <li key={u.field}>
              {u.field}: {u.text}
            </li>
          ))}
          {result.unknowns.length === 0 && <li>Nothing unknown.</li>}
        </ul>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-brand-forest">Every rule that fired</summary>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {result.fired.map((f) => (
            <li key={f.ruleId}>
              <code>{f.ruleId}</code>
              {f.triggeredBy.length > 0 && `: ${f.triggeredBy.map((t) => `${t.field} = ${t.value}${t.fresh ? "" : " (not confirmed)"}`).join("; ")}`}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
