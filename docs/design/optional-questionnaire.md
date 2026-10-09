# Optional questionnaire, capture button, product-name boxes

Status: built on `feat/optional-questionnaire` (owner brief 2026-10-10, tracker TD-33).
Follows [system.md](system.md) and [map.md](map.md).

Owner decisions (TD-33):
1. The questionnaire is optional. The age question, every consent and phone sign-in stay required.
2. Free text only in two places: naming a prescription product and naming other products in use (replaces R-5 B "no free text" for those two fields only).
3. The capture button is redesigned. Capture logic and its quality checks do not change.

## 1. Optional questionnaire

### Where it sits

```
About you (name, age, gender) → [Before the questions] → Verify → Photo → questions… → Get your results
                                          └ skip ───────────────────→ Verify → Photo → Get your results
```

"Before the questions" is a flow screen, not a `SECTIONS` entry (it is not a question, and the
rules, Gemini inventory and progress labels all iterate `SECTIONS`). It comes right after About
you, after the under-18 confirm.

It says, in one card:
- **What for:** the questions tell us about your skin, habits and products, so Echo can explain
  your readings for you.
- **Why we ask:** a photo shows how your skin looks today; it cannot show what you use or what affects it.
- **How many / how long:** `questionCount(answers)` = the eligible steps in the question sections
  (`QUESTION_SECTION_IDS`: your-skin, personal-context, diet-hydration, sun-protection) for this
  user's answers, so it follows the gender branch (12 for female or male, 11 for other). Minutes =
  `ceil(count × SECONDS_PER_QUESTION / 60)`; `SECONDS_PER_QUESTION = 10` is the one estimate typed by hand.
- **What skipping means (honest):** you still get your photo check and readings; **Echo cannot
  answer questions about your check until the questions are done**; you can answer them later from
  Home or Account.
- Two buttons: **Answer the questions now** (primary) and **Skip for now** (secondary).

### Data

`skinChecks/{scanId}` (client-written, create-only, unchanged rules otherwise) gains:

| Field | Value |
|---|---|
| `questionnaire` | `"answered"` or `"skipped"` |
| `questionnaireVersion` | `2` (absent on older records = version 1) |
| `productNames` | optional `{ prescription?: string, other?: string }`, see §3 |

A skipped check's `answers` holds only name, age and gender.

**Answering later** never edits the check (skinChecks stays create-only, DATA_MODEL; immutable
history). It writes one create-only document `users/{uid}/laterAnswers/{scanId}`:
`{ scanId, answers (question-section steps only), productNames?, questionnaireVersion: 2, createdAt }`.
Rules: owner only, not erased, not under 18, the check exists and says `"skipped"`, no update or delete.

Readers merge `{...check.answers, ...later.answers}` when the check is skipped:
- `loadTrustedEchoContext` (server, Echo both paths),
- `latestSkinCheckAnswers` (reuse for the next check),
- the dashboard (`laterAnswers` is loaded with checks and analyses).

Target of "answer later": the check Echo talks about (`echoScanId`, the newest reading) when it was
skipped and has no later answers; otherwise the newest check, under the same condition. Answering a
check Echo does not use would never unlock Echo.

### Echo with no answers (rule kept exactly)

F11 is unchanged: a check with no questionnaire rule answer gets the fixed reply plus
"Finish the Skin Check questions for this check, so Echo can help with your questions." and no
Gemini call. A skipped check still holds `gender` (a rule field), so the trusted loader returns
`answers: {}` when no question-section step is answered. That puts a skipped check on the F11 path
by the answers themselves, not by the client's `questionnaire` flag.

