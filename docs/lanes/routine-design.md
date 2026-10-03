# Routine lane design (E01, E03, E04)

Branch `lane/routine`, worktree `../skin-check-routine`. Status: **APPROVED by the owner on 2026-10-03** with the decisions in §0. Lane README rule 3 is met.

This file sits at the path the owner named for the design step. `routine-report.md` will link it. README rule 3 says the brief goes "in your report": if the owner prefers that, the content moves into the report unchanged.

Read with: [README.md](README.md), [routine.md](routine.md), `docs/architecture/RECOMMENDATION_MODEL.md`, `DATA_MODEL.md`, `GEMINI_BOUNDARY.md`, and `DECISION_LOG.md` (D-08, D-09, D-12, D-23, D-26, B14).

## 0. Owner decisions (2026-10-03)

The owner approved this design with these answers. Where a decision changes the text below, the text has been updated to match.

| # | Answer | Effect on the build |
|---|---|---|
| R-1 | **A.** Store routine data for one purpose only: the user keeps and sees their own routine record. No analytics, no Gemini, no join to scans. | Steps 2 to 8 go ahead. The purpose text belongs in `lib/consent.ts` (privacy lane request). |
| R-2 | **B.** No product cards for now. | Nothing in this lane changes. |
| R-3 | **A.** Keep the synthetic sample until the owner supplies real data through the template. | Step 9 is skipped. |
| R-4 | **A.** No skin data and no claims on the routine page. | The wording and import tests apply to the page. |
| R-5 | **B.** Our catalogue plus one unnamed entry, "other product (not ours)". No free text. | `OTHER_PRODUCT_ID` (§2.2). |
| R-6 | **A.** The server writes the events. | Rules are read-only for clients (§2.4). |
| Names | Real product names such as "Clear Seal" get an **exact-name exception** from the word check. The check still applies to usage text and all other wording. | `PRODUCT_NAME_EXCEPTIONS` (§4). Recorded as a proposed D-12 *clarification* ("a registered own-brand product name is not by itself a claim"), not a change: D-12 is LOCKED. |

## 1. What will be built

**E01: product catalogue schema.** This is a typed, versioned list of our own products: what each product is, its ingredients, the claims we are allowed to make (each with evidence, source and date), its safety notes, its price and whether it is on sale. The lane builds the schema, the checks that reject a bad entry, and a small **synthetic** sample. The owner fills in the real products using the template `lib/catalog/catalogue-template.csv`, and an engineer copies them into the typed file. The catalogue lives in git as TypeScript, so review is a pull request and the release is a deploy (D-08). Nothing in this lane *chooses* products for a user. That is E02, which is not in this lane.

**E03: routine model and event history.** A routine is the user's own record of which of our products they use (plus at most one unnamed "other product (not ours)", R-5 B), and when (morning, evening or both; which days of the week). It is not a suggestion from the app. Every change is a new, permanent event: start a product, stop it, swap it for another, change its schedule, or log "used" or "skipped" for one day. Nothing is ever edited or deleted. The user's current routine is *computed* from the events on every read; it is never stored. The server writes the events after checking the signed-in user. Clients can read their own events and can never write, change or delete them.

**E04: adherence summary.** This is a pure function. It takes the events and a date range, and says for each product, day and slot whether the user reported **used**, reported **skipped**, or reported nothing, which is **unknown**. A missing log is always "unknown" and never "skipped". It returns counts only: no percentage, no score and no threshold. Days in the future are left out.

**Routine page.** A simple page at `/routine` where a signed-in user sees their current routine, adds or stops a product, and logs used or skipped. It shows product names, the schedule, and the user's own used / skipped / not-logged record for the last 7 days (E04 counts, no rate). It does not show `usageText`. It shows no scan, no skin reading, no band and no product claim. That keeps products and skin results apart (D-12).

## 2. Data shapes

All types are written as zod schemas with `.strict()` at **every** level, so an unknown field anywhere is rejected. TypeScript types are inferred from the schemas. Dates the user picks are local calendar dates written as `"YYYY-MM-DD"` strings, never `Date` objects. That avoids time-zone and daylight-saving drift.

### 2.1 Catalogue (`lib/catalog/schema.ts`, `lib/catalog/catalogue.ts`)

