import type { SectionConfig, SkinCheckAnswers } from "@/types/skin-check";

export const ALL_SECTION_LABELS = [
  "About You",
  "Your Skin",
  "For You",
  "Recovery",
  "Gut",
  "Skin Photo",
  "Get Your Results",
];

// Gender/age condition predicates for the "For You" branch — a single
// predicate per step rather than parallel per-gender step arrays, so an
// age modifier (onset/rosacea/menopause) is just another predicate inside
// the same branch instead of a second tree to keep in sync.
const isFemale = (answers: SkinCheckAnswers) => answers.gender === "female";
const isMale = (answers: SkinCheckAnswers) => answers.gender === "male";

// The age step (lib/skin-check-steps.ts "about-you" section) has no bucket
// isolating exactly 30-34 or 40-44 — "35-44" and "45-plus" are the closest
// fit to the research's "30+" trigger. These modifiers are soft weighting
// signals, not diagnostic gates, so the approximation is fine without
// changing the user-facing age buckets.
const AGE_30_PLUS_BUCKETS = ["35-44", "45-plus"];
const is30PlusAge = (answers: SkinCheckAnswers) =>
  typeof answers.age === "string" && AGE_30_PLUS_BUCKETS.includes(answers.age);
const is45PlusAge = (answers: SkinCheckAnswers) => answers.age === "45-plus";
// Under-18 is hard-blocked before this section ever renders (see the
// `blocked` state in useSkinCheckFlow), and there's no bucket isolating
// teens (13-19) from adults otherwise — "18-24" is the closest remaining
// bucket to the research's teen-onset question, so this is framed as a
// plain onset question rather than "teen" copy, since most of that bucket
// is 20-24.
const isOnsetAge = (answers: SkinCheckAnswers) => answers.age === "18-24";
const isMenopauseAge = (answers: SkinCheckAnswers) => isFemale(answers) && is45PlusAge(answers);
// Pregnancy/breastfeeding status is a safety-gate field, not a female-only
// data point — it should exist for anyone it could apply to. Only the male
// branch has no equivalent need, so this is female-or-other rather than
// requiring female specifically.
const isFemaleOrOther = (answers: SkinCheckAnswers) => isFemale(answers) || answers.gender === "other";

