# Phase 0 rule, addendum B: the 0.1.6 RELEASE candidate image (written before building)

Written 2026-10-03, **before the release image was built and before any of its responses existed.** It is committed on its own.

## 1. What this run is
- **What it adds:** the earlier 0.1.6 run scored a bench build (`ce51ed2d…`, `engine_build: bench-local-…`). This run scores the **release candidate**: the one image that ENGINE_0_1_6_DEPLOYMENT_PLAN §5 builds once and later pushes unchanged.
- **Build:**
  - clean `git archive 8dc37dc`
  - `--platform linux/amd64 --no-cache`
  - `--build-arg ENGINE_BUILD=sha-8dc37dc501ea974825427c665acd7019120c20ec`
  - tagged `550428926515.dkr.ecr.ap-south-1.amazonaws.com/skin-scan:sha-8dc37dc501ea974825427c665acd7019120c20ec`
- **The image is NOT pushed.** It is kept locally so the same bytes can be pushed later.

## 2. Rule
- [CLASSIFICATION_RULE.md](CLASSIFICATION_RULE.md) applies **verbatim**.
- [CLASSIFICATION_RULE_0_1_6.md](CLASSIFICATION_RULE_0_1_6.md) §1–§3 apply verbatim:
  - `faceB` stays EXPLORATORY;
  - the conditions for the two declared deviations are unchanged;
  - H-EQ applies, against 0.1.5 `results/`.
- **Classes are derived from this image's data alone** by the unchanged `analyse.py`. The 0.1.5 and bench results are used only for comparison, never to classify.

## 3. Comparison categories (per field, against the 0.1.5 class)

| Category | Definition |
|---|---|
| **same behaviour** | Same class. Its values are bit-identical to 0.1.5 on every matrix row, or differ but with every gate verdict unchanged |
| **improved** | Same class. Values differ, and every gate margin (slope distance from 1; leakage) is the same or better |
| **degraded** | Same class. Values differ, and some gate margin is worse |
| **newly inconclusive** | KEEP or DROP becomes INCONCLUSIVE |
| **newly eligible** | INCONCLUSIVE or DROP becomes KEEP |
| (other) | KEEP becomes DROP: reported as **degraded, class lost** |

## 4. Validity guards
- Every row: `pipeline_version == "scan-0.1.6-provisional"` and `engine_build == "sha-8dc37dc501ea974825427c665acd7019120c20ec"`. Otherwise the run is void.
- Containers are created by **image ID**, local only. **No production call.**
- **Pre-flight:** ruff, pyright and pytest pass on the same clean export (deployment plan §5 step 1).
- **Smoke test:** the local container returns `engine_build` equal to the tag (deployment plan §5 step 3).

## 5. Remains impossible (recorded, never imputed)
- A2 real-device input fidelity.
- §4.5 ColorChecker.
- 9 of 10 bench images.
- Native linux/amd64 hardware.
- **The pushed ECR digest equalling the local image ID.** That can only be checked at push time (deployment plan §5 step 5).