```ts
CATALOG_SCHEMA_VERSION = 1                       // the shape of an entry
CATALOG_VERSION = "catalog-0-synthetic"          // bumped on any data change

Catalogue = {
  schemaVersion: 1,
  version: string,                               // == CATALOG_VERSION
  products: Product[]                            // ids unique (checked)
}

Product = {
  id: string,                    // stable slug, /^[a-z0-9-]+$/, never reused; a row is never removed, only marked "discontinued"
  versionId: string,             // changes only on a real reformulation (RECOMMENDATION_MODEL §3, GS1 rule 263)
  dataSource: "synthetic" | "owner",
  name: string,
  category: "cleanser" | "moisturiser" | "sunscreen" | "serum" | "other",
  slot: "AM" | "PM" | "AM_PM",   // when it may be used
  shopifyHandle: string | null,  // null until verified
  shopifyHandleVerified: boolean,
  ingredientClasses: IngredientClass[],          // closed enum, extended by PR
  inci: string[],                // full INCI list, may be [] until supplied
  active: { ingredient: string, concentrationPct: number } | null,   // 0 < pct <= 100
  warnings: string[],            // label warnings, verbatim
  contraindications: ("pregnant_or_breastfeeding" | "prescription_in_use")[],  // data only; E02 evaluates them
  price: { mrpInr: number, packSize: string },   // whole rupees, integer >= 0
  availability: "available" | "out_of_stock" | "discontinued",
  regions: ("IN")[],             // India-first; more by PR
  usageText: string,             // the only usage wording anyone may repeat
  claims: Claim[]                // the whitelist of claim text
}

Claim = {
  text: string,
  evidenceLevel: "product-test" | "consumer-perception" | "ingredient+concentration",
  source: string,
  date: string                   // YYYY-MM-DD
}

IngredientClass = "surfactant" | "humectant" | "emollient" | "occlusive" |
                  "uv-filter" | "niacinamide" | "retinoid" | "aha" | "bha" |
                  "vitamin-c" | "fragrance" | "other"
```

`contraindications` and `claims` are stored here but **not used by this lane**. E02 evaluates eligibility, and the routine UI never renders claims.

### 2.2 Routine event (`lib/routine/events.ts`)

Firestore path: `users/{uid}/routineEvents/{eventId}`. The server writes it through the Admin SDK. It is never updated or deleted.

```ts
ROUTINE_EVENT_SCHEMA_VERSION = 1

Weekday  = 0 | 1 | 2 | 3 | 4 | 5 | 6     // 0 = Sunday
Schedule = { slot: "AM" | "PM" | "AM_PM", days: Weekday[] }   // days non-empty, unique

// What the client sends (POST /api/routine/events). Strict.
RoutineEventInput =
  | { type: "start",           eventId, productId, effectiveDate, timeZone, schedule: Schedule }
  | { type: "stop",            eventId, productId, effectiveDate, timeZone }
  | { type: "substitute",      eventId, productId, toProductId, effectiveDate, timeZone, schedule: Schedule }
  | { type: "schedule_change", eventId, productId, effectiveDate, timeZone, schedule: Schedule }
  | { type: "usage",           eventId, productId, effectiveDate, timeZone,
                               slot: "AM" | "PM", status: "used" | "skipped" }

eventId:       UUID v4, chosen by the client, used as the doc id (makes retries safe)
productId:     a product id in the current CATALOGUE, or OTHER_PRODUCT_ID ("other-not-ours"; R-5 B)
toProductId:   the same rule as productId
               `start` and `substitute.toProductId` also need availability "available" (400 `product_not_available`);
               `stop`, `schedule_change`, `usage` and `substitute.productId` accept any catalogue row, so a
               user can always stop or log an out-of-stock or discontinued item. OTHER_PRODUCT_ID is always accepted.
schedule.slot: not checked against Product.slot. The record is self-reported; judging use is E02, not this lane.
effectiveDate: "YYYY-MM-DD", the user's local day the event applies to; not after "today" in timeZone
timeZone:      IANA name (checked with Intl.DateTimeFormat), default "Asia/Kolkata"
               (no lower limit on effectiveDate, and the user may pick any valid zone: this is
               self-reported data, not measured skin state, so D-26 does not apply to it)

// What is stored = input + server fields
RoutineEvent = RoutineEventInput & {
  schemaVersion: 1,
  catalogVersion: string,        // CATALOG_VERSION at write time (provenance)
  recordedAt: Timestamp,         // server time, FieldValue.serverTimestamp()
  source: "user"                 // only value in v1; never "gemini"
}
```

