# Project context — The Project Skin / skin-check

Founder, D2C skincare brand in India (Shopify store live). Building a facial
skin assessment funnel. THE REAL GOAL: collect a labelled dataset of Indian
faces for acne / hyperpigmentation / wrinkles, to train a proprietary model.
Public datasets were tried and rejected; vision engineers confirmed Indian skin
needs its own model. The heuristic CV pipeline shipping now is a CAPTURE FUNNEL
with rough triage attached, not a measurement product. I have dermatologist
relationships and can hire annotators once data exists.

## Two repos

**skin-check (frontend)** — Next.js 14 App Router, working dir `skin-check`
(originally extracted from an older messy repo into `_extract`, since
renamed). Quiz → camera → quality gate → CV service → local scoring →
results. GitHub remote: `Divit-aggarwal/skin-check` (private). No
persistence — `lib/skin-check-session-context.tsx` is in-memory and dies on
refresh.

**skin-scan (CV service)** — FastAPI + MediaPipe + OpenCV, branch
`prod-hardening`. `mediapipe==0.10.21` EXACT (0.10.35+ deleted `mp.solutions`
entirely; no upgrade path except migrating to `mediapipe.tasks`, documented in
`version.py`). amd64 Dockerfile, module-scope FaceMesh with threading lock,
`run_in_threadpool`, `X-Scan-Secret` auth, 8MB body cap, opt-in overlays.

## Current verified state

Both services wired and round-tripping locally. Getting here burned most of a
day on stale Docker artifacts, so treat the following as verified, not assumed:

- `skin-scan:0.1.2` on :8000. `PIPELINE_VERSION = "scan-0.1.2-provisional"`
  (bumped from 0.1.1 after the opencv pin fix below — no formula changed,
  but pre-0.1.2 rows' opencv provenance is unknown, not "4.8.1.78" as
  requirements.txt implied). Response has 11 top-level keys. Auth enforced.
  16/16 pytest pass (previously logged here as 15/15 — stale; the suite has
  always had 16 tests, this was a miscount, not a regression).
- opencv pin was silently defeated the whole time: mediapipe's unpinned
  `opencv-contrib-python` dependency overwrote the exact
  `opencv-python-headless==4.8.1.78` pin on disk, and `pip list` never showed
  it. Fixed: `opencv-python-headless` removed, `opencv-contrib-python==4.11.0.86`
  pinned instead (the build that was actually running), plus a startup check
  in `main.py` that raises when `ENV=production` if `cv2.__version__` doesn't
  match, and `cv2_version` added to `/health`.
- Frontend build green, parses the full payload including `region_raw` /
  `region_hist` / `region_hist_bin_edges` / `pipeline_version`.
- `0001_init.sql` applied to local Supabase (`supabase db reset`), including
  a CHECK constraint tying `region_hist` bin-array lengths to
  `region_hist_bin_edges` — verified to reject `'null'::jsonb`/`'{}'::jsonb`
  edges and accept a real scan-response.json row.
- `PhotoCapture.tsx` now captures a real original: native `<input capture>`
  file on mobile (verbatim File → `original_path`, downscaled via
  `createImageBitmap(file, {imageOrientation: "from-image"})` for the CV
  call), `getUserMedia`+canvas on desktop (same blob for both). Not yet
  uploaded anywhere — Step 5.

### Landed recently — do not redo

- **Zod was silently stripping** `region_raw` / `region_hist` /
  `region_hist_bin_edges` / `pipeline_version` via `z.object()`'s default
  key-stripping. Fixed, plus `.passthrough()`, plus a raw-vs-parsed key diff
  logged on every scan so future drift is loud. The schema is strict ON
  PURPOSE — if it rejects a payload, fix the payload or widen the schema
  deliberately. Never loosen to `z.any()`.
- Proxy route: auth header, 30s AbortController timeout, `error_code`-based
  failure mapping (`NO_FACE_DETECTED` / `IMAGE_UNPARSEABLE` /
  `IMAGE_TOO_LARGE` / `AUTH_FAILED` / `SCAN_ERROR` / `INTERNAL_ERROR`).
- CV service: fail-closed auth when `ENV=production`, CORS allowlist replacing
  `["*"]`, 400 on unparseable uploads, and additive clip counters
  (`lab_a_hist_clip` / `color_var_hist_clip`: `underflow`, `overflow`, `min`,
  `max`, computed on the PRE-clip array).

## The findings that shaped everything