export const SECTIONS: SectionConfig[] = [
  {
    id: "about-you",
    label: "ABOUT YOU",
    steps: [
      {
        id: "name",
        type: "text",
        prompt: "Hi! What's your name?",
        placeholder: "Type your name",
      },
      {
        id: "age",
        type: "single-select-chips",
        prompt: "How old are you?",
        options: [
          { value: "under-18", label: "<18" },
          { value: "18-24", label: "18–24" },
          { value: "25-34", label: "25–34" },
          { value: "35-44", label: "35–44" },
          { value: "45-plus", label: "45+" },
        ],
      },
      {
        id: "gender",
        type: "single-select-chips",
        prompt: "What's your gender?",
        options: [
          { value: "female", label: "Female" },
          { value: "male", label: "Male" },
          { value: "other", label: "Other" },
        ],
      },
    ],
  },
  {
    id: "your-skin",
    label: "YOUR SKIN",
    steps: [
      {
        id: "primary_concern",
        type: "single-select-chips",
        prompt: "What's the main thing you'd like to work on?",
        options: [
          { value: "blemishes", label: "Breakouts" },
          { value: "redness", label: "Redness" },
          { value: "pigment", label: "Dark marks" },
          { value: "texture", label: "Texture" },
          { value: "pores", label: "Pores" },
          { value: "hydration", label: "Dryness" },
          { value: "oiliness", label: "Oiliness" },
        ],
      },
      {
        id: "skin_type",
        type: "single-select-cards",
        prompt: "What best describes your skin type?",
        options: [
          { value: "normal", label: "Normal", description: "Balanced — rarely oily or dry." },
          { value: "oily", label: "Oily", description: "Greasy or shiny by mid-day." },
          {
            value: "combination",
            label: "Combination",
            description: "Oily in some areas, dry in others.",
          },
          { value: "dry", label: "Dry", description: "Feels tight or flaky often." },
          {
            value: "ultra_dry",
            label: "Ultra Dry",
            description: "Rough, flaky, or tight most days.",
          },
        ],
      },
      {
        id: "breakouts",
        type: "multi-select-cards",
        prompt: "How would you describe your breakouts?",
        options: [
          {
            value: "whiteheads_blackheads",
            label: "Whiteheads / Blackheads",
            description: "Small clogged pores, on the surface.",
            imagePlaceholder: "Macro texture — whiteheads/blackheads",
          },
          {
            value: "papules_pustules",
            label: "Papules / Pustules",
            description: "Red, inflamed bumps, sometimes with pus.",
            imagePlaceholder: "Macro texture — papules/pustules",
          },
          {
            value: "nodules_cysts",
            label: "Nodules / Cysts",
            description: "Deep, painful, under the skin.",
            imagePlaceholder: "Macro texture — nodules/cysts",
          },
          {
            value: "marks_scars",
            label: "Marks / Scars",
            description: "Leftover marks after breakouts heal.",
            imagePlaceholder: "Macro texture — marks/scars",
          },
        ],
      },
      {
        id: "acne_areas",
        type: "body-map",
        prompt: "Select all the areas where your acne comes up.",
        options: [
          { value: "forehead", label: "Forehead" },
          { value: "nose", label: "Nose" },
          { value: "left_cheek", label: "Left cheek" },
          { value: "right_cheek", label: "Right cheek" },
          { value: "mouth", label: "Mouth area" },
          { value: "chin_jawline", label: "Chin / jawline" },
          { value: "neck", label: "Neck" },
          { value: "shoulders_back_chest", label: "Shoulders / back / chest" },
        ],
      },
      {
        id: "pih_scar_tendency",
        type: "single-select-chips",
        prompt: "When a breakout heals, what usually happens after?",
        options: [
          { value: "fades_no_trace", label: "Fades with no trace" },
          { value: "dark_mark_fades", label: "Leaves a dark mark that fades in a few months" },
          { value: "dark_mark_lingers", label: "Leaves a dark mark that lingers" },
          { value: "scar_or_indent", label: "Leaves a scar or indentation" },
        ],
      },
      {
        id: "skin_tone",
        type: "single-select-cards",
        prompt: "Which best describes how your skin responds to sun?",
        options: [
          { value: "fitz_1", label: "Always burns, rarely tans", description: "Very fair skin" },
          { value: "fitz_2", label: "Burns easily, tans minimally", description: "Fair skin" },
          { value: "fitz_3", label: "Sometimes burns, tans gradually", description: "Medium skin" },
          { value: "fitz_4", label: "Rarely burns, tans easily", description: "Olive skin" },
          { value: "fitz_5", label: "Very rarely burns, tans deeply", description: "Brown skin" },
          { value: "fitz_6", label: "Never burns, deeply pigmented", description: "Deep skin" },
        ],
      },
      {
        id: "sunscreen_habit",
        type: "single-select-chips",
        prompt: "How often do you wear sunscreen?",
        options: [
          { value: "daily", label: "Daily" },
          { value: "most_days", label: "Most days" },
          { value: "occasionally", label: "Occasionally" },
          { value: "rarely_never", label: "Rarely or never" },
        ],
      },
      {
        id: "current_products",
        type: "multi-select-cards",
        prompt: "What are you currently using on your skin?",
        exclusiveValue: "none",
        options: [
          { value: "none", label: "Nothing right now" },
          { value: "cleanser_moisturizer", label: "Cleanser & moisturizer" },
          { value: "actives", label: "Actives", description: "Retinoids, AHA/BHA, vitamin C, etc." },
          { value: "prescription", label: "A prescription product" },
        ],
      },
    ],
  },
  {
    id: "personal-context",
    label: "FOR YOU",
    steps: [
      {
        id: "cycle_regularity",
        type: "single-select-chips",
        prompt: "Is your cycle generally regular?",
        condition: isFemale,
        options: [
          { value: "regular", label: "Regular" },
          { value: "irregular", label: "Irregular" },
          { value: "no_periods", label: "I don't get periods" },
        ],
      },
      {
        id: "cycle_acne_correlation",
        type: "single-select-chips",
        prompt: "Do your breakouts tend to show up around a certain point in your cycle?",
        condition: isFemale,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
      {
        id: "pcos_symptom_screen",
        type: "multi-select-cards",
        prompt: "Do any of these apply to you?",
        note: "This helps us understand hormonal patterns — it's a screening question, not a diagnosis.",
        condition: isFemale,
        exclusiveValue: "none",
        options: [
          { value: "irregular_absent_periods", label: "Irregular or absent periods" },
          { value: "excess_hair_growth", label: "Extra hair growth on chin, chest, or abdomen" },
          { value: "scalp_hair_thinning", label: "Scalp hair thinning" },
          { value: "weight_change", label: "Unexplained weight change" },
          { value: "none", label: "None of these" },
        ],
      },
      {
        id: "pregnancy_breastfeeding_status",
        type: "single-select-chips",
        prompt: "Are you currently pregnant or breastfeeding?",
        note: "This helps us keep recommendations safe for you.",
        condition: isFemaleOrOther,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "prefer_not_to_say", label: "Prefer not to say" },
        ],
      },
      {
        id: "contraception_type",
        type: "single-select-chips",
        prompt: "Are you currently using any hormonal contraception?",
        condition: isFemale,
        options: [
          { value: "none", label: "None" },
          { value: "combined_pill", label: "Combined pill" },
          { value: "progestin_only", label: "Progestin-only pill" },
          { value: "hormonal_iud", label: "Hormonal IUD" },
          { value: "implant_or_injection", label: "Implant or injection" },
          { value: "other", label: "Other" },
        ],
      },
      {
        id: "shaving_area_involvement",
        type: "single-select-chips",
        prompt: "Does the shaving area on your face or neck tend to break out or get irritated?",
        condition: isMale,
        options: [
          { value: "regularly", label: "Regularly" },
          { value: "sometimes", label: "Sometimes" },
          { value: "rarely_never", label: "Rarely or never" },
        ],
      },
      {
        id: "sweat_gear_exposure",
        type: "single-select-chips",
        prompt: "Do you regularly wear gear that traps sweat against your skin — helmets, pads, tight collars?",
        condition: isMale,
        options: [
          { value: "yes", label: "Yes" },
          { value: "sometimes", label: "Sometimes" },
          { value: "no", label: "No" },
        ],
      },
      {
        id: "breakout_onset_age",
        type: "single-select-chips",
        prompt: "Around what age did breakouts first start for you?",
        condition: isOnsetAge,
        options: [
          { value: "before_teens", label: "Before my teens" },
          { value: "teens", label: "In my teens" },
          { value: "early_twenties", label: "In my early twenties" },
        ],
      },
      {
        id: "rosacea_screen",
        type: "single-select-chips",
        prompt:
          "Do you notice flushing or persistent redness across your cheeks and nose, separate from breakouts?",
        note: "This helps us tell redness patterns apart — it's a screening question, not a diagnosis.",
        condition: is30PlusAge,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
      {
        id: "menopause_status",
        type: "single-select-chips",
        prompt: "Are you currently in or past menopause?",
        condition: isMenopauseAge,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "not_sure", label: "Not sure" },
        ],
      },
    ],
  },
  {
    id: "recovery",
    label: "RECOVERY",
    steps: [
      {
        id: "sleep_quality",
        type: "scale-1-5",
        prompt: "Help us understand your recovery patterns. How would you rate your sleep quality?",
        minLabel: "Broken",
        maxLabel: "Rested",
        reflections: {
          "1": "Rest has been hard to come by.",
          "2": "Sleep's been rough more nights than not.",
          "3": "Some nights are good, some not.",
          "4": "Mostly restful, with the odd rough night.",
          "5": "Consistently deep, restful sleep.",
        },
      },
      {
        id: "stress_level",
        type: "scale-1-5",
        prompt: "And your stress level lately?",
        minLabel: "Almost zen",
        maxLabel: "Immense",
        reflections: {
          "1": "Pretty much unbothered.",
          "2": "Manageable, low-key.",
          "3": "A mix of calm and chaotic.",
          "4": "Frequently stretched thin.",
          "5": "Constantly overwhelmed.",
        },
      },
      {
        id: "smoking",
        type: "single-select-chips",
        prompt: "Do you smoke or vape?",
        options: [
          { value: "never", label: "Never" },
          { value: "occasionally", label: "Occasionally" },
          { value: "frequently", label: "Frequently" },
        ],
        note: "We ask because regular exposure to smoke can affect acne.",
      },
      {
        id: "sweat_humidity_exposure",
        type: "single-select-chips",
        prompt: "How much do you sweat during a typical day — commute, weather, exercise combined?",
        options: [
          { value: "minimal", label: "Minimal" },
          { value: "moderate", label: "Moderate" },
          { value: "high", label: "High" },
        ],
      },
    ],
  },
  {
    id: "gut",
    label: "GUT",
    steps: [
      {
        id: "diet",
        type: "multi-select-cards",
        prompt: "Select all foods you eat 3+ times a week.",
        note: "We focus on identifying meaningful food-acne patterns before recommending restrictions.",
        exclusiveValue: "none",
        options: [
          { value: "whey_protein", label: "Whey protein", imagePlaceholder: "Icon — whey protein" },
          { value: "dairy", label: "Milk / Dairy", imagePlaceholder: "Icon — milk/dairy" },
          {
            value: "sugar_desserts",
            label: "Sugar / Desserts",
            imagePlaceholder: "Icon — sugar/desserts",
          },
          {
            value: "fried_packaged",
            label: "Fried / packaged snacks",
            imagePlaceholder: "Icon — fried/packaged snacks",
          },
          { value: "none", label: "None of these apply" },
        ],
      },
      {
        id: "water_intake",
        type: "segmented-slider",
        prompt: "How much water do you drink in a day?",
        options: [
          { value: "lt1", label: "<1 litre", sublabel: "≈2 glasses" },
          { value: "1to2", label: "1–2 litres", sublabel: "≈4–8 glasses" },
          { value: "2to3", label: "2–3 litres", sublabel: "≈8–12 glasses" },
          { value: "gt3", label: ">3 litres", sublabel: "≈12+ glasses" },
        ],
      },
    ],
  },
  {
    id: "skin-photo",
    label: "SKIN PHOTO",
    steps: [
      {
        id: "skin_photo",
        type: "photo-capture",
        prompt: "One last thing — a quick photo helps us read your skin, not just your answers.",
        note: "Face the camera in good light. This stays on your device until you save your results.",
      },
    ],
  },
  {
    id: "get-your-results",
    label: "GET YOUR RESULTS",
    steps: [
      {
        id: "final_phone",
        type: "phone",
        prompt: "That's everything, {name} — where should we send your results?",
        note: "Enter your WhatsApp number to get your personalised skin report. We'll only use this to send your results.",
      },
    ],
  },
];
