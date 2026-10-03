# DECISION_LOG

This log is required by CLAUDE.md ("All architectural decisions must be documented").

Each entry gives:
- the decision
- its status: PROPOSED, NEEDS-APPROVAL or LOCKED (existing)
- the evidence behind it
- the alternatives rejected

None of these decisions has been implemented. "PROPOSED" means the investigation recommends it. "NEEDS-APPROVAL" means it touches an existing locked decision, the analysis engine, or a CLAUDE.md restriction.

## A. Decisions

**D-01 Stay on Firestore + private S3. No Postgres. (PROPOSED)**
- **Evidence:**
  - All queries are per-user.
  - About 10 KB per SkinState (measured on the fixture).
  - No cross-user joins.
  - The existing rules and tests can be reused.
- **Rejected:**
  - The research doc's PostgreSQL/Supabase event log: a second auth model and a second erasure surface.
  - The orphaned Supabase layer: it must not be revived.
- **Conflict:** PROJECT_CONTEXT.md lists "Supabase (not RDS)" as a locked decision. That decision is stale; the app migrated to Firebase (commits ef93f2e, firebase-phone-auth).

**D-02 The server writes the measurement. (PROPOSED)**
- `/api/skin-scan` writes `skinStates/{scanId}_{pipelineVersion}` via the Admin SDK, keyed by the verified uid.
- **Evidence:** today the client writes `result` and the rules don't validate it, so it can be forged (D3). The save race and the lost retry (D4, D5) also disappear when the measurement is written at scan time.
- **Rejected:**
  - Rules-based validation of a client-written result: it cannot prove the numbers came from the CV service.
  - An S3 JSON sidecar: a second consistency domain and a second erasure target, to save about 10 KB.

**D-03 Persistence must never break the live scan. (PROPOSED)**
- On a server-write failure, retry once, then return the result with `persisted:false`.
- A hash mismatch writes under a server-minted id. Never 409.
- A missing scanId is minted by the server.
- The client's legacy `result` on skinChecks stays accepted forever as the fallback.
- **Never** add a rules check that rejects `result`.
- **Evidence:**
  - Rules apply globally and instantly.
  - Old bundles do fire-and-forget saves (PhoneAuthStep.tsx:77,82-84), so a rules change would lose the whole questionnaire silently.
  - Skew Protection cannot pin Firestore SDK writes (Agent 6).

**D-03a A new server-side requirement on the scan route degrades. It never rejects. (PROPOSED)**
- **Missing processing-consent version:** the scan runs and returns the result. The SkinState write is skipped and the response says `persisted:false, reason:"consent_missing"`.
- **Missing 18+ attestation:** collected on the next visit. The chat route may hard-reject (no data is lost there), but only after the attestation UI has shipped.
- **Evidence:** cached old bundles and existing users have neither field. Rejecting them would repeat the D-03 failure at the route instead of at the rules.

**D-04 Persist the full engine output except overlays, now. (PROPOSED, P0)**
- Persist `region_raw_corrected`, `region_hist[_corrected]` and the bin edges via an allowlist.
- **Evidence:**
  - D1: nothing comparable is stored today.
  - This contradicts the locked decision "region_raw and region_hist are separate columns" and CALIBRATION.md's calibrate-from-traffic plan.
- Every scan stored without these fields is permanently unrescorable, so this is the most time-sensitive item.

**D-05 Stop displaying hydration ("Dryness") and pores. Relabel oiliness as "shine". Label every metric "photo-based estimate". (PROPOSED; frontend only)**
- **Evidence:**
  - Hydration's formula is dominated by zero-gradient pixels (each contributes 1e6), so it effectively counts flat or clipped pixels.
  - Pores are below one pixel at the 1024 px working size; zero detections.
  - Oiliness is a fraction of specular pixels.
- This is not an engine change; the engine output is untouched.
- **Rejected:** keeping "Dryness" as a relabel. It is still a hydration claim, and the research doc's own §5 says RGB cannot measure it.

