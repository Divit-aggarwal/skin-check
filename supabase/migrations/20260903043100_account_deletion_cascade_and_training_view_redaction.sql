-- Phase 1 hardening, two functional changes plus documentation:
--
-- ISSUE #1 — account deletion semantics.
-- scans.user_id was ON DELETE SET NULL. Traced the consequence: deleting
-- auth.users cascades profiles, but a SET NULL on scans.user_id leaves the
-- scan row alive with no owner — still consent_training = true, still
-- matched by training_eligible, now permanently unidentifiable to fulfil a
-- future deletion request against. That violates "training-eligible data
-- must never remain attributable to a deleted user" in the strongest way:
-- it remains *in* the training-eligible set with no path left to remove it.
--
-- Switched to ON DELETE CASCADE. This is safe and scoped: the FK only ever
-- fires for scans where user_id equals the specific profile being deleted —
-- it cannot touch another user's rows, and it never touches user_id IS NULL
-- (anonymous, pre-auth) scans, which have no FK to any profile at all.
-- Every table hanging off scans (scan_images, scan_scores, scan_regions,
-- scan_model_runs, recommendations, annotations) already cascades via its
-- existing scan_id -> scans(id) ON DELETE CASCADE, so this one change
-- removes the entire tree. return_reminders.follow_up_scan_id stays
-- ON DELETE SET NULL — the reminder itself belongs to the session, not the
-- deleted user, and shouldn't disappear, only lose a dangling pointer.
-- No anonymization system introduced (explicitly out of scope) — deletion,
-- not anonymization, is how "never attributable to a deleted user" is met
-- with no additional moving parts.
alter table scans drop constraint scans_user_id_fkey;
alter table scans add constraint scans_user_id_fkey
  foreign key (user_id) references profiles (id) on delete cascade;

comment on constraint scans_user_id_fkey on scans is
  'ON DELETE CASCADE (not SET NULL): a deleted account''s scans, and everything '
  'that hangs off them (images/scores/regions/model runs/recommendations/'
  'annotations via their own scan_id cascades), are deleted outright. This is '
  'the mechanism that keeps training_eligible from ever retaining a scan '
  'attributable to a since-deleted user. Anonymous (user_id IS NULL) scans are '
  'never affected — there is no FK to fire on.';

-- ISSUE #2 — training_eligible was projecting sess.answers (the entire quiz
-- payload) as self_report. That payload includes `name` and `final_phone`
-- (see lib/skin-check-steps.ts) — direct identifiers with no business being
-- anywhere near a training/export surface. age is already carried
-- separately via sess.age_years (a validated column), so answers.age is
-- redundant here too.
--
-- Replaced with an explicit allowlist of the self-report fields that are
-- actually skin-condition/lifestyle signal: primary_concern, skin_type,
-- breakouts, acne_areas, pih_scar_tendency, skin_tone, sunscreen_habit,
-- current_products, cycle_regularity, cycle_acne_correlation,
-- pcos_symptom_screen, pregnancy_breastfeeding_status, contraception_type,
-- shaving_area_involvement, sweat_gear_exposure, breakout_onset_age,
-- rosacea_screen, menopause_status, sleep_quality, stress_level, smoking,
-- sweat_humidity_exposure, diet, water_intake, gender. Excluded: name,
-- final_phone (identifiers), skin_photo (a flow-step marker, not signal),
-- age (redundant with age_years). This is an allowlist, not a blocklist,
-- deliberately: a future quiz field is invisible here until someone
-- explicitly adds it, rather than silently flowing through unvetted the way
-- the wholesale answers object did.
--
-- sessions.answers itself is untouched — the application may still need the
-- full payload; only what training_eligible projects changed.
create or replace view training_eligible
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
  jsonb_strip_nulls(jsonb_build_object(
    'primary_concern',              sess.answers -> 'primary_concern',
    'skin_type',                    sess.answers -> 'skin_type',
    'breakouts',                    sess.answers -> 'breakouts',
    'acne_areas',                   sess.answers -> 'acne_areas',
    'pih_scar_tendency',            sess.answers -> 'pih_scar_tendency',
    'skin_tone',                    sess.answers -> 'skin_tone',
    'sunscreen_habit',              sess.answers -> 'sunscreen_habit',
    'current_products',             sess.answers -> 'current_products',
    'cycle_regularity',             sess.answers -> 'cycle_regularity',
    'cycle_acne_correlation',       sess.answers -> 'cycle_acne_correlation',
    'pcos_symptom_screen',          sess.answers -> 'pcos_symptom_screen',
    'pregnancy_breastfeeding_status', sess.answers -> 'pregnancy_breastfeeding_status',
    'contraception_type',           sess.answers -> 'contraception_type',
    'shaving_area_involvement',     sess.answers -> 'shaving_area_involvement',
    'sweat_gear_exposure',          sess.answers -> 'sweat_gear_exposure',
    'breakout_onset_age',           sess.answers -> 'breakout_onset_age',
    'rosacea_screen',               sess.answers -> 'rosacea_screen',
    'menopause_status',             sess.answers -> 'menopause_status',
    'sleep_quality',                sess.answers -> 'sleep_quality',
    'stress_level',                 sess.answers -> 'stress_level',
    'smoking',                      sess.answers -> 'smoking',
    'sweat_humidity_exposure',      sess.answers -> 'sweat_humidity_exposure',
    'diet',                         sess.answers -> 'diet',
    'water_intake',                 sess.answers -> 'water_intake',
    'gender',                       sess.answers -> 'gender'
  ))                          as self_report
from scans s
join scan_images i on i.scan_id = s.id
join sessions sess on sess.id = s.session_id
where s.consent_training = true
  and s.consent_training_revoked_at is null
  and i.original_status = 'uploaded';

comment on view training_eligible is
  'Dataset-export surface. self_report is an explicit field allowlist over '
  'sessions.answers, NOT the raw payload — sessions.answers also contains '
  'name and final_phone (direct identifiers) which must never appear here. '
  'Adding a new quiz field to this view requires an explicit decision that it '
  'is training signal, not identifying data.';

-- ISSUE #3 — consent_events client-insert scope, documented (no schema
-- change: the existing WITH CHECK already prevents spoofing another user's
-- profile_id, and there is no UPDATE/DELETE policy, so history is already
-- immutable once written).
comment on policy consent_events_insert_own on consent_events is
  'A user may only insert a consent_events row for their own profile_id '
  '(enforced by WITH CHECK) and can never update or delete one once written '
  '(no such policy exists) — the log is append-only and non-spoofable as-is. '
  'This remains a temporary, client-trusting record of a self-reported choice: '
  'once an authoritative consent UI exists, INSERT should move server-side so '
  'a recorded consent event reflects a verified action rather than a bare '
  'client claim.';

-- ISSUE #4 — anonymous scan storage, documented decision (no schema change:
-- deferring is the chosen path, not a gap).
comment on policy skin_scans_read_own_prefix on storage.objects is
  'Deliberately the ONLY Storage policy on this bucket. Authenticated users '
  'may read (not write) objects under their own {auth.uid()}/ prefix; there is '
  'no anonymous read/write policy at all. Today every scan is anonymous '
  '(scans.user_id IS NULL, no auth wired up), so no client can read or write '
  'any object in this bucket yet — uploads remain entirely server-mediated '
  '(service role, which bypasses RLS). This is intentional, not an oversight: '
  'an anonymous namespace (e.g. skin-scans/anon/{session_id}/...) is an open '
  'decision for whoever wires up upload code, not something to improvise here '
  'with a permissive placeholder policy.';
