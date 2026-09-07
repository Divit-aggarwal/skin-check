# Skin Check onboarding — complete question list

Source: `lib/skin-check-steps.ts` (`SECTIONS` array is what `lib/useSkinCheckFlow.ts` actually steps through in order — it walks `SECTIONS[idx]`, filtering each section's steps by their `condition` predicate). `ALL_SECTION_LABELS` in the same file is a separate, differently-ordered list used only to render the progress-header strip in `SkinCheckFlow.tsx` — it is not the answering order.

For each question: **How** = the input UI (`type` field + its options), **When** = the exact condition under which it's shown (predicate from `lib/skin-check-steps.ts`, lines 17-41).

Condition predicates, verbatim:
- `isFemale` = `gender === "female"`
- `isMale` = `gender === "male"`
- `isFemaleOrOther` = `isFemale OR gender === "other"`
- `isOnsetAge` = `age === "18-24"`
- `is30PlusAge` = `age === "35-44" OR age === "45-plus"` (there's no 30-34 bucket in the age question, so this is the closest fit to a "30+" trigger — a deliberate approximation, per the code comment)
- `is45PlusAge` = `age === "45-plus"`
- `isMenopauseAge` = `isFemale AND is45PlusAge`
- Under-18 users never reach this flow at all — they're hard-blocked earlier, in `useSkinCheckFlow`'s `blocked` state, before any section renders.

---

## Section 1 — ABOUT YOU

**1. `name`** — "Hi! What's your name?"
- How: free-text input
- When: always, no condition

**2. `age`** — "How old are you?"
- How: single-select chips — `<18` / `18–24` / `25–34` / `35–44` / `45+`
- When: always, no condition

**3. `gender`** — "What's your gender?"
- How: single-select chips — Female / Male / Other
- When: always, no condition

## Section 2 — SKIN PHOTO

**4. `skin_photo`** — "One last thing — a quick photo helps us read your skin, not just your answers."
- How: photo capture (camera)
- Shown note: "Face the camera in good light. This stays on your device until you save your results."
- When: always, no condition

## Section 3 — YOUR SKIN

**5. `primary_concern`** — "What's the main thing you'd like to work on?"
- How: single-select chips — Breakouts / Redness / Dark marks / Texture / Pores / Dryness / Oiliness
- When: always, no condition

**6. `skin_type`** — "What best describes your skin type?"
- How: single-select cards (with descriptions) — Normal ("Balanced — rarely oily or dry") / Oily ("Greasy or shiny by mid-day") / Combination ("Oily in some areas, dry in others") / Dry ("Feels tight or flaky often") / Ultra Dry ("Rough, flaky, or tight most days")
- When: always, no condition

**7. `breakouts`** — "How would you describe your breakouts?"
- How: multi-select cards (with descriptions/image placeholders) — Whiteheads/Blackheads / Papules/Pustules / Nodules/Cysts / Marks/Scars
- When: always, no condition

**8. `acne_areas`** — "Select all the areas where your acne comes up."
- How: body-map multi-select — Forehead / Nose / Left cheek / Right cheek / Mouth area / Chin/jawline / Neck / Shoulders/back/chest
- When: always, no condition

**9. `pih_scar_tendency`** — "When a breakout heals, what usually happens after?"
- How: single-select chips — Fades with no trace / Leaves a dark mark that fades in a few months / Leaves a dark mark that lingers / Leaves a scar or indentation
- When: always, no condition

**10. `skin_tone`** — "Which best describes how your skin responds to sun?"
- How: single-select cards (Fitzpatrick scale I–VI, each with a description) — Always burns/rarely tans ("Very fair skin") / Burns easily/tans minimally ("Fair skin") / Sometimes burns/tans gradually ("Medium skin") / Rarely burns/tans easily ("Olive skin") / Very rarely burns/tans deeply ("Brown skin") / Never burns/deeply pigmented ("Deep skin")
- When: always, no condition

**11. `sunscreen_habit`** — "How often do you wear sunscreen?"
- How: single-select chips — Daily / Most days / Occasionally / Rarely or never
- When: always, no condition

**12. `current_products`** — "What are you currently using on your skin?"
- How: multi-select cards, "Nothing right now" is exclusive (deselects the rest if chosen) — Nothing right now / Cleanser & moisturizer / Actives ("Retinoids, AHA/BHA, vitamin C, etc.") / A prescription product
- When: always, no condition

## Section 4 — FOR YOU (personal context — all 10 of these branch)

**13. `cycle_regularity`** — "Is your cycle generally regular?"
- How: single-select chips — Regular / Irregular / I don't get periods
- When: `isFemale` only

**14. `cycle_acne_correlation`** — "Do your breakouts tend to show up around a certain point in your cycle?"
- How: single-select chips — Yes / No / Not sure
- When: `isFemale` only

**15. `pcos_symptom_screen`** — "Do any of these apply to you?"
- How: multi-select cards, "None of these" is exclusive — Irregular or absent periods / Extra hair growth on chin, chest, or abdomen / Scalp hair thinning / Unexplained weight change / None of these
- Shown note: "This helps us understand hormonal patterns — it's a screening question, not a diagnosis."
- When: `isFemale` only

**16. `pregnancy_breastfeeding_status`** — "Are you currently pregnant or breastfeeding?"
- How: single-select chips — Yes / No / Prefer not to say
- Shown note: "This helps us keep recommendations safe for you."
- When: `isFemaleOrOther` (female OR "other" gender — deliberately not male-excluded-only, since this is a safety-gate field, not a female-only data point)

**17. `contraception_type`** — "Are you currently using any hormonal contraception?"
- How: single-select chips — None / Combined pill / Progestin-only pill / Hormonal IUD / Implant or injection / Other
- When: `isFemale` only

**18. `shaving_area_involvement`** — "Does the shaving area on your face or neck tend to break out or get irritated?"
- How: single-select chips — Regularly / Sometimes / Rarely or never
- When: `isMale` only

**19. `sweat_gear_exposure`** — "Do you regularly wear gear that traps sweat against your skin — helmets, pads, tight collars?"
- How: single-select chips — Yes / Sometimes / No
- When: `isMale` only

**20. `breakout_onset_age`** — "Around what age did breakouts first start for you?"
- How: single-select chips — Before my teens / In my teens / In my early twenties
- When: `isOnsetAge` (age bucket is exactly `18-24`)

**21. `rosacea_screen`** — "Do you notice flushing or persistent redness across your cheeks and nose, separate from breakouts?"
- How: single-select chips — Yes / No / Not sure
- Shown note: "This helps us tell redness patterns apart — it's a screening question, not a diagnosis."
- When: `is30PlusAge` (age bucket is `35-44` or `45-plus`)

**22. `menopause_status`** — "Are you currently in or past menopause?"
- How: single-select chips — Yes / No / Not sure
- When: `isMenopauseAge` (`isFemale` AND age bucket is `45-plus`)

## Section 5 — RECOVERY

**23. `sleep_quality`** — "Help us understand your recovery patterns. How would you rate your sleep quality?"
- How: 1–5 scale slider, labeled "Broken" (1) → "Rested" (5); shows a one-line reflection under the slider that changes per selected value: 1 "Rest has been hard to come by." / 2 "Sleep's been rough more nights than not." / 3 "Some nights are good, some not." / 4 "Mostly restful, with the odd rough night." / 5 "Consistently deep, restful sleep."
- When: always, no condition

**24. `stress_level`** — "And your stress level lately?"
- How: 1–5 scale slider, labeled "Almost zen" (1) → "Immense" (5); reflection per value: 1 "Pretty much unbothered." / 2 "Manageable, low-key." / 3 "A mix of calm and chaotic." / 4 "Frequently stretched thin." / 5 "Constantly overwhelmed."
- When: always, no condition

**25. `smoking`** — "Do you smoke or vape?"
- How: single-select chips — Never / Occasionally / Frequently
- Shown note: "We ask because regular exposure to smoke can affect acne."
- When: always, no condition

**26. `sweat_humidity_exposure`** — "How much do you sweat during a typical day — commute, weather, exercise combined?"
- How: single-select chips — Minimal / Moderate / High
- When: always, no condition

## Section 6 — GUT

**27. `diet`** — "Select all foods you eat 3+ times a week."
- How: multi-select cards (with icon placeholders), "None of these apply" is exclusive — Whey protein / Milk/Dairy / Sugar/Desserts / Fried/packaged snacks / None of these apply
- Shown note: "We focus on identifying meaningful food-acne patterns before recommending restrictions."
- When: always, no condition

**28. `water_intake`** — "How much water do you drink in a day?"
- How: segmented slider — <1 litre (≈2 glasses) / 1–2 litres (≈4–8 glasses) / 2–3 litres (≈8–12 glasses) / >3 litres (≈12+ glasses)
- When: always, no condition

## Section 7 — GET YOUR RESULTS

**29. `final_phone`** — "That's everything, {name} — where should we send your results?" (name is interpolated from the answer to question 1)
- How: phone number input
- Shown note: "Enter your WhatsApp number to get your personalised skin report. We'll only use this to send your results."
- When: always, no condition

---

## Section-visibility note

A whole section is skipped in the progress flow if none of its steps are eligible for the current answers (`lib/useSkinCheckFlow.ts`, `eligibleStepsFor`) — e.g. a male user never sees any part of "For You" that isn't `shaving_area_involvement` / `sweat_gear_exposure` / age-conditioned questions, so the section still appears but with fewer questions inside it, and it's skipped over entirely only if literally none of its questions apply.