**D-06 Remove the "/100" number. Word bands as within-photo distribution. Show a permanent "photos can't be compared yet" line. (NEEDS-APPROVAL)**
- This reverses the 2026-09-02 product decision to show numbers.
- **Evidence:**
  - All scores are image-relative.
  - Users screenshot "62/100" one week and "41/100" the next and read it as improvement (Agent 6, attack 5).
- The mandatory disclaimer next to the number does not neutralise that reading.

**D-07 Request `?stats=both` and persist native stats. (NEEDS-APPROVAL: latency/cost; touches the engine call contract, not the engine)**
- **Evidence:** native L*/ITA is the only realistic colour-measurement candidate. Whole-frame gray-world plus CLAHE destroys absolute colour.
- **Cost:** +43% p95, per PROJECT_CONTEXT.md.
- **Alternative:** run native stats offline on retained scored bytes (needs D-11).

**D-08 Recommendation stays plain TypeScript, a pure function plus version constants. No DMN or rules engine. (PROPOSED)**
- **Evidence:** 4 SKUs and about 6 rules (Agent 4).
- **Revisit when:** non-engineers author rules, or the catalog exceeds about 20 SKUs.

**D-09 Select products from quiz answers plus safety constraints, not from image bands. (PROPOSED; product decision OPEN-R1 on whether cards return)**
- **Evidence:** image-relative bands make the selected SKUs flip with photo contrast.
- Keeps the locked decision "LLMs never select products".

**D-10 The recommendation record is written at questionnaire save, server-side, not at scan time. (PROPOSED)**
- **Evidence:** the quiz answers that drive selection come after the photo step (Agent 6, attack 1).
- Bands are not stored. They are derived from SkinState plus a threshold table keyed by SCORING_VERSION that keeps every past version.

**D-11 Also store the scored bytes (`scored.jpg`, about 1280 px, EXIF-free) next to the original. (NEEDS-APPROVAL: storage and consent copy)**
- **Evidence:** the original cannot reproduce scores. Reasons: no EXIF transpose on the server, possible HEIC, and the mobile score was computed on the re-encode (D7).
- **Existing locked decision:** "Original unmodified image is the primary asset; processed variant NOT stored." That is right for the training dataset and wrong for exact replay. Proposal: keep the original **and** add the scored bytes.
- **Open:** strip GPS from the original? This is a separate owner/legal decision. Research doc §8 says yes; the locked decision says "EXIF intact".

**D-12 No product attribution, efficacy claims or forecasting anywhere. This covers UI, Gemini, Shopify joins and internal analytics presented to users. (LOCKED by CLAUDE.md)**
- Research-doc evidence tiers 3 ("association") and 4 (on/off tests) are **not adopted**.
- Shopify links use an opaque `recommendationId`, never `scanId`.

**D-13 Comparability is keyed on (quantity, pipelineVersion, engineBuild digest, inputVariant, captureMethod). Change output is pairwise first. (PROPOSED)**
- **Evidence:**
  - `PIPELINE_VERSION` is hand-edited and deploys are manual.
  - Users scan rarely under informative sampling.
  - The ≥10-point persistence rule is mostly unreachable.
- **Rejected:** the research doc's 4/10-point tier ladder as the primary output.

**D-14 Gemini: server-built ContextPackage, auth plus AI-share consent, and two pre-filters before generation.**
- **Status:** PROPOSED; the paid tier is a release gate.
- The two pre-filters are red-flag and comparison intent, both EN + Hinglish.
- After generation: a JSON schema with a fact-id enum, a validator (`\p{Nd}` digits, a comparative/efficacy lexicon on all claim types, non-Latin output goes to the fallback), and a templated fallback.
- **Rejected for now (LATER):**
  - the NLI post-check
  - the UserAssertion store
  - function calling
  - context caching
  - the Interactions API

