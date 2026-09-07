-- 0001_init.sql — The Project Skin / skin-check
--
-- Design notes that are not obvious from the DDL:
--
-- 1. The CV payload lands in JSONB, not normalised columns. region_raw carries
--    18 stat names today and that set is versioned by pipeline_version — a
--    column per stat means a migration every time the pipeline gains a metric,
--    and NULLs that can't be distinguished from "this version didn't measure
--    that." pipeline_version + JSONB keeps old rows honest.
--
-- 2. Everything CV-derived is copied from the *_corrected variants, never the
--    unversioned aliases. compose.py aliases region_raw -> region_raw_corrected
--    today, but the alias means "whatever the default stats path is," and the
--    day that default changes, every historical row silently changes meaning.
--    stats_path records which path the stored numbers actually came from.
--
-- 3. scoring_version is ours, not the service's. The CV service has no such
--    concept (confirmed: zero hits repo-wide). It versions the frontend rule
--    engine's normalisation so a recalibration recomputes history instead of
--    requiring re-photography.
--
-- 4. Both consents are captured at scan time with the version of the text that
--    was shown. Training retention is separately revocable; processing consent
--    is not, because the processing already happened.
--
-- 5. This file was rewritten in place (not superseded by a 0002) to add the
--    auth.users-rooted identity layer (profiles / user_id / consent_events /
--    scan_scores / scan_regions / scan_model_runs). Safe to do because, as of
--    this rewrite, the remote project has never had any migration applied
--    (`list_migrations` returns []) and the only prior application was a local
--    `supabase db reset`, which replays every migration against an empty DB —
--    there is no applied history anywhere to contradict. Region/score-type
--    columns below are `text`, not a Postgres enum: types/skin-scan.ts
--    deliberately keeps these forward-compatible (the pipeline's region set
--    has changed before), and a closed enum would fight that.
--
-- 6. Scan lifecycle (CREATED/PROCESSING/COMPLETED/FAILED) is NOT a column on
--    `scans`. Today's flow is synchronous — a `scans` row is only ever written
--    once CV results exist, so every row is implicitly "completed" and the
--    NOT NULL score columns would be meaningless for a pending state. The
--    async-ready lifecycle lives on `scan_model_runs.status` instead, which
--    can have a pending/running row before `scans` exists. This keeps the
--    well-tested NOT NULL/CHECK shape of `scans` untouched while still giving
--    future async processing somewhere to record state.

create extension if not exists "pgcrypto";
create extension if not exists "moddatetime";

-- ---------------------------------------------------------------------------
-- profiles — one per Supabase Auth user; the identity root for everything
-- else. auth.users is canonical; this only carries application-level fields.
-- ---------------------------------------------------------------------------

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function moddatetime (updated_at);

-- Auto-provisioned on signup so no client-side INSERT policy is ever needed
-- on profiles — the only way a row gets created is this trigger.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- sessions — one per completed run through /skin-check
-- ---------------------------------------------------------------------------

create table sessions (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  -- Server-side age enforcement. The client dropdown is a UX affordance; this
  -- is the gate. Set the threshold to whatever your policy actually is and
  -- enforce it in the route handler as well — a CHECK only stops bad writes,
  -- it doesn't stop a minor from reaching the camera step.
  age_years           smallint not null check (age_years between 13 and 120),

  -- Quiz / self-report answers, kept whole rather than exploded into columns:
  -- the question set will change and old rows must stay readable.
  answers             jsonb not null default '{}'::jsonb,
  answers_version     text not null,

  -- Set once the results screen is reached; used for the 42-day return prompt.
  email               text,
  email_captured_at   timestamptz,

  user_agent          text,
  ip_country          text
);

create index sessions_created_at_idx on sessions (created_at desc);
create index sessions_email_idx on sessions (email) where email is not null;