The Echo page shows a notice for such a check ("Echo can answer once the questions for this check
are done", link "Answer the questions").

### Returning users

| Last check | New check |
|---|---|
| answered (at the check or later) | as today: reuse, start at Verify, re-confirm `current_products` and `female_skin_context` |
| skipped, no later answers | name, age, gender reused; lands on "Before the questions"; no re-confirm steps. Answer now = every question, blank, no "Last time" hints |

### Places that assumed answers exist

| Place | Behaviour with no answers |
|---|---|
| Flow (`isSkipped`, `reusableAnswers`) | question sections skipped on skip; reuse handles a skipped last check |
| Saving a check (`saveSkinCheck`) | writes `questionnaire: "skipped"`, basic answers only |
| Echo (trusted context, F11) | `answers: {}` → fixed reply + finish line, no Gemini call |
| Safety check (`evaluateSafety`) | throws on no rule field → F11 fallback (no "no red flag" claim) |
| Rules engine (`recommend`) | off in production; with missing fields gives `needsAnswers` (existing) |
| Dashboard / Home | "Answer the questions" card when the newest check is skipped |
| Echo session (`newestEchoSession`) | carries `questionsDone`; Echo page shows the notice |
| History / opened check | unaffected (kinds come from readings); opened check shows "Questions skipped" or the product names |
| Results screen | readings as before; a line and link to answer the questions |

## 2. Capture button

The capture logic (`handleCapture`, `handleNativeFileChange`, the gate, consents, `runSkinScan`)
is unchanged. What changes is when the camera is asked for and what each state says.

| State | Laptop (getUserMedia) | Phone (native camera input) |
|---|---|---|
| Before permission | Face outline panel. Button **Open camera** (camera icon). Line: "Opens your camera to take one photo of your face. Your browser will ask to use the camera: choose Allow." | Button **Open camera**. Line: "Opens your phone's camera to take one photo of your face. If your browser asks to use the camera, choose Allow." |
| Camera loading | `role="status"` "Starting your camera…", spinner | (the phone camera app is open) |
| Ready | Live preview, button **Take photo** (camera icon), focus moves to it | n/a |
| Refused | `role="alert"` "Camera access is blocked." + how to allow it (laptop: the camera icon in the address bar; iPhone: Settings › Safari › Camera; Android: Chrome › ⋮ › Settings › Site settings › Camera) + **Try again** | A "Camera didn't open?" disclosure with the same phone steps, always under the button |
| After photo | Preview, **Retake photo** (secondary, icon), consents, gate line, **Analyze my skin** (as today) | same |
| Done | Thumbnail, "Photo saved for this check.", **Retake photo** | same |

All buttons are 52px (primary) / 48px (secondary), real `<button>`s, visible 2px focus ring;
status text in an `aria-live` region.

The laptop no longer asks for the camera the moment the step appears: it asks on **Open camera**.

## 3. Product-name boxes

`current_products` gains one option, `other_products` "Other products". Boxes:

| Option | Box label | Stored at |
|---|---|---|
| `prescription` "A prescription product" | "Which prescription product? (optional)" | `productNames.prescription` |
| `other_products` "Other products" | "Which other products? (optional)" | `productNames.other` |

- Shown under the option when it is picked; unpicking it (or picking "Nothing right now") hides the
  box and clears its text.
- Plain `<textarea>`, `maxLength=200`, visible counter "n / 200" (`aria-live="polite"` at the limit).
- One line under the box (legal review: tracker row): "Only you can see this, in this check. It is
  never sent to Echo or any AI, and is deleted with your account."
- Kept **out of `answers`** in the flow state, the draft and the record, so nothing that reads
  answers (Gemini, the rules, the hints, the hashes) can reach it.
- Never sent to Gemini (inventory pin tests), never logged, never read by safety or rules
  (the option value is), deleted by the account erase (it lives under `users/{uid}`), shown only on
  the user's own opened check.
- Rules: `productNames` is absent or a map with keys only `prescription`/`other`, each a string of
  1–200 characters, and only when `answers.current_products` holds the matching option; the same
  on `laterAnswers`. Owner only (existing path rule).
- `questionnaireVersion` 2 marks records that can hold `other_products` and `productNames`.
- `current_products` is re-confirmed on every check, so names never carry into the next check.

## 4. Edge cases

- Under 18: the confirm and block come before "Before the questions"; nothing changes there.
- Back from "Before the questions" goes to About you; back from Verify goes to "Before the questions".
- A draft remembers the skip/answer choice (draft version 3; older drafts are discarded). It never
  holds the product names: like the phone number, they stay in memory only, so a refresh loses them
  and nothing typed outlives an account erase in localStorage or IndexedDB.
- The names never enter the shared session object that travels to /echo.
- Length: the box and the rules must count the same thing. Tested on the emulator with 200
  Devanagari characters and with emoji (see §3).
- Answer later on a check whose analysis failed: allowed; Echo only ever talks about the newest reading.
- Old bundle writing a record without `questionnaire`: read as answered (today's behaviour).
- A tampered client marking a check "answered" with only basic details still gets the F11 reply.