**Self-normalisation.** Every metric normalized against its OWN image's
min/max, so a min-max array always spans [0,1] regardless of severity — the
signal was divided out before the score existed. Two different faces scored
nearly identically. Found surviving in percentile thresholds (`blemishes.py`,
~30%/40% of pixels pass BY CONSTRUCTION) and `cv2.THRESH_OTSU` (`pores.py`,
`blemishes.py` — image-adaptive, invisible to a min/max/percentile grep). Fixed
by storing fixed-edge histograms so absolute thresholds can be applied
RETROACTIVELY to already-collected scans.

**Clip-then-bin.** Histograms `np.clip()` before `np.histogram()`, so
out-of-range pixels pile into edge bins rather than being dropped. Counts sum
correctly; tail shape is destroyed. Verified empirically: every region's
histogram sum equals `region_px` exactly. This made out-of-range scans
"detectable but not recoverable" — fixed additively with the clip counters
above. Edges were derived from only 3 photos, so real traffic WILL exceed them.

**Gray-world hypothesis, TESTED AND DISPROVEN.** L* and b* are near-identical
corrected vs native (L* -16.0 vs -17.0, b* 5.0 vs 5.0). a* is the hemoglobin
axis, not the melanin axis, so it was never the right channel to test tone
separation on. Dual path retained as opt-in (`?stats=both`, +43% p95) plus
`scripts/extract_native_stats.py` for offline use.

Measured ranges from 3 real phone photos: corrected a* [-10,20], native a*
[-5,35], color_var corrected [0,100], native [0,30].

## Locked decisions — do not relitigate without new evidence

- **Supabase (not RDS)** for Postgres. Amplify SSR → RDS needs a VPC-attached
  Lambda, which loses internet egress, which needs a NAT Gateway at ~$33/mo.
  Nothing uses Supabase-specific features except signed uploads.
- **App Runner** for the CV service. No VPC connector, no NAT.
- **Amplify Hosting** for the frontend, ap-south-1. `vercel.json` deleted.
- **Echo/chat DEFERRED from v1** — removes Gemini entirely from the launch
  path. `chat_messages` exists in the schema, empty. When it ships: plain LLM
  calls, NOT RAG. The corpus is four SKUs plus one user's own rows joined by
  `session_id` — a `SELECT`, not a search problem.