-- ---------------------------------------------------------------------------
-- scan_hist_edges_valid — region_hist / region_hist_bin_edges consistency
-- ---------------------------------------------------------------------------
--
-- NOT NULL on region_hist_bin_edges only guarantees the column isn't SQL
-- NULL; 'null'::jsonb and '{}'::jsonb both pass it while leaving every
-- histogram unrescorable. This checks the property that actually matters:
-- every bin-array histogram in region_hist (region -> metric -> [bins]) has
-- a same-length-plus-one edge array in region_hist_bin_edges.
--
-- region_hist_bin_edges is NOT nested by region — confirmed against
-- scan-response.json, it's a single metric -> [edges] map shared across all
-- regions, unlike region_hist which is region -> metric -> [bins]. Do not
-- "fix" the lookup below to index by region; that would break it.
--
-- The *_clip siblings (lab_a_hist_clip, color_var_hist_clip) are objects,
-- not bin arrays, and are skipped by suffix. Metric names are never
-- hardcoded so a third histogram (e.g. a future lbp_hist) is covered
-- automatically as long as it follows the same bin-array / edges-array shape.
create or replace function scan_hist_edges_valid(p_region_hist jsonb, p_bin_edges jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  region_key      text;
  region_val      jsonb;
  hist_key        text;
  hist_val        jsonb;
  edges_val       jsonb;
  region_count    int := 0;
  hist_count      int;
begin
  if p_region_hist is null or jsonb_typeof(p_region_hist) is distinct from 'object' then
    return false;
  end if;

  -- '{}'::jsonb is a valid object with zero keys — the loop below would
  -- iterate zero times and vacuously return true. An empty region_hist is
  -- exactly the unrescorable case this constraint exists to reject.
  if p_region_hist = '{}'::jsonb then
    return false;
  end if;

  if p_bin_edges is null or jsonb_typeof(p_bin_edges) is distinct from 'object' then
    return false;
  end if;

  for region_key in select jsonb_object_keys(p_region_hist)
  loop
    region_count := region_count + 1;
    region_val := p_region_hist -> region_key;

    if jsonb_typeof(region_val) is distinct from 'object' then
      return false;
    end if;

    hist_count := 0;

    for hist_key in select jsonb_object_keys(region_val)
    loop
      -- *_clip siblings are stat objects (underflow/overflow/min/max), not
      -- bin arrays — they have no corresponding entry in region_hist_bin_edges.
      if right(hist_key, 5) = '_clip' then
        continue;
      end if;

      hist_val := region_val -> hist_key;

      -- A bin-array metric that isn't actually an array is not a shape this
      -- schema recognizes. Reject rather than silently skip it — silently
      -- skipping unrescorable data is the exact failure this exists to catch.
      if jsonb_typeof(hist_val) is distinct from 'array' then
        return false;
      end if;

      edges_val := p_bin_edges -> hist_key;

      if edges_val is null or jsonb_typeof(edges_val) is distinct from 'array' then
        return false;
      end if;

      if jsonb_array_length(edges_val) <> jsonb_array_length(hist_val) + 1 then
        return false;
      end if;

      hist_count := hist_count + 1;
    end loop;

    -- A region with no bin-array histograms at all (e.g. {} or all-_clip)
    -- is the same vacuous-truth hole one level down.
    if hist_count = 0 then
      return false;
    end if;
  end loop;

  return region_count > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- scans — one per successful CV analysis. The central longitudinal entity.
-- ---------------------------------------------------------------------------

create table scans (
  id                        uuid primary key default gen_random_uuid(),
  session_id                uuid not null references sessions (id) on delete cascade,

  -- Nullable: today's flow is anonymous (no auth wired up yet — see
  -- PROJECT_CONTEXT.md). Populated once a scan is taken by a signed-in user;
  -- becomes the attribution path required for a longitudinal timeline.
  -- ON DELETE SET NULL, not CASCADE: losing the account shouldn't destroy the
  -- scan history row itself (see training_eligible / analytics), only its
  -- link to the now-deleted identity.
  user_id                   uuid references profiles (id) on delete set null,

  -- Three distinct timestamps, deliberately not collapsed into one:
  --   captured_at  — when the photo was actually taken
  --   created_at   — when this database row was written
  --   processed_at — when CV processing completed
  -- Today's flow is synchronous so all three land within the same request;
  -- defaults reflect that without forcing future async rows to lie.
  created_at                timestamptz not null default now(),
  captured_at               timestamptz not null default now(),
  processed_at              timestamptz default now(),

  -- Versioning. Separate and both required. pipeline_version comes from the
  -- service; scoring_version is minted by the rule engine.
  pipeline_version          text not null,
  scoring_version           text not null,

  -- Which statistics path produced the numbers below: 'corrected' | 'native'.
  -- Never rely on the unversioned region_raw / region_hist aliases to imply it.
  stats_path                text not null default 'corrected'
                              check (stats_path in ('corrected', 'native')),

  -- Straight from the service. scores and region_scores are the 7 category
  -- values in [0,1]; region_raw is region -> stat -> number; region_hist is
  -- region -> {lab_a_hist, color_var_hist, lab_a_hist_clip, color_var_hist_clip}.
  scores                    jsonb not null,
  region_scores             jsonb not null,
  region_raw                jsonb not null,
  region_hist               jsonb not null,

  -- Bin edges travel WITH the scan, not in application code. A future range
  -- change must not silently reinterpret rows written under the old edges.
  region_hist_bin_edges     jsonb not null,

  -- Denormalised from region_hist's *_clip siblings at write time so training
  -- selection can filter without digging through JSONB. True when any region
  -- had pixels outside the fixed histogram edges — those scans have a
  -- destroyed tail shape and are second-class for recalibration work.
  -- NULL means the scan predates the clip counters (pipeline < 0.1.1), which
  -- is NOT the same as false.
  has_clipped_pixels        boolean,
  clipped_pixel_count       integer,

  -- Our derived output. ITA in degrees, not Fitzpatrick.
  ita_degrees               numeric(6,2),
  ita_band                  text,

  -- Bands are what the user sees; the underlying values stay here for
  -- recalibration. Shape: {"redness": "moderate", ...}.
  bands                     jsonb not null,

  -- Capture conditions, for stratified sampling later and for diagnosing
  -- whether a bad scan was a bad photo.
  capture_state             jsonb not null default '{}'::jsonb,

  -- Consent, captured at scan time with the version of the text shown. This
  -- is the immutable per-scan snapshot: "what applied to THIS scan." See
  -- consent_events below for the separate user-level consent history.
  consent_processing        boolean not null,
  consent_processing_version text not null,
  consent_training          boolean not null,
  consent_training_version  text not null,

  -- Withdrawal of training retention. Processing consent is not revocable —
  -- the processing already happened; deletion is handled by deleting the row.
  consent_training_revoked_at timestamptz,

  constraint scans_processing_consent_required
    check (consent_processing = true),

  constraint scans_region_hist_edges_valid
    check (scan_hist_edges_valid(region_hist, region_hist_bin_edges))
);

