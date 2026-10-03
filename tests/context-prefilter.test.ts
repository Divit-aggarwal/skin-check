import { describe, expect, it } from "vitest";
import { comparisonHit, redFlagHit, REFERRAL_COPY } from "@/lib/context/prefilter";

// GEMINI_BOUNDARY §6 and §6b. A miss here means a red flag or a comparison
// question reaches Gemini; a false positive means an ordinary question is blocked.
describe("red-flag pre-filter (§6)", () => {
  it.each([
    // moles
    "my mole is bleeding",
    "a mole on my cheek is changing shape and getting darker",
    "there is a new mole with an irregular border",
    "til se khoon aa raha hai",
    "मेरे तिल से खून आ रहा है",
    // painful, cystic, nodular, scarring
    "I have deep cystic pimples on my chin",
    "bahut dard wale daane hai",
    "painful lumps under the skin",
    "is this scarring permanent",
    // hot, swollen, spreading, fever
    "my cheek is swollen and hot to the touch",
    "the rash is spreading and I have a fever",
    "chehre pe sujan hai aur bukhar",
    // eyes
    "my eye is swollen and red",
    "my eyelids itch after the cream",
    "aankh me jalan",
    // self-harm or distress
    "mujhe jeena nahi hai",
    "I want to die because of my skin",
    "I feel like hurting myself",
    "मुझे जीना नहीं है",
    // pregnancy plus actives
    "I'm pregnant, can I use retinol?",
    "is salicylic acid safe while breastfeeding",
    // under 18 or child
    "my daughter has acne, what should she use",
    "I'm 15 and have oily skin",
    "mere bete ke chehre pe daane",
    "mere beta ke chehre pe daane",
    // diagnosis, prescription, dosage
    "can you diagnose this?",
    "what dose of doxycycline should I take",
    "is this rosacea?",
    "koi dawai batao",
    // one plain English hit per family
    "this mole has an asymmetric shape",
    "I have a boil on my jaw",
    "there's pus coming out of a spot",
    "my vision is blurry since the rash",
    "I want to kill myself",
    "is niacinamide safe when pregnant",
    "my son is 12, can he use this",
    "can you prescribe something stronger",
  ])("hits: %s", (msg) => {
    expect(redFlagHit(msg)).toBe(true);
  });

  it.each([
    "is redness common?",
    "what does oiliness mean?",
    "what is texture irregularity?",
    "I have small bumps on my nose",
    "how should I wash my face?",
    "what does my forehead reading mean?",
    "I'm 25 and my skin is oily",
    "hello",
    "what can I do about shine on my nose",
  ])("passes: %s", (msg) => {
    expect(redFlagHit(msg)).toBe(false);
  });

  it("the referral copy carries no number (no unverified helpline ships)", () => {
    expect(REFERRAL_COPY).not.toMatch(new RegExp(String.raw`\p{Nd}`, "u"));
  });
});

describe("comparison-intent pre-filter (§6b)", () => {
  it.each([
    "last time redness was Elevated, now Moderate, am I better?",
    "is my skin getting worse?",
    "has my texture improved",
    "how is my progress",
    "did anything change since my last check",
    "compare this with my first scan",
    "is the serum working?",
    "pehle se behtar hai kya",
    "redness kam hua kya",
    "kya ye cream kaam kar rahi hai",
    "oil zyada hai kya",
    "क्या पहले से बेहतर है",
  ])("hits: %s", (msg) => {
    expect(comparisonHit(msg)).toBe(true);
  });

  it.each([
    "is redness common?",
    "what does oiliness mean?",
    "why is my forehead shiny?",
    "what do the bands mean",
    "how should I wash my face?",
  ])("passes: %s", (msg) => {
    expect(comparisonHit(msg)).toBe(false);
  });
});