There are no free-text fields. Stop reasons, notes and non-catalogue product names are not collected, because free text here could hold health data such as a prescription name (decision R-5).

`OTHER_PRODUCT_ID = "other-not-ours"` (R-5 B) is defined in `lib/routine/events.ts`, not as a catalogue row, because a catalogue row needs price, INCI and claims that do not exist for it. Its only display name is "Other product (not ours)". It carries no name, brand or ingredient, so a user can have **one** "other" item at a time: a second `start` of it is ignored like any double start. It can be scheduled, stopped, swapped and logged like a catalogue product.

### 2.3 Computed views (never stored)

```ts
// lib/routine/events.ts
currentRoutine(events, onDate) -> RoutineItem[]
RoutineItem = { productId, schedule: Schedule, since: string /* YYYY-MM-DD */ }
// since = effectiveDate of the start (or substitute) that began the current active period;
// schedule_change, and a substitute into an already-active product, do not move it.

// lib/routine/adherence.ts
adherence(events, { from, to, today }) -> {   // all three are YYYY-MM-DD
  days: { date, productId, slot: "AM" | "PM", status: "used" | "skipped" | "unknown" }[],
  counts: { used: number, skipped: number, unknown: number }
}
```

Meaning, fixed here so the tests can pin it:
- `today` is computed by the caller: `GET /api/routine/events?tz=<IANA>` (checked with Intl, default `Asia/Kolkata`, 400 `bad_time_zone` if invalid). GET returns `{ today, events, routine: currentRoutine(events, today), adherence: adherence(events, { from: today − 6 days, to: today, today }) }`. `adherence()` itself never reads a clock. Event dates are used exactly as written; when a user's events carry different time zones, no conversion is done, because each date is the user's own local day.
- Events are applied in order of `effectiveDate`, then `recordedAt`, then `eventId`. The tiebreak is deterministic.
- `start` on day D: the product is in the routine **from D** (inclusive).
- `stop` on day D: the product is **not** in the routine **on D** (exclusive).
- `substitute` on D = stop `productId` on D + start `toProductId` on D, in one event. `productId` and `toProductId` must differ (schema check). If `productId` is not active, the stop part does nothing and `toProductId` still starts. If `toProductId` is already active, its schedule is replaced from D (the same as a `schedule_change`).
- `schedule_change` on D applies from D.
- An "expected slot" is a product in the routine that day, on a scheduled weekday, for each of AM and PM covered by its slot (`AM_PM` gives two).
- For each expected slot, the **latest** `usage` event for (product, date, slot) decides `used` or `skipped`. No usage event means `unknown`.
- Days after `today` are not listed. A usage log for a slot that was not expected is ignored by the summary.
- Odd sequences never throw: a stop with no start, or a second start, are ignored with no effect. The route does not have to guard order, so a race between two tabs cannot corrupt the view.

### 2.4 Firestore rules (marked section only)

```
// ── lane:routine ──
match /routineEvents/{eventId} {
  allow get, list: if request.auth != null && request.auth.uid == uid;
  allow write: if false;      // server (Admin SDK) only; append-only enforced by the route
}
// ── end lane:routine ──
```

This differs from the brief ("allow `create`") and from DATA_MODEL ("client, rules-validated create-only, `events/{autoId}`"). See decision R-6.

## 3. Files

### Add (the routine ownership list, plus the owner-named design and report files)

| File | Purpose |
|---|---|
| `lib/catalog/schema.ts` | zod schema, types, `CATALOG_SCHEMA_VERSION` |
| `lib/catalog/catalogue.ts` | `CATALOG_VERSION`, `CATALOGUE` (synthetic until R-3), `getProduct(id)`, `PRODUCT_NAME_EXCEPTIONS` |
| `lib/catalog/wording.ts` | The D-12 banned-word list and matcher, shared by the catalogue and copy tests |
| `lib/catalog/catalogue-template.csv` | Owner fill-in template, one synthetic example row (**added with this design**) |
| `lib/routine/events.ts` | Event schemas, `ROUTINE_EVENT_SCHEMA_VERSION`, `currentRoutine()` |
| `lib/routine/adherence.ts` | `adherence()` |
| `lib/routine/copy.ts` | Every user-facing routine string, in one place so one test can check them all |
| `app/api/routine/events/route.ts` | `GET ?tz=` (own events, current routine, 7-day adherence), `POST` (append one event) |
| `app/(marketing)/routine/page.tsx` | Page shell |
| `components/routine/RoutinePage.tsx` | Client component: list, add, stop, swap, log |
| `scripts/seed-lane-routine.ts` | Routine events for the two seed users (local stack only) |
| `tests/catalog-schema.test.ts` | §4 |
| `tests/routine-events.test.ts` | §4 |
| `tests/routine-adherence.test.ts` | §4 |
| `tests/routine-copy.test.ts` | §4 (D-12 wording and import boundaries) |
| `tests/routine-route.test.ts` | §4 |
| `tests/firestore-rules-routine.test.ts` | §4 (emulator) |
| `docs/lanes/routine-design.md` | This file |
| `docs/lanes/routine-report.md` | Lane report (at the end) |