create index scans_session_id_idx on scans (session_id);
create index scans_created_at_idx on scans (created_at desc);
create index scans_pipeline_version_idx on scans (pipeline_version);
create index scans_training_idx on scans (consent_training, consent_training_revoked_at);
-- The primary longitudinal query: a user's scans ordered by capture time.
create index scans_user_captured_idx on scans (user_id, captured_at desc) where user_id is not null;

-- ---------------------------------------------------------------------------
-- scan_scores — long-form composite scores, for cross-scan trend queries
-- ---------------------------------------------------------------------------
--
-- scans.scores (jsonb) remains the full-fidelity copy of the service
-- response. This table is the queryable analytical surface derived from it
-- ("how did redness change over time?"), not a replacement — do not drop
-- scans.scores in favour of this.

create table scan_scores (
  id          uuid primary key default gen_random_uuid(),
  scan_id     uuid not null references scans (id) on delete cascade,
  score_type  text not null,
  value       numeric(6,4) not null,
  created_at  timestamptz not null default now(),

  unique (scan_id, score_type)
);

create index scan_scores_score_type_idx on scan_scores (score_type);

-- ---------------------------------------------------------------------------
-- scan_regions — long-form per-region score breakdown
-- ---------------------------------------------------------------------------
--
-- Mirrors scans.region_scores in queryable form. region_raw / region_hist
-- (18+ version-dependent stat names, histograms) stay JSONB-only on `scans` —
-- normalising those further is the over-normalisation the brief warns against.

create table scan_regions (
  id          uuid primary key default gen_random_uuid(),
  scan_id     uuid not null references scans (id) on delete cascade,
  region      text not null,
  score_type  text not null,
  value       numeric(6,4) not null,
  created_at  timestamptz not null default now(),

  unique (scan_id, region, score_type)
);

