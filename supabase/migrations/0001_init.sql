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

create extension if not exists "pgcrypto";

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
-- scans — one per successful CV analysis
-- ---------------------------------------------------------------------------

create table scans (
  id                        uuid primary key default gen_random_uuid(),
  session_id                uuid not null references sessions (id) on delete cascade,
  created_at                timestamptz not null default now(),

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

  -- Consent, captured at scan time with the version of the text shown.
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

-- ---------------------------------------------------------------------------
-- scan_images — the actual training asset
-- ---------------------------------------------------------------------------
--
-- Two uploads per scan. The 1280px variant blocks the results flow; the
-- original uploads in the background with retry, so original_path is nullable
-- and original_status tracks whether it ever landed. Processed variants are
-- NOT stored — they are regenerable from the original given pipeline_version.

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
-- training_eligible — the dataset export surface
-- ---------------------------------------------------------------------------
--
-- A view, not a manually maintained folder. Revoking training consent or
-- deleting a row propagates immediately; a copied-out folder does not.

create view training_eligible as
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
-- Every table is locked by default. There is no end-user auth in v1 — all
-- writes go through server-side routes using the service role key, which
-- bypasses RLS. Enabling it here means that if an anon key ever leaks into a
-- client bundle, it reads nothing.

alter table sessions        enable row level security;
alter table scans           enable row level security;
alter table scan_images     enable row level security;
alter table recommendations enable row level security;
alter table shopify_orders  enable row level security;
alter table return_reminders enable row level security;
alter table annotations     enable row level security;
alter table chat_messages   enable row level security;
