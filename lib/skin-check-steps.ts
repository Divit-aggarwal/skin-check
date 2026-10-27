import type { SectionConfig, SkinCheckAnswers } from "@/types/skin-check";

// Order matches SECTIONS below exactly — ProgressHeader indexes into this by
// the real section index, so a mismatch here silently mislabels which
// section's progress the bar is showing.
export const ALL_SECTION_LABELS = [
  "About You",
  "Verify",
  "Skin Photo",
  "Your Skin",
  "Personal Context",
  "Diet & Hydration",
  "Sun Protection",
  "Get Your Results",
];

// Gender remains a real, useful branch — only the old age-bucket branches
// (onset/30+/45+/menopause) are gone, folded into female_skin_context's
// "going through or past menopause" option instead of a separate
// age-gated question.
const isFemale = (answers: SkinCheckAnswers) => answers.gender === "female";
const isMale = (answers: SkinCheckAnswers) => answers.gender === "male";

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
    // Sign-in, after the under-18 gate and before any camera or scan request.
    // This array's order is the invariant.
    id: "verify",
    label: "VERIFY",
    steps: [
      {
        id: "phone_verify",
        type: "phone",
        prompt: "Before we look at your skin, {name} — let's confirm it's you.",
        note: "Enter your WhatsApp number. We'll verify it before your photo is taken or analysed, and use it to send your results.",
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
        // Owner 2026-10-10 (TD-33): reads right whether the questions come after the photo or were skipped.
        prompt: "Next, a quick photo of your face, so we can read your skin.",
        note: "Face the camera in good light. This stays on your device until you save your results.",
      },
    ],
  },
  {
    id: "your-skin",
    label: "YOUR SKIN",
    steps: [
      {
        // Multi-select (max 3), replacing the old single-select
        // `primary_concern`. Values are unchanged from the old question
        // (blemishes/redness/pigment/texture/pores/hydration/oiliness) —
        // that vocabulary is shared with BandableMetric/METRIC_LABELS
        // (lib/skin-check-rules.ts, lib/skin-check-skus.ts), so only the
        // labels and the multi-select shape changed here.
        id: "primary_concerns",
        type: "multi-select-cards",
        prompt: "What are your main skin concerns?",
        maxSelections: 3,
        options: [
          { value: "blemishes", label: "Breakouts" },
          { value: "pigment", label: "Dark marks" },
          { value: "redness", label: "Redness" },
          { value: "texture", label: "Uneven texture" },
          { value: "pores", label: "Visible pores" },
          { value: "hydration", label: "Dryness" },
          { value: "oiliness", label: "Excess oil" },
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
        // Replaces `breakouts` — same underlying idea (breakout texture/
        // severity pattern) in plain language instead of dermatological
        // terms, plus the old combined "marks_scars" option split into two
        // clearer ones. New id because this is a genuinely different value
        // vocabulary, not just a relabel — see the id-rename audit in the
        // engineering report. No downstream code reads the old `breakouts`
        // values (verified: only raw JSONB storage did), so nothing else
        // needed to change for this rename.
        id: "breakout_pattern",
        type: "multi-select-cards",
        prompt: "What do your breakouts usually look like?",
        options: [
          {
            value: "small_bumps",
            label: "Small bumps or clogged pores",
            image: { src: "/quiz/breakout-small-bumps.svg", alt: "Small raised bumps and blocked pores on the skin surface." },
          },
          {
            value: "red_inflamed",
            label: "Red or inflamed pimples",
            image: { src: "/quiz/breakout-red-inflamed.svg", alt: "Raised bumps, each with a swollen ring around it." },
          },
          {
            value: "deep_painful",
            label: "Deep or painful breakouts",
            image: { src: "/quiz/breakout-deep-painful.svg", alt: "Seen from the side: a large bump deep under the skin surface." },
          },
          {
            value: "leaves_dark_marks",
            label: "Breakouts that leave dark marks",
            image: { src: "/quiz/breakout-dark-marks.svg", alt: "Flat darker marks left on the skin." },
          },
          {
            value: "leaves_scars",
            label: "Breakouts that leave scars or indentations",
            image: { src: "/quiz/breakout-scars.svg", alt: "Seen from the side: small dips in the skin surface." },
          },
        ],
      },
      {
        id: "acne_areas",
        type: "body-map",
        prompt: "Where do you usually get breakouts?",
        maxSelections: 6,
        options: [
          { value: "forehead", label: "Forehead" },
          { value: "nose", label: "Nose" },
          { value: "cheeks", label: "Cheeks" },
          { value: "chin_jawline", label: "Chin / jawline" },
          { value: "neck", label: "Neck" },
          { value: "shoulders_back_chest", label: "Chest / shoulders / back" },
        ],
      },
      {
        id: "pih_scar_tendency",
        type: "single-select-chips",
        prompt: "When a breakout heals, what usually happens after?",
        options: [
          { value: "fades_no_trace", label: "Fades with no trace" },
          { value: "dark_mark_fades", label: "Leaves a dark mark that fades over time" },
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
        id: "current_products",
        type: "multi-select-cards",
        prompt: "What are you currently using on your skin?",
        exclusiveValue: "none",
        options: [
          { value: "none", label: "Nothing right now" },
          { value: "cleanser_moisturizer", label: "Cleanser & moisturizer" },
          { value: "actives", label: "Actives", description: "Retinoids, AHA/BHA, vitamin C, etc." },
          { value: "prescription", label: "A prescription product" },
          // TD-33 (2): new in questionnaire version 2, for the second name box.
          { value: "other_products", label: "Other products" },
        ],
        // TD-33 (2): the only two free-text fields. Shown under the option while
        // it is picked; stored as productNames, never in answers.
        nameBoxes: {
          prescription: "Which prescription product? (optional)",
          other_products: "Which other products? (optional)",
        },
      },
    ],
  },
  {
    id: "personal-context",
    label: "PERSONAL CONTEXT",
    steps: [
      {
        // Consolidates the old cycle_regularity, cycle_acne_correlation,
        // pcos_symptom_screen, pregnancy_breastfeeding_status, and
        // contraception_type questions into one multi-select. The old
        // pregnancy/breastfeeding question was flagged in code as a
        // "safety-gate field" — audited before this consolidation: no rule
        // engine, prompt, or route in this repo actually branches on it
        // today (lib/skin-check-rules.ts's SKU selection is driven only by
        // photo scores), so nothing active is being weakened. The signal
        // itself is preserved via the "pregnant_or_breastfeeding" option
        // below so it's still collected for whenever that gate is built.
        id: "female_skin_context",
        type: "multi-select-cards",
        prompt: "Are there any hormonal or reproductive factors that may be affecting your skin right now?",
        note: "This helps us personalize your skin recommendations. It isn't a diagnosis.",
        condition: isFemale,
        exclusiveValue: "none_not_sure",
        options: [
          { value: "period_related_breakouts", label: "My breakouts change around my period" },
          { value: "irregular_periods", label: "My periods are irregular" },
          { value: "hormonal_contraception", label: "I'm using hormonal contraception" },
          { value: "pregnant_or_breastfeeding", label: "I'm currently pregnant or breastfeeding" },
          { value: "menopause", label: "I'm going through or past menopause" },
          { value: "none_not_sure", label: "None of these / not sure" },
        ],
      },
      {
        // Consolidates the old shaving_area_involvement and
        // sweat_gear_exposure questions.
        id: "male_skin_context",
        type: "multi-select-cards",
        prompt: "Are there any patterns that seem to affect your facial breakouts or irritation?",
        condition: isMale,
        exclusiveValue: "none_not_sure",
        options: [
          { value: "shaving_irritation", label: "Shaving often causes bumps or irritation" },
          { value: "sweat_gear_irritation", label: "Sweat, helmets, or tight collars make my skin worse" },
          { value: "exercise_sweat_breakouts", label: "Exercise or heavy sweating seems to trigger breakouts" },
          { value: "none_not_sure", label: "None of these / not sure" },
        ],
      },
      {
        // Consolidates the old sleep_quality, stress_level,
        // sweat_humidity_exposure, and smoking questions. Smoking is
        // deliberately not reinstated as its own question — no downstream
        // logic in this repo depends on it.
        id: "skin_factors",
        type: "multi-select-cards",
        prompt: "What has been affecting your skin lately?",
        exclusiveValue: "nothing_noticeable",
        options: [
          { value: "stress", label: "Stress" },
          { value: "poor_sleep", label: "Poor or inconsistent sleep" },
          { value: "heat_humidity_sweat", label: "Heat, humidity, or sweating" },
          { value: "recent_diet_changes", label: "Recent diet changes" },
          { value: "nothing_noticeable", label: "Nothing noticeable" },
        ],
      },
    ],
  },
  {
    id: "diet-hydration",
    label: "DIET & HYDRATION",
    steps: [
      {
        id: "diet",
        type: "multi-select-cards",
        prompt: "Which of these are a regular part of your diet?",
        note: "We're looking for patterns that may be relevant to your skin — not reasons to restrict your diet.",
        exclusiveValue: "none",
        options: [
          { value: "dairy", label: "Dairy / milk" },
          { value: "whey_protein", label: "Whey protein" },
          { value: "sugar_desserts", label: "Sugary foods or desserts" },
          { value: "fried_packaged", label: "Fried or packaged foods" },
          { value: "none", label: "None of these" },
        ],
      },
      {
        id: "water_intake",
        type: "segmented-slider",
        prompt: "How much water do you usually drink in a day?",
        options: [
          { value: "lt1", label: "Less than 1 L", sublabel: "" },
          { value: "1to2", label: "1–2 L", sublabel: "" },
          { value: "2to3", label: "2–3 L", sublabel: "" },
          { value: "gt3", label: "More than 3 L", sublabel: "" },
          { value: "not_sure", label: "Not sure", sublabel: "" },
        ],
      },
    ],
  },
  {
    id: "sun-protection",
    label: "SUN PROTECTION",
    steps: [
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
    ],
  },
  {
    id: "get-your-results",
    label: "GET YOUR RESULTS",
    steps: [
      {
        id: "final_phone",
        type: "phone",
        // The user is already signed in here: an explicit "Get my results"
        // tap writes the finished scan to Firestore.
        savesScan: true,
        prompt: "That's everything, {name} — ready for your results?",
        note: "We'll send your personalised skin report to the number you verified.",
      },
    ],
  },
];