create index scan_regions_region_score_idx on scan_regions (region, score_type);

-- ---------------------------------------------------------------------------
-- scan_model_runs — provenance log + the async-ready processing lifecycle
-- ---------------------------------------------------------------------------
--
-- Append-only. A scan may accumulate more than one run over time (e.g. a
-- scoring_version recalibration re-run against the same stored raw stats,
-- with no new photo) — historical runs are never overwritten. This is also
-- where CREATED/PROCESSING/COMPLETED/FAILED status lives for a future async
-- pipeline; `scans` itself stays a completed-result record as it is today.

create table scan_model_runs (
  id                uuid primary key default gen_random_uuid(),
  scan_id           uuid not null references scans (id) on delete cascade,

  run_type          text not null check (run_type in ('cv_pipeline', 'scoring')),
  pipeline_version  text,
  scoring_version   text,
  model_identifier  text,

  status            text not null default 'completed'
                      check (status in ('created', 'processing', 'completed', 'failed', 'cancelled')),
  error             text,

  started_at        timestamptz not null default now(),
  completed_at      timestamptz,

  metadata          jsonb not null default '{}'::jsonb
);

create index scan_model_runs_scan_id_idx on scan_model_runs (scan_id);

-- ---------------------------------------------------------------------------
-- scan_images — the actual training asset
-- ---------------------------------------------------------------------------
--
-- Two uploads per scan. The 1280px variant blocks the results flow; the
-- original uploads in the background with retry, so original_path is nullable
-- and original_status tracks whether it ever landed. Processed variants are
-- NOT stored — they are regenerable from the original given pipeline_version.
-- Overlays are computed on demand (see commit "single on-demand overlay") and
-- likewise are not persisted here — kept as the existing preview/original
-- column pair rather than generalised into a polymorphic image-type table,
-- since the cardinality (exactly 2 stored kinds per scan) is fixed and small.

create table scan_images (
  id                  uuid primary key default gen_random_uuid(),
  scan_id             uuid not null references scans (id) on delete cascade,
  created_at          timestamptz not null default now(),

  -- Supabase Storage object paths, not URLs. Signed on read.
  preview_path        text not null,
  preview_bytes       integer,

  original_path       text,
  original_bytes      integer,
  original_status     text not null default 'pending'
                        check (original_status in ('pending', 'uploaded', 'failed', 'abandoned')),
  original_uploaded_at timestamptz,
  original_attempts   smallint not null default 0,

  -- SHA-256 of the original. Deduplication, and proof that a training run's
  -- manifest referenced the bytes it thinks it did.
  original_sha256     text,

  unique (scan_id)
);

create index scan_images_original_status_idx on scan_images (original_status)
  where original_status <> 'uploaded';

-- ---------------------------------------------------------------------------
-- recommendations — deterministic SKU selection
-- ---------------------------------------------------------------------------
--
-- The rule engine is a pure function and its trace is stored. An LLM never
-- selects a product; if one ever narrates the result, it reads from here.

create table recommendations (
  id                  uuid primary key default gen_random_uuid(),
  scan_id             uuid not null references scans (id) on delete cascade,
  created_at          timestamptz not null default now(),

  rule_engine_version text not null,
  skus                text[] not null,

  -- Every rule that fired, in order, with the inputs it saw. This is what
  -- makes a recommendation explainable six months later.
  rule_trace          jsonb not null,

  unique (scan_id, rule_engine_version)
);

create index recommendations_scan_id_idx on recommendations (scan_id);

-- ---------------------------------------------------------------------------
-- shopify_orders — populated by the orders/create webhook
-- ---------------------------------------------------------------------------
--
-- The paired-data loop: scan #1 -> recommendation -> purchase -> 6 weeks ->
-- scan #2. This table is the "purchase" link and has to exist before the first
-- cohort, or that cohort is never asked to come back.

create table shopify_orders (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references sessions (id) on delete set null,
  created_at          timestamptz not null default now(),

  shopify_order_id    text not null unique,
  shopify_customer_id text,
  email               text,
  line_item_skus      text[] not null default '{}',
  total_price         numeric(10,2),
  currency            text,

  raw_payload         jsonb not null
);