### Change

| File | Change |
|---|---|
| `firestore.rules` | Only the `// ── lane:routine ──` section above, just before the closing brace of `match /users/{uid}` |

### Not changed

- `lib/skin-check-skus.ts`: not needed. `SKU_DISPLAY` stays as it is; E02 decides its fate (R-2 B: no cards).
- `components/skin-check/SkinCheckDashboard.tsx`: no routine link (see §5).
- `.env.development.example`: no new variable.
- `package.json`: no new dependency. zod, vitest, firebase-admin and `@firebase/rules-unit-testing` are already installed.
- `lib/skin-check-rules.ts`, `lib/skin-state*.ts`, `lib/gemini*.ts`, `lib/echo-trusted-context.ts`, the tracker and `DECISION_LOG.md`.

## 4. Tests

All are unit tests (vitest) unless marked emulator. Emulator tests run under `npm run test:local`.

**`catalog-schema.test.ts` (E01)**
- The shipped `CATALOGUE` passes the schema.
- `CATALOG_VERSION` and `CATALOG_SCHEMA_VERSION` exist, and `CATALOGUE.version === CATALOG_VERSION`.
- A valid minimal product passes.
- Failure: an unknown top-level field is rejected.
- Failure: an unknown field nested in `claims[]`, `price` or `active` is rejected.
- Failure: a duplicate `id` is rejected.
- Failure: a bad `id` slug is rejected.
- Failure: `concentrationPct` of 0 or above 100 is rejected.
- Failure: a negative or fractional `mrpInr` is rejected.
- Failure: a claim `date` that is not YYYY-MM-DD is rejected.
- Failure: an `evidenceLevel` outside the enum is rejected.
- Failure: an unknown `ingredientClass` is rejected.
- Failure: `shopifyHandleVerified: true` with `shopifyHandle: null` is rejected.
- Every row of `catalogue-template.csv` has exactly the header's column count. The test holds an explicit table mapping each CSV column to its schema field (for example `mrp_inr` → `price.mrpInr`, `claim_1_text` → `claims[0].text`, `shopify_handle_verified` yes/no → boolean). The test fails if a column has no mapping or a schema field has no column. This catches drift between the template and the schema.
- The catalogue's wording fields (`name`, shown on the page, and `usageText`, the only usage wording anyone may repeat) pass the same D-12 word check as `routine-copy.test.ts`. A product name that contains a banned word fails, **unless** it is a registered own-brand name listed exactly in `PRODUCT_NAME_EXCEPTIONS` (`lib/catalog/catalogue.ts`), such as "Clear Seal". Each entry carries `{ name, approvedBy: "owner", date, reason }`. The exception applies only to a product with `dataSource: "owner"` whose whole `name` equals the entry (case-sensitive): "Clear Seal Serum" is not excepted, a synthetic product is never excepted, and `usageText` never is. A name that is itself an efficacy statement is not a brand name and needs explicit D-12 sign-off, not a list entry.
- The exception rule takes the list as a parameter; its self-check passes a planted list (excepted owner name passes, longer name fails, synthetic product fails, the same words in usage text fail). Every real entry has an owner approval, a date and a reason.