**D-15 chatTurns are the only history source. Client-sent turns are ignored. 90-day TTL. (PROPOSED)**
- **Evidence:** forged `role:"echo"` turns are accepted today (route.ts:20).
- If chatTurns ever stop being read back, replace them with a text-free log.

**D-16 Consent ledger, server-written. (PROPOSED)**
- **Processing consent:** newly versioned. Its copy must cover storing measurements at scan time.
- **Retention:** written at presign time, so an abandoned flow still has a consent record (D11).
- **AI-share:** a new purpose that names Google as the processor and the cross-border transfer.

**D-17 User-level erasure route: S3, then Firestore `recursiveDelete`, then Auth. (PROPOSED; BLOCKED)**
- Blocked on IAM (PutObject-only today) and unknown bucket Object Lock / versioning.
- Immutability is a promise to clients, not a retention promise.

**D-18 Engine changes are deferred until explicit approval. (NEEDS-APPROVAL; CLAUDE.md)**
- The changes: split L/R cheeks, subtract eyebrows from the forehead, face-only gray-world, beard/fringe flag, interocular-distance covariate, return image digest.
- Returning the digest and a request id is non-scoring and could be approved separately as a small change.

**D-19 Re-confirm `female_skin_context` and `current_products` on every scan. Stop storing the phone number in answers. Server-side 18+ attestation. (PROPOSED)**
- **Evidence:** stale pregnancy and prescription answers are reused silently (D8). The 18+ check is client-only (D14).

**D-20 Remove "digital twin" from the persona and from app metadata. (PROPOSED)**
- **Evidence:** research doc §8; the FTC net-impression standard; the system is not a twin by NASEM criteria.

**D-21 Move Firestore to a named database in `asia-south1` before C2 ships, and move the Vercel function region to `bom1` in the same window. (PROPOSED)**
- Resolves PREFLIGHT_AUDIT G4.2. Full analysis, runbook and risks are in [DATA_LOCALITY_DECISION.md](DATA_LOCALITY_DECISION.md).
- **Evidence:**
  - Production holds 21 docs (7 users, 14 skinChecks, 0 scanAnalyses) and no composite indexes.
  - A Firestore location is immutable.
  - Longitudinal records are append-only, so they are cheapest to place correctly at birth.
  - ECS and S3 are already in ap-south-1.
- **Rejected:**
  - Recreating `(default)` in place: destructive, no fallback database, and its viability is unverified.
  - A new Firebase project: requires an Auth migration.
  - Staying on nam5 and disclosing it: the cost of moving grows with every scan.

**D-21 Gate 01 stores raw analysis in `users/{uid}/scanAnalyses/{scanId}_{sha16}`, not in `skinStates`. (IMPLEMENTED in 6e9081d; not deployed)**
- This gate was scoped to preservation only; SkinState semantics (comparability keys, engineBuild, requestedScanId join) are deferred to a later gate.
- `scanAnalyses` is the immutable raw substrate. A later SkinState may be derived from it or replace it, but it is never mutated.
- The record is written only when the client sends `scanId`. Old bundles get the exact previous behaviour.
- Retries of the same bytes are idempotent. A retake gets its own document, keyed by hash. A failed write never fails the scan (D-03 honoured).
- **Also in gate 01:** the scan save now blocks until it succeeds or times out after 15 s, with a retry. This replaces the old "non-fatal by design" save, so a failed save can no longer silently lose the scan.
- Details: IMPLEMENTATION_GATE_01.md.

## B. Conflicts with the research doc