create index shopify_orders_session_id_idx on shopify_orders (session_id);
create index shopify_orders_email_idx on shopify_orders (email) where email is not null;

-- ---------------------------------------------------------------------------
-- return_reminders — the 42-day scheduled prompt
-- ---------------------------------------------------------------------------

create table return_reminders (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references sessions (id) on delete cascade,
  scan_id             uuid not null references scans (id) on delete cascade,
  created_at          timestamptz not null default now(),

  due_at              timestamptz not null,
  sent_at             timestamptz,
  status              text not null default 'scheduled'
                        check (status in ('scheduled', 'sent', 'failed', 'cancelled')),
  follow_up_scan_id   uuid references scans (id) on delete set null,

  unique (scan_id)
);

create index return_reminders_due_idx on return_reminders (due_at)
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- annotations — human labels. Blocked on the dermatologist rubric.
-- ---------------------------------------------------------------------------
--
-- Created empty. Nothing writes here until the rubric exists and rubric_version
-- has a real value — an ambiguous rubric produces inconsistent labels, and
-- inconsistent labels cap model performance at a level no architecture fixes.

create table annotations (
  id                  uuid primary key default gen_random_uuid(),
  scan_id             uuid not null references scans (id) on delete cascade,
  created_at          timestamptz not null default now(),

  annotator_id        text not null,
  rubric_version      text not null,

  condition           text not null check (condition in ('acne', 'hyperpigmentation', 'wrinkles')),
  severity            smallint not null check (severity between 1 and 4),
  region              text,

  unratable           boolean not null default false,
  unratable_reason    text,

  is_adjudication     boolean not null default false,
  notes               text,

  unique (scan_id, annotator_id, condition, region, rubric_version)
);

create index annotations_scan_id_idx on annotations (scan_id);
create index annotations_rubric_version_idx on annotations (rubric_version);

-- ---------------------------------------------------------------------------
-- chat_messages — deferred from v1, created empty
-- ---------------------------------------------------------------------------

create table chat_messages (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references sessions (id) on delete cascade,
  created_at          timestamptz not null default now(),

  role                text not null check (role in ('user', 'assistant')),
  region              text,
  content             text not null,
  model               text
);

create index chat_messages_session_id_idx on chat_messages (session_id);

-- ---------------------------------------------------------------------------
-- consent_events — user-level consent history, separate from the per-scan
-- immutable snapshot on `scans`
-- ---------------------------------------------------------------------------
--
-- scans.consent_* answers "what applied to THIS scan." This answers "what is
-- this user's current consent state," independent of any one scan — e.g. a
-- signed-in user revoking training consent from account settings, with no
-- scan in progress. Append-only: a revocation is a new row, never an update.
--
-- NOT YET consulted by training_eligible (see section 15 of the setup
-- report / migration history note) — wiring that up is future work once a
-- consent-management UI actually writes here.

create table consent_events (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles (id) on delete cascade,
  consent_type    text not null check (consent_type in ('processing', 'training')),
  granted         boolean not null,
  consent_version text not null,
  source          text,
  created_at      timestamptz not null default now()
);

create index consent_events_profile_idx on consent_events (profile_id, consent_type, created_at desc);

-- ---------------------------------------------------------------------------
-- training_eligible — the dataset export surface
-- ---------------------------------------------------------------------------
--
-- A view, not a manually maintained folder. Revoking training consent or
-- deleting a row propagates immediately; a copied-out folder does not.
-- security_invoker so it never runs with the view owner's elevated
-- privileges regardless of who is granted access to it later.

create view training_eligible
with (security_invoker = on)
as
select
  s.id                        as scan_id,
  s.created_at,
  s.pipeline_version,
  s.scoring_version,
  s.stats_path,
  s.ita_degrees,
  s.ita_band,
  s.has_clipped_pixels,
  s.region_hist_bin_edges,
  i.original_path,
  i.original_sha256,
  sess.age_years,
  sess.answers               as self_report
from scans s
join scan_images i on i.scan_id = s.id
join sessions sess on sess.id = s.session_id
where s.consent_training = true
  and s.consent_training_revoked_at is null
  and i.original_status = 'uploaded';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Every table is locked by default. Server-side routes use the service role