**`routine-events.test.ts` (E03, pure)**
- Each event type parses.
- Failure: an unknown field at top level is rejected.
- Failure: an unknown field inside `schedule` is rejected.
- Failure: a missing `eventId` is rejected.
- Failure: a non-UUID `eventId` is rejected.
- Failure: empty `days` is rejected.
- Failure: duplicate `days` are rejected.
- Failure: weekday 7 is rejected.
- Failure: an invalid IANA `timeZone` is rejected.
- Failure: `slot` on a `usage` event of `AM_PM` is rejected.
- Failure: `status: "unknown"` cannot be submitted.
- Failure: a `substitute` with `toProductId === productId` is rejected.
- `OTHER_PRODUCT_ID` parses as `productId` and `toProductId`; a second `start` of it while active is ignored.
- `currentRoutine`:
  - start then stop;
  - stop on D excludes D;
  - start on D includes D;
  - schedule change from D;
  - **a substitution is a new event**: the old product ends and the new one starts on D, and the input array is not mutated (asserted with a frozen array);
  - a stop with no start, and a double start, are harmless;
  - the same-day order is decided by `recordedAt`, then `eventId`;
  - a substitute whose `productId` is not active still starts `toProductId`;
  - a substitute whose `toProductId` is already active replaces its schedule from D.

**`routine-adherence.test.ts` (E04, pure)**
- Used, skipped and unknown from a mixed sequence.
- **A window with zero logs gives every expected slot `unknown`, and `skipped` is 0.**
- **A missing day between two "used" days is `unknown`, not `skipped`.**
- A later log for the same product, date and slot replaces the earlier one ("skipped" then "used" gives used), with a deterministic tiebreak.
- `AM_PM` gives two slots a day. `AM` gives one.
- An unscheduled weekday is not listed.
- Date edges:
  - the start day is included and the stop day is excluded;
  - a substitution on D splits cleanly;
  - `today` is included and tomorrow is excluded;
  - `from === to`;
  - month end and 29 Feb 2028;
  - Failure: `from > to` throws.
- The output has counts and no rate field.

**`routine-copy.test.ts` (D-12 and boundaries)**
- No string in `lib/routine/copy.ts`, and no JSX text in `components/routine/**` or `app/(marketing)/routine/**`, contains a causal or efficacy word.
  - Matching: case-insensitive, whole word or whole phrase; an entry ending in `*` matches as a prefix.
  - The list is GEMINI_BOUNDARY rule 4: improve*, better, worse, lower, higher, less, more than, reduc*, increas*, fade*, clear*, calm*, brighten*, even out, repair*, restore*, went down, went up, last time, progress*, pehle, kam, zyada, behtar, accha hua.
  - Plus rule 5: diagnos*, cure*, heal*, treat*, prescription, guarantee*, proven, causes, caused, caused by, twin, acne, eczema, rosacea, melasma, psoriasis, dermatitis.
  - Plus routine-specific phrases: works, working, results, because of, thanks to, since you started, before and after.
  - Dropped from rule 4 on purpose: `before` (usage text such as "use before moisturiser" is an order instruction) and `since` alone (the page shows "since <date>" for when a product was added). Both remain banned inside the phrases "before and after" and "since you started".
- Failure: the test's own self-check shows that a planted "your skin improved" string is caught.
- No file under `lib/routine/**`, `lib/catalog/**`, `app/api/routine/**`, `components/routine/**` or `app/(marketing)/routine/**` imports `gemini`, `echo`, `skin-check-rules`, `skin-state` or `scanAnalyses`.
- No routine UI file references `claims`.
- The same check runs over `CATALOGUE[].name` (except an exact `PRODUCT_NAME_EXCEPTIONS` match) and `CATALOGUE[].usageText` (no exception).

**`routine-route.test.ts` (route, with the Admin SDK mocked as in the existing route tests)**
- Failure: no token gives 401.
- Failure: a bad token gives 401.
- Failure: a `uid` field in the body is rejected (strict).
- Failure: an unknown `productId` gives 400 `unknown_product`.
- `OTHER_PRODUCT_ID` is accepted as `productId` and as `toProductId`.
- Failure: an unknown `toProductId` gives 400 `unknown_product`.
- Failure: `start` of a product that is not "available" gives 400 `product_not_available`; `stop` and `usage` of it are accepted.
- Failure: `GET` with an invalid `tz` gives 400 `bad_time_zone`; `GET` returns `routine` and `adherence` for the caller.
- Failure: `toProductId === productId` gives 400.
- POST writes to `users/{uid from the token}/routineEvents/{eventId}` and nowhere else. This is the owner-only write check, since under R-6 A only the route can write.
- Failure: a future `effectiveDate` for the given time zone gives 400 `future_date`. Asia/Kolkata midnight is tested.
- Failure: an invalid time zone gives 400.
- A valid event is stored with `recordedAt` from the server, `catalogVersion`, `source: "user"` and `schemaVersion`.
- A replay with the same `eventId` and the same **input fields** gives 200 and no second write. Only the input fields are compared (not `recordedAt`, `catalogVersion` or `schemaVersion`), so a replay after a catalogue version bump still gives 200. The write is `docRef.create()`; on ALREADY_EXISTS the route reads the doc and compares, so two racing requests cannot both write.
- Failure: the same `eventId` with a different body gives 409.
- A substitution creates a new document and leaves the earlier start document byte-identical.
- `GET` returns only the caller's events.

