-- The /skin-check questionnaire (lib/skin-check-steps.ts) was consolidated
-- from ~29 questions to ~18: several personal-context questions merged into
-- single multi-selects, and two fields were renamed because their value
-- shape genuinely changed (primary_concern: string -> primary_concerns:
-- string[]; breakouts -> breakout_pattern with a new, non-clinical value
-- vocabulary). training_eligible's self_report allowlist (introduced in
-- 20260903043100) is an explicit field list keyed by literal JSON key name,
-- so it needs to track the new field names or it silently stops projecting
-- data for every removed/renamed key going forward.
--
-- No backfill and no data migration for sessions.answers itself: nothing in
-- this codebase writes to the sessions table yet (SkinCheckSessionProvider
-- is in-memory only, see lib/skin-check-session-context.tsx — real
-- persistence is a later step), so there are no existing rows whose
-- self_report shape this could disturb. This migration only changes what a
-- *future* row would project.
--
-- Removed (folded into the new consolidated questions below, or dropped
-- with no replacement — breakout_onset_age and rosacea_screen were
-- age-gated questions removed outright per the questionnaire redesign):
--   cycle_regularity, cycle_acne_correlation, pcos_symptom_screen,
--   pregnancy_breastfeeding_status, contraception_type,
--   shaving_area_involvement, sweat_gear_exposure, breakout_onset_age,
--   rosacea_screen, menopause_status, sleep_quality, stress_level, smoking,
--   sweat_humidity_exposure.
-- Renamed: primary_concern -> primary_concerns, breakouts -> breakout_pattern.
-- Added: female_skin_context, male_skin_context, skin_factors — the new
-- consolidated questions those removed/renamed fields fold into.
-- Unchanged: skin_type, acne_areas, pih_scar_tendency, skin_tone,
-- sunscreen_habit, current_products, diet, water_intake, gender.
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
    'primary_concerns',             sess.answers -> 'primary_concerns',
    'skin_type',                    sess.answers -> 'skin_type',
    'breakout_pattern',             sess.answers -> 'breakout_pattern',
    'acne_areas',                   sess.answers -> 'acne_areas',
    'pih_scar_tendency',            sess.answers -> 'pih_scar_tendency',
    'skin_tone',                    sess.answers -> 'skin_tone',
    'sunscreen_habit',              sess.answers -> 'sunscreen_habit',
    'current_products',             sess.answers -> 'current_products',
    'female_skin_context',          sess.answers -> 'female_skin_context',
    'male_skin_context',            sess.answers -> 'male_skin_context',
    'skin_factors',                 sess.answers -> 'skin_factors',
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
  'is training signal, not identifying data. Field list follows the '
  'questionnaire in lib/skin-check-steps.ts — see 20260907120000 for the '
  'consolidation that last changed it.';