-- key, which bypasses RLS entirely, for all writes. The policies below only
-- grant authenticated end users read access to rows they own (and, for
-- consent_events, the ability to record their own consent decisions) —
-- everything else stays service-role-only by having zero policies.
--
-- On this Supabase release, new tables are NOT auto-exposed to the anon /
-- authenticated API roles — an explicit GRANT is required in addition to a
-- policy, or PostgREST returns permission-denied before RLS is even
-- evaluated. Grants below are scoped to exactly what each policy allows.

alter table profiles         enable row level security;
alter table sessions         enable row level security;
alter table scans            enable row level security;
alter table scan_images      enable row level security;
alter table scan_scores      enable row level security;
alter table scan_regions     enable row level security;
alter table scan_model_runs  enable row level security;
alter table recommendations  enable row level security;
alter table shopify_orders   enable row level security;
alter table return_reminders enable row level security;
alter table annotations      enable row level security;
alter table chat_messages    enable row level security;
alter table consent_events   enable row level security;

-- profiles: a user reads/updates only their own row. No INSERT policy —
-- rows are created exclusively by the on_auth_user_created trigger. No
-- DELETE policy — removal happens via the auth.users cascade only.
create policy "profiles_select_own" on profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select on profiles to authenticated;
grant update (display_name) on profiles to authenticated;

-- scans: a user reads only their own scans. No INSERT/UPDATE/DELETE policy —
-- scan creation and mutation is server-mediated (service role) only.
create policy "scans_select_own" on scans
  for select to authenticated
  using (user_id = auth.uid());

grant select on scans to authenticated;

-- scan_images: metadata only (actual bytes are gated by Storage policies,
-- not this table). Read-only, via the owning scan.
create policy "scan_images_select_own" on scan_images
  for select to authenticated
  using (exists (
    select 1 from scans s where s.id = scan_images.scan_id and s.user_id = auth.uid()
  ));

grant select on scan_images to authenticated;

-- scan_scores / scan_regions / scan_model_runs: server-generated, read-only
-- to the owning user.
create policy "scan_scores_select_own" on scan_scores
  for select to authenticated
  using (exists (
    select 1 from scans s where s.id = scan_scores.scan_id and s.user_id = auth.uid()
  ));

create policy "scan_regions_select_own" on scan_regions
  for select to authenticated
  using (exists (
    select 1 from scans s where s.id = scan_regions.scan_id and s.user_id = auth.uid()
  ));

create policy "scan_model_runs_select_own" on scan_model_runs
  for select to authenticated
  using (exists (
    select 1 from scans s where s.id = scan_model_runs.scan_id and s.user_id = auth.uid()
  ));

grant select on scan_scores to authenticated;
grant select on scan_regions to authenticated;
grant select on scan_model_runs to authenticated;

-- consent_events: a user may read and append to their own consent history.
-- No UPDATE/DELETE — the log is append-only by design (section 15).
create policy "consent_events_select_own" on consent_events
  for select to authenticated
  using (profile_id = auth.uid());

create policy "consent_events_insert_own" on consent_events
  for insert to authenticated
  with check (profile_id = auth.uid());

grant select, insert on consent_events to authenticated;

-- sessions, recommendations, shopify_orders, return_reminders, annotations,
-- chat_messages: intentionally NO policies and NO grants to anon/authenticated.
-- These remain entirely server-only (service role bypasses RLS); there is no
-- end-user identity concept for anonymous quiz sessions to key a policy on.

-- ---------------------------------------------------------------------------
-- Storage — private bucket for scan images
-- ---------------------------------------------------------------------------
--
-- Path convention: skin-scans/{user_id}/{scan_id}/original/original.jpg,
-- .../preview/preview.jpg, .../overlays/{category}.png. `public = false`:
-- originals are never publicly reachable. No INSERT/UPDATE/DELETE policy for
-- authenticated/anon — uploads remain server-mediated (service role) only,
-- consistent with scan_images having no client write policy either.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('skin-scans', 'skin-scans', false, 52428800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "skin_scans_read_own_prefix" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'skin-scans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