**`firestore-rules-routine.test.ts` (emulator)**
- The owner can `get` and `list` their events.
- Failure: another user cannot `get` or `list` them.
- Failure: no auth cannot `get` or `list` them.
- Failure: the owner cannot create, even with a valid body.
- Failure: the owner cannot update.
- Failure: the owner cannot delete.

## 5. What this lane will NOT build

- Choosing or recommending products, eligibility or safety rules, red flags (E02, E05), and product cards (OPEN-R1).
- Any link between routine events and skin readings: no timeline next to scans (G02), and no "before/after".
- A routine link or panel on `SkinCheckDashboard`. It sits next to the skin bands, and putting products there is exactly what G02 must review under D-12. The page is reached by URL until G02 or the owner decides.
- Any routine data sent to Gemini or Echo. `lib/echo-trusted-context.ts` and `lib/gemini.ts` belong to privacy, and the ContextPackage is F01, later.
- Adherence rates, percentages, streaks, scores or "good/bad" labels.
- Reminders and notifications.
- Free-text notes, stop reasons, and named non-catalogue products (only the one unnamed "other" entry, R-5 B).
- Event correction or delete. A wrong usage log is fixed by logging again (the latest wins). A wrong start is fixed by a stop.
- Shopify integration and handle verification (an owner data task).
- Erasure of routine events. That is the privacy lane's H01 (see the cross-lane requests below).
- Any decision about which product is eligible for a user, by Gemini or by code. The picker lists catalogue products with `availability: "available"` and nothing else; eligibility and safety are E02. No routine file imports Gemini (tested), and `source` can never be `"gemini"`.
- Any production write. Everything runs on the local stack only (E03 note: no production writes before A04).

**Cross-lane requests (go in the report; not owner decisions):**
- privacy (H01): add `users/{uid}/routineEvents/*` to the list of places user data lives. `recursiveDelete` on `users/{uid}` covers it, and the erasure test should seed one routine event.
- privacy (D-16): R-1 A is approved. The purpose text for the routine record ("So you can keep a record of your own routine and see it back. Only you see it. It is not used for analytics, not sent to Gemini and not joined to your scans.") belongs in `lib/consent.ts`, which privacy owns. Until then the page shows the same sentence from `lib/routine/copy.ts`.

**Proposed DECISION_LOG entries (the lane cannot edit DECISION_LOG; the owner records them):**
- R-1 A: supersedes B14 for the user's own routine record only (purpose: the user keeps and sees their record; no analytics, no Gemini, no join to scans).
- R-5 B: one unnamed "other product (not ours)" entry; no free text.
- R-6 A: the server writes `users/{uid}/routineEvents/{eventId}`; clients read only. Replaces DATA_MODEL's client-written `events/{autoId}` and routine.md's "allow `create`".
- D-12 clarification: a registered own-brand product name, listed with owner approval, is not by itself a claim. Usage text and all other wording stay under the word check.

**Proposed tracker rows (the lane cannot edit the tracker):**
- "Replace the synthetic CATALOGUE with owner data (R-3 A, lane step 9) before the Phase 0 deploy. The deploy is blocked while any product has `dataSource: 'synthetic'`."
- "docs/lanes/routine.md: list `docs/lanes/routine-design.md` as owned, and replace 'allow `create`' with R-6 A."
- "Purpose conflict: RECOMMENDATION_MODEL §8, DATA_MODEL (Events row), SYSTEM_MODEL C16 and DECISION_LOG B14 mark Routine, ProductUse and Adherence as LATER on purpose-limitation grounds. The tracker assigns E03 and E04 to the routine lane." This is R-1.
- "RECOMMENDATION_MODEL §3 and IMPLEMENTATION_MAP C8 name `lib/catalog.ts`. The lane uses `lib/catalog/` (a folder). The product shape also changes: `inci` is always a list, `activeConcentrationPct` becomes `active | null`, and `dataSource`, `category`, `price`, `availability`, `regions`, `usageText` and `contraindications` are new. Update the docs at merge."

## 6. Steps

