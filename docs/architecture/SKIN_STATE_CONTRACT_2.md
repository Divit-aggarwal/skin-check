# SKIN_STATE_CONTRACT_2: contract version `skinstate-2`

Status: **DRAFT for owner sign-off.** The version itself is approved (owner, 2026-10-04: "A new SkinState contract version is approved, next to skinstate-1. skinstate-1 keeps working unchanged."). The text below still needs the owner's sign-off. Tracker A20; decisions D-23, D-26, TD-05, TD-06.

Code: `lib/skin-state-2.ts`. Tests: `tests/skin-state-2.test.ts`, `tests/comparability-2.test.ts`.

## 1. What changes from skinstate-1

skinstate-2 is a pure, computed view over the **same** server-written `users/{uid}/scanAnalyses/{id}` record. It is never stored. It reads the record through the frozen skinstate-1 reader (`toSkinState`), so every skinstate-1 rule still holds: path-based trust, refusal of forged or invalid records, no proxies, uncertainty `unknown`, and legacy readings never upgraded.

Only three things differ:

| Field | skinstate-1 | skinstate-2 |
|---|---|---|
| `contractVersion` | `"skinstate-1"` | `"skinstate-2"` |
| `engine.build` | always `null` (§7.1, C12) | record `engine_build` when it is a non-empty string, else `null`. The CV service returns it from engine 0.1.6 (A10), and the route stores it unchanged. It is never inferred, and never derived from deploy history |
| `clientAsserted` | not present | a fixed declaration of the fields a browser sets (§2) |

Everything else maps exactly as in SKIN_STATE_CONTRACT_FINAL.md, including:
- `provenance.processingConsentVersion: null`. The route checks the consent version before it writes, but does not store it on the record (C4).
- The `quality` block, with all its nulls.

A legacy `skinChecks` reading gives the same `legacy_display` object as skinstate-1. An invalid record gives the same reasons.

## 2. Client-asserted fields (TD-05, D-26)

The browser sends these fields with the photo. The route validates their shape, but cannot prove their truth.

| Field | In skinstate-2 | Used for | Bound |
|---|---|---|---|
| `input.captureMethod` | mapped (as in skinstate-1) | the comparability key | An honest value can only split pairs. A forged value can only merge the native and canvas capture paths. Every other key part, and the validated-quantity table, still apply (owner O-1 A) |
| `provenance.persistAttempt` | mapped (as in skinstate-1) | provenance only | Never in the comparability key. A forged value only mislabels which CV run wrote the record |
| `captureQuality` | **not mapped** | nothing in SkinState | Stored on the record for provenance only. Never copied into `quality`, and never feeds comparability (TD-06 Q-2). Server-side quality comes only from a separately versioned producer (C08) |

## 3. Comparability key under skinstate-2

The key parts are the same as in skinstate-1: (fieldPath, pipelineVersion, engine.build, colourPath, input.variant, input.captureMethod), plus region status and low pixel count (`lib/comparability.ts`).

Under skinstate-2, `engine.build` is real for records from engine 0.1.6 onward:
- Two states with the same build can match on the build.
- Two different builds give `engine_build_differs`.
- A missing build gives `engine_build_unknown`.

A skinstate-1 state and a skinstate-2 state are never compared (`contract_version_differs`). Every pair is still `quantity_not_validated` until C05–C07 fill `COMPARABLE_QUANTITIES`.

## 4. Coexistence

- `lib/skin-state.ts`, `lib/skin-state-loader.ts` and their tests are byte-identical.
- Both versions read every stored record. Neither writes anything.
- A consumer picks one version and uses it for a whole series.

## 5. Not in this version

- `engine.build` derived from ECS deploy history for older records (contract §7.1 allows this as DERIVED provenance; it is not built).
- `processingConsentVersion` (needs the route to store it; this is a request to main).
- Any `quality` field from the client.
