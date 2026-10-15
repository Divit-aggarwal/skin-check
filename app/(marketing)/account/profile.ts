import { SECTIONS } from "@/lib/skin-check-steps";
import { hasQuestionAnswers } from "@/lib/skin-check-validation";
import { checkAnswers, toDate, type Doc } from "@/components/dashboard/state";
import type { StepAnswerValue } from "@/types/skin-check";

// Mockup 21 (G37): the profile shows stored fields only. Answers are written by
// the browser, so a value is shown only as one of our own option labels (an
// unknown value is dropped); the name is the user's own typed text. Never the
// hormonal context questions or product names (shared-screen privacy, as H38).

export const ABOUT_FIELDS = ["name", "age", "gender"] as const;
export const SKIN_FIELDS = ["skin_type", "primary_concerns", "skin_tone", "skin_factors"] as const;
export type ProfileField = (typeof ABOUT_FIELDS)[number] | (typeof SKIN_FIELDS)[number];

const STEPS = new Map(SECTIONS.flatMap((s) => s.steps).map((s) => [s.id, s]));

/** One answer as our option labels ("Combination", "18–24"); the name as typed. Empty when nothing usable. */
export function answerText(id: ProfileField, value: StepAnswerValue | undefined): string {
  const step = STEPS.get(id);
  if (!step || value === undefined) return "";
  if (step.type === "text") return typeof value === "string" ? value.trim().slice(0, 60) : "";
  if (!("options" in step)) return "";
  const options: readonly { value: string; label: string }[] = step.options;
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((v) => options.find((o) => o.value === v)?.label ?? []).join(", ");
}

export interface Profile {
  about: { id: (typeof ABOUT_FIELDS)[number]; text: string }[];
  skin: { id: (typeof SKIN_FIELDS)[number]; text: string }[];
}

/** About-you from the newest check; skin answers from the newest check that has question answers (own or given later). */
export function profileFrom(checks: readonly Doc[], laterAnswers: readonly Doc[]): Profile {
  const sorted = [...checks].sort((a, b) => (toDate(b.data.createdAt)?.getTime() ?? Infinity) - (toDate(a.data.createdAt)?.getTime() ?? Infinity));
  const newest = sorted[0] ? checkAnswers(sorted[0].id, checks, laterAnswers) : {};
  const withAnswers = sorted.map((c) => checkAnswers(c.id, checks, laterAnswers)).find((a) => hasQuestionAnswers(a)) ?? {};
  return {
    about: ABOUT_FIELDS.map((id) => ({ id, text: answerText(id, newest[id]) })).filter((f) => f.text),
    skin: SKIN_FIELDS.map((id) => ({ id, text: answerText(id, withAnswers[id]) })).filter((f) => f.text),
  };
}

/** Up to two initials from the typed name, for the avatar; "" when none. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