Every step needs the owner's approval of this design first (README rule 3). Each step ends with `npx vitest run` green for its tests, then typecheck, then a commit. Step 1 needs no other owner decision. R-1 A is resolved, so steps 2 to 8 go ahead. Step 9 is skipped (R-3 A).

| # | Step | Ends with | Needs |
|---|---|---|---|
| 1 | Catalogue schema, synthetic sample `CATALOGUE`, template column check (E01) | `catalog-schema.test.ts` green; commit | design approval |
| 2 | Event schemas and `currentRoutine()` projection, pure (E03 model) | `routine-events.test.ts` green; commit | resolved: R-1, R-5 |
| 3 | `adherence()`, pure (E04) | `routine-adherence.test.ts` green; commit | resolved: R-1 |
| 4 | `lib/routine/copy.ts` and the D-12 wording and import-boundary test | `routine-copy.test.ts` green; commit | resolved: R-1 |
| 5 | `firestore.rules` lane section and emulator rules tests | `firestore-rules-routine.test.ts` green under `npm run test:local`; commit | **R-1, R-6** |
| 6 | `POST`/`GET /api/routine/events` | `routine-route.test.ts` green; commit | **R-1, R-6** |
| 7 | `scripts/seed-lane-routine.ts` | `npm run test:local` green; commit | **R-1** |
| 8 | `/routine` page and component; copy test extended to the UI | `routine-copy.test.ts` green, page works on the local stack; commit | **R-1, R-4** |
| 9 | Replace the synthetic catalogue with owner data from the template | `catalog-schema.test.ts` green; commit | **R-3**. **Skipped** (R-3 A: no owner data yet) |
| 10 | `routine-report.md`, full typecheck, lint and `npm run build` | all green; commit | none |

All decisions are resolved (§0).

## 7. Owner decisions

### R-1. May we store routine and usage data at all, and for what purpose?

**In plain words.** Several of our own design documents say *not* to collect routine, product-use and adherence data yet: RECOMMENDATION_MODEL §8, DATA_MODEL ("Events … LATER"), SYSTEM_MODEL C16 and DECISION_LOG B14. Their reason is that attribution is banned (D-12), so nothing would legitimately use the data. Under India's DPDP Act, personal data needs a stated purpose. Collecting data with no use is a purpose-limitation problem. The tracker's own operating rule 5 says "LATER stays LATER". The tracker, however, assigns E03 and E04 to this lane. These two positions conflict. None of them is LOCKED, so this is not a frozen-decision stop, but someone has to choose.

**Options.**
- **A. Approve, with a narrow stated purpose:** "So you can keep a record of your own routine and see it back." The record is shown only to the user. It is not used for analytics, not sent to Gemini, not joined to scans, and not used for attribution. The purpose text goes into the privacy lane's consent copy (D-16).
- **B. Build the pure code only:** steps 1 to 4 (schema, model, adherence), with no rules, route or page. Nothing is stored until a real consumer exists (for example F01 Echo context, or an "irritation reported" event).
- **C. Defer E03 and E04.** Do E01 (the catalogue schema) only.

**Decision: A** (owner, 2026-10-03). The user seeing their own record is a real, honest purpose. The design already keeps the data away from scans, Gemini and analytics, and it has no free text. If the owner is unsure, B is the safe middle: steps 2 to 4 are needed under A anyway.

**Blocks:** resolved.

### R-2. Do product recommendation cards come back? (OPEN-R1, D-09)

**In plain words.** The dashboard used to show recommended products. They were removed (commit e232b38). Whether they return is open. The routine lane does not build cards or choose products; that is E02. The catalogue schema is the same either way.

**Options.**
- **A. Cards return:** E02 builds `recommend(answers, catalog)` on this catalogue.
- **B. No cards:** the catalogue serves the routine picker only, and later Echo's product facts.

**Decision: B** (owner, 2026-10-03). Cards would need E02 (eligibility) and E05 (red flags with clinical sign-off), and neither exists yet. Showing products without that safety gate is the larger risk. Reconsider A once E02 and E05 are done. Either way, keep products out of the scan dashboard until G02 is reviewed under D-12.

**Blocks:** no step in this lane. **Does not block:** steps 1 to 10.

### R-3. Real product data (E01 master data)