- **Results shown as BANDS** (Low/Moderate/Elevated), never numbers. The
  metrics are heuristics; a two-digit score next to a face is fabricated
  precision and reads as a clinical claim.
  **SUPERSEDED 2026-09-02**: product decided to show the numeric score
  alongside the band after all (e.g. "72/100"), with a mandatory disclaimer
  next to it ("Scores are image-relative signals from this scan, not
  clinically calibrated measurements") so the number is never presented
  unqualified. The underlying reasoning above (per-image-normalized, not
  comparable across users or repeat scans — see lib/skin-check-rules.ts and
  CALIBRATION.md) still holds and is why the disclaimer is mandatory, not
  optional copy. See components/skin-check/SkinCheckDashboard.tsx.
- **ITA degrees** (computed from LAB) for skin tone, NOT Fitzpatrick —
  Fitzpatrick compresses most Indian users into IV-V.
- **SKU selection is a deterministic pure function with a stored `rule_trace`.**
  LLMs never select products, only narrate. Conservative thresholds while
  scoring is provisional; sunscreen as always-on baseline.
- **Original unmodified image** (full-res, EXIF intact) is the primary asset.
  Processed variant NOT stored — regenerable from original given
  `pipeline_version`. Upload sequencing: small 1280px file blocks the results
  flow, original uploads in the background with retry.
- **Two separate consent checkboxes** (processing / training retention),
  versioned. Cannot be retrofitted. Training retention is separately revocable;
  processing consent is not (the processing already happened).
- **`pipeline_version` and `scoring_version` are SEPARATE non-nullable
  columns**, so recalibration recomputes history instead of requiring
  re-photography. `scoring_version` has no server-side source — the CV service
  has no such concept. The frontend rule engine mints it.
- **`region_raw` and `region_hist` are separate columns and bin edges live in
  the payload**, not just in code.
- **Store the `_corrected` variants, never the unversioned aliases.**
  `compose.py:245-249` aliases `region_raw` → `region_raw_corrected` today, but
  the alias means "whatever the default stats path is." The day that default
  changes, every historical row silently changes meaning. A `stats_path` column
  records which path produced the stored numbers.
- **Server-side age enforcement**, not just the client-side dropdown.

## Plan from here

1. Apply `0001_init.sql` to local Supabase (`supabase db reset`, not
   `db push` — reset replays every migration against an empty DB).
2. Rule engine — pure function, stored `rule_trace`. Get the trace right:
   every rule that fired, in order, with the inputs it saw. Echo later narrates
   this trace; it does not re-derive it.
3. Bands display + ITA.
4. Consent + self-report + dual upload + server-backed session.
5. Provision + Amplify + subdomain.
6. Shopify App Proxy + order webhook + 42-day return-scan reminder.

## Open, low cost, worth closing

- **`region_hist_bin_edges` NOT NULL doesn't buy the property.** It's `jsonb`,
  and `'null'::jsonb` and `'{}'::jsonb` both satisfy NOT NULL while being
  unrescorable. Needs a CHECK tying edge-array length to bin-array length per
  histogram per region, skipping the `_clip` siblings.
- **`lab_a_hist_clip` has never been tested against out-of-range input.** The
  existing test uses a grayscale image, which doesn't move a*. The one real
  observation showed `min` landing exactly on the low edge (-10) with
  `underflow` 0 — either coincidence or `min` computed post-clip. A colour test
  image settles it (saturated red drives a* past +20, green past -10).
- **Overlays render nothing.** Nothing appends `?overlays=` upstream, so the
  7-tile heatmap grid is empty and EchoTwin's category tabs are interactive but
  inert. All 7 overlays cost 1.11MB (texture/pigment/hydration are 826KB of
  it). Decide: request 1-2 on demand, or cut from v1.
  **RESOLVED 2026-09-02**: decided "request on demand" — `PhotoCapture.tsx`
  requests the user's stated `primary_concern` overlay at capture time
  (usually not yet known, since skin-photo is section 2 and primary_concern
  is section 3), and `SkinCheckDashboard.tsx`'s effect fires one on-demand
  follow-up overlay fetch once `resolveFocus` (stated concern, else the
  highest-banded metric) is actually known — same photo blob, one more
  `/scan?overlays=` call. Verified end-to-end against the live `skin-scan`
  container: the ORIGINAL/[category] toggle renders and the second
  `/api/skin-scan` request is visible in the network log. Not the 7-tile
  grid — a single two-way toggle, matching the "cut from v1" 1.11MB-avoidance
  half of the original decision.
- **`/echo` currently has no in-app navigation entry.** The route exists and
  builds/renders correctly, but nothing in the current UI links to it (checked
  via a full-repo search for `href`/`Link`/`router.push` referencing `echo`).
  Consistent with Echo/chat being deferred from v1 (see Locked decisions above)
  — this is intentional, not dead code, and should not be deleted or flagged as
  unused in a future cleanup pass.
- Both trees dirty. **Correction**: skin-check *does* have a remote
  (`origin` → `github.com/Divit-aggarwal/skin-check.git`) — this line was
  stale as of a later check (`git remote -v` / `git branch -vv` confirm it
  directly); local `master` is currently ahead of `origin/master`, not
  remote-less.

## Known, deliberately deferred

- `pores` returns exactly 0.0 across all regions on real photos, and
  `computeCompositeScore` inverts that to a perfect 1.0 health contribution —
  a broken metric currently inflates the composite.
- `pore_density` and `pore_density_per_kpx` are the same value under two names
  (`pores.py:81`).
- `CALIBRATION.md` claims 9.7s; measured 2.2s warm under emulation. Provenance
  of the 9.7s figure unknown.
- Dashboard renders `Math.round(scores[key] * 100)`, contradicting
  bands-not-numbers. Belongs in the bands work.

## External dependency — not mine to do

The **dermatologist grading rubric**: four severity levels per condition,
written criteria, reference images. It gates every label that will ever be
collected. Needs someone else's calendar. Nothing blocks it and nothing
downstream can start without it.

## Docs in the repo

`CLAUDE.md` (target architecture — currently describes Supabase persistence,
rule traces, and a chat layer that don't exist yet; needs a "current state vs
target" marker at the top or every session reads the mismatch as a bug),
`BUILD_PLAN.md` (8 phases), `DATA_ARCHITECTURE.md` (dataset collection design,
supersedes BUILD_PLAN §1.2 and §2.2).

## How to work with me

Be direct, disagree when you think I'm wrong, no flattery. I push back when
planning outruns shipping — that's usually correct, take it seriously.

Ground claims in the actual code. In this project, diagnoses based on reading
files held up; ones inferred from summaries or reported numbers did not (the
gray-world hypothesis was wrong, and a "no histogram bin above 40%" criterion
was a bad test I invented). When you propose a verification, make sure it tests
the thing you actually care about — "confirm the column is NOT NULL" and
"confirm the stored scan is rescorable" are not the same check. Say when you're
uncertain rather than sounding confident.

Check what's actually running before diagnosing why it's broken. Three
debugging cycles in one day traced to stale Docker containers and cached
builds, not to the code being wrong.
