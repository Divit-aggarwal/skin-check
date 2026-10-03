# A14 — DECISION_LOG reconciliation proposal

Status: **PROPOSED, needs owner confirmation. Nothing here has been applied.** Prepared 2026-10-03 against `longitudinal-platform` 36df1e0 and `infra/india-region` ff08107.

## Problem

`DECISION_LOG.md` exists in three versions:

| Version | Old locality D-21 (named DB) | D-22 (India reset) | D-24 (validation protocol) |
|---|---|---|---|
| HEAD (36df1e0) | present (duplicate D-21) | missing | missing |
| ff08107 (`infra/india-region`) | removed | **APPROVED** text | missing (branched at 311c700) |
| Uncommitted working tree | removed | stale PROPOSED text | **only copy** |

The untracked working-tree `DATA_LOCALITY_DECISION.md` (sha256 612c5130…) differs from ff08107's copy only in the status line (PROPOSED vs APPROVED). It is fully superseded.

**Risk:** D-24 exists only in the uncommitted draft. Discarding the drafts wholesale loses it. Its text is preserved verbatim below so the draft can be discarded safely.

## Evidence

- `git merge-base HEAD infra/india-region` = 311c700.
- `git diff 311c700 ff08107` touches only DATA_LOCALITY_DECISION.md (new), DECISION_LOG.md, DEV_PROD_BOUNDARY.md (new), FIRESTORE_RESET_RUNBOOK.md (new), vercel.json (`regions: ["bom1"]`).
- `git merge-tree --write-tree HEAD infra/india-region`: the only conflict is in DECISION_LOG.md.
- A real merge would also refuse to run while the untracked DATA_LOCALITY_DECISION.md is in the way.

## Proposed resolution

1. Move the uncommitted drafts aside (don't delete them until step 4 is verified):
   `git stash push -u -m "A14 superseded drafts" -- docs/architecture/DECISION_LOG.md docs/architecture/DATA_LOCALITY_DECISION.md`
2. `git merge infra/india-region`. Resolve DECISION_LOG.md as follows:
   - drop the old locality D-21 (as ff08107 does);
   - keep ff08107's APPROVED D-22 text, placed after the gate-01 D-21;
   - keep HEAD's D-07 status update and its D-23, D-25 and D-26 entries.
3. Insert D-24 (text below) between D-23 and D-25, and add one line:
   "Primary fields narrowed by D-25 (MD-1); D-24 governs the protocol, D-25 the endpoints."
4. Check that IDs are unique and complete: `grep -o '^\*\*D-[0-9]*' docs/architecture/DECISION_LOG.md | sort | uniq -d` returns nothing, and D-01…D-26 are all present.
5. Commit, then `git stash drop`.

vercel.json `bom1` arrives on `longitudinal-platform` with this merge. It reaches production only via A13, so the merge itself has no production effect.

## D-24 text to preserve (verbatim from the working-tree draft)

**D-24 Longitudinal change claims are gated on the measurement-validation protocol. It supersedes EVALUATION_PLAN Track 1. (PROPOSED; research design, no code)**
- **Two claims, kept separate:**
  - **(a) "Beyond measurement noise":** needs a between-day SEM/MDC95 under production capture, per field × region × tone band, plus held-out-user transfer.
  - **(b) Anything about the skin itself:** additionally needs colorimeter criterion validity and responsiveness.
- **Primary fields:** native-path L*, b* and a*, ITA, `lbpEntropy` and `specular.fraction`.
  - The corrected path is a control only (gray-world removes about 93% of a synthetic a* shift).
  - Scores are analysed only to document their failure.
- **Design:**
  - D0/D7/D28 with re-positioned captures. A naturalistic own-phone arm sets the production MDC.
  - Tone bands MST 1–4 / 5–6 / 7–10, recruited to quota.
  - About 30 calibration + 15 validation completers per band (≈ 160 enrolled), split by user.
  - A field failing in any band fails overall.
- **Rejected:** n = 30 pooled (about ±0.2–0.25 ICC precision per band); same-day repeats as the noise floor; offline-script scoring (the EXIF/ICC decode differs from production HTTP).
- **Details:** MEASUREMENT_VALIDATION_STATUS.md and `docs/research/measurement-validation/`.