**In plain words.** The lane ships a schema and a fake sample product. Real products must come from the owner. That means names, the verified Shopify handle, ingredient class, full INCI list, active ingredient and %, label warnings, who should avoid each product (pregnancy, prescription), MRP in rupees and pack size, availability, usage text, and each marketing claim with its evidence level, source and date. Claims need substantiation under the ASCI Code (RECOMMENDATION_MODEL §5).

**Options.**
- **A.** The owner fills `lib/catalog/catalogue-template.csv` (one row per product; up to 3 claims per row; add `claim_4_*` columns for more, and the test maps `claim_<n>_*` by pattern). An engineer copies it into `lib/catalog/catalogue.ts`. The schema test then checks it.
- **B.** The owner sends the data in another form, and the engineer converts it.

**Decision: A** (owner, 2026-10-03). A test keeps the template's columns and the schema matched. There is no CSV parser at runtime and no new dependency.

How to fill the template: one row per product; lists (`ingredient_classes`, `inci`, `warnings`, `contraindications`, `regions`) are separated by `;`; a cell containing a comma goes in double quotes; `shopify_handle_verified` is `yes` or `no`; an empty cell means "none" or "not known yet"; `mrp_inr` is whole rupees. Product names and usage text must not contain efficacy words (the test in §4 checks them), except a registered brand name the owner lists exactly in `PRODUCT_NAME_EXCEPTIONS`; usage text has no exception.

**Blocks:** step 9 only (skipped). **Does not block:** steps 1 to 8 and 10, which use the synthetic sample. The synthetic sample must be replaced before the final deploy (proposed tracker row, §5). Every sample product has `dataSource: "synthetic"` and "SYNTHETIC" in its name, so it cannot be mistaken for a real product.

### R-4. Confirm that D-12 applies to the routine page

**In plain words.** D-12 (LOCKED) bans saying or implying that a product caused a skin change. The README asks the owner to confirm it covers routine wording. This design goes further: the routine page shows **no skin data at all** (no scans, bands or readings) and **no product claims**, and a test enforces both.

**Options.**
- **A.** Confirm. The routine page has no skin data and no claims; the wording test applies.
- **B.** Allow skin readings on the routine page. That is a G02 feature and needs a separate D-12 review.

**Decision: A** (owner, 2026-10-03). It is the only option that cannot be read as "this product did that to your skin".

**Blocks:** step 8 (the page). **Does not block:** steps 1 to 7, 9 and 10.

### R-5. Which products can be in a routine?

**In plain words.** Users also use products from other brands, and prescriptions. Recording those would need free text, and a prescription name is health data. That is personal data with no current use (see R-1).

**Options.**
- **A. Our catalogue products only.** There is no free text.
- **B.** Catalogue products plus one generic "other product (not ours)" entry, with no name.
- **C.** Catalogue products plus free-text names.

**Decision: B** (owner, 2026-10-03). Recommendation was A for v1. It is the smallest amount of personal data. B is built as `OTHER_PRODUCT_ID` in `lib/routine/events.ts`, not as a catalogue row (§2.2). C is not built.

**Blocks:** step 2, which writes the event schema. **Does not block:** steps 1, 3, 4 and 9.

### R-6. Who writes the events: the server, or the browser under Firestore rules?

**In plain words.** The brief says the rules should "allow create", and DATA_MODEL says the client writes `events/{autoId}`, checked by the rules. This design has the **server** write `routineEvents/{eventId}` through a signed-in API route, and the rules let clients read only.

**Options.**
- **A. Server writes (recommended).** One validator (zod, the same as everywhere else). The server stamps the time. The product id is checked against the catalogue. Retries are safe through `eventId`. The rules are one line, `allow write: if false`, the same pattern as `scanAnalyses`. It matches D-26's direction (the server decides what is stored).
- **B. Client writes, rules validate** (as in the brief and DATA_MODEL). It needs no API route, but the schema must be written a second time in the rules language and kept in step with zod. The catalogue check cannot be done in rules unless the product ids are copied into `firestore.rules`. And `recordedAt` must be checked as `request.time`.

**Decision: A** (owner, 2026-10-03). It is less code, it has one source of truth for the schema, and the append-only guarantee is stronger (clients cannot write at all). The collection name `routineEvents` replaces DATA_MODEL's generic `events/` because only routine events exist. The DATA_MODEL row would be updated at merge.

**Blocks:** steps 5 and 6. Under B, step 6 is dropped and step 5 grows. **Does not block:** steps 1 to 4 and 7 to 10. The seed (step 7) writes through the Admin SDK, which bypasses the rules, so it is the same under A or B.