| # | Research doc says | Repository reality / finding | Resolution |
|---|---|---|---|
| B1 | PostgreSQL/Supabase event log; Step Functions; EventBridge; GuardDuty ingest; Amplify | Firestore + S3 + Vercel + ECS. Supabase is orphaned. The frontend is on Vercel, not Amplify | D-01. Ingest stays a synchronous proxy. Malware scanning is LATER (images are decoded by OpenCV in an isolated container) |
| B2 | Keep the existing engine; add SEM/MDC tables | Stored scores are image-relative, so noise tables on `scores` measure nothing useful | Run the study on `raw` / native quantities (EVALUATION_PLAN §1) |
| B3 | Hydration, sebum and redness become "labelled proxies" | Hydration measures flat pixels; pores don't resolve | D-05: remove, don't relabel |
| B4 | GAGS zones: "forehead, cheeks, nose, chin" | GAGS scores each cheek separately; the engine merges them (face_mesh.py:223) | A split is proposed under D-18 |
| B5 | Ouyang 2026: smartphone redness ICC 0.15–0.24 means unreliable | That number is *validity* against VISIA. Phone a* *test–retest* ICC was 0.85. The cohort was Chinese, FST II–IV, under standardised lighting | Redness: repeatable perhaps, valid unknown. Treat it as a proxy |
| B6 | Targets of ICC ≥0.85 for pigment and ≥0.70 elsewhere, "from Ouyang" | Not in the paper; the doc derived them | Use COSMIN ≥0.70 on the lower CI bound |
| B7 | Henseler: "≥30 users" design | Henseler had n=19, wrinkles only. The 30 is the doc's own number | Keep 30 as our own power choice |
| B8 | Evidence tiers 0–4, including "association" and on/off tests | CLAUDE.md bans causal product-effect claims without approval | Tiers 3 and 4 rejected (D-12) |
| B9 | Persistence tiers at 4/10 points | Rare, informative scanning plus version churn | Pairwise first (D-13) |
| B10 | About 22 entities | 6 stored collections, plus code constants and projections | DATA_MODEL §1 |
| B11 | EXIF to sidecar, drop GPS, store crops not full frames | Locked decision: original with EXIF intact is the dataset's primary asset | D-11, open for the owner |
| B12 | Gemini: Interactions API, store=false, gemini-3.8-flash | `generateContent` and 3.6-flash (valid, stable) | Keep `generateContent`; pin the model explicitly. Moving to 3.8 is optional |
| B13 | Rules as DMN / json-rules-engine decision tables | 4 SKUs | D-08 |
| B14 | Routine, RoutineEvent, ProductUseEvent, AdherenceSummary as CORE | No legitimate consumer of this data, since attribution is banned | LATER |
| B15 | Weekly scheduled anchor scans | OPTIONAL. Useful only once a comparable quantity exists | LATER |
| B16 | Citations marked "(unverified)" in the doc: Koo & Li, mMASI MCID, TrueImage, and the Perla LR+ figures | Not verified by this team either | Do not rely on them |

## C. Stale internal docs and comments (fix when touched; this investigation changed none of them)

- **PROJECT_CONTEXT.md:** Supabase, Amplify, Echo deferred, `/echo` has no nav entry.
- **DEPLOYMENT.md:** the Amplify sections and the Gemini default.
- **AUDIT.md:** "IaC not in repo", "no Secrets Manager".
- **skin-scan:** `docs/deployment.md:34`, `infra/terraform/README.md:10`, CV_AUDIT.md, `docs/background-jobs.md`.
- **Code comments:**
  - lib/skin-check-rules.ts:55 ("region_hist stored on every scan")
  - lib/firebase/skin-checks.ts:24-26 ("raw stats dominate size": they total about 5.6 KB)
  - types/skin-scan.ts:78 (the fixture version)
  - chat route.ts:17 ("unauthenticated by design")
  - gemini.ts:78 and .env.example:15-16 ("2.5 Flash")

## D. Housekeeping

- `.gitignore` contains `*.md`, deliberately (commit e99dac0). **Every file in `docs/architecture/` is untracked.** That conflicts with CLAUDE.md's "All architectural decisions must be documented" if documented is meant to imply versioned. Owner decision: add `!docs/architecture/*.md`, or keep the docs local. This investigation did not change `.gitignore`.
- The task brief cites `docs/research/longitudinal-skin-platform.md`. The actual file is `docs/Longitudinal skin platform architecture.md`.
