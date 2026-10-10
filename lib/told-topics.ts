import { SECTIONS } from "@/lib/skin-check-steps";
import { describeStepAnswerParts } from "@/lib/skin-check-format";
import { METRIC_LABELS, ANSWER_TOPICS, type AnswerTopic } from "@/lib/skin-check-skus";
import { hasQuestionAnswers } from "@/lib/skin-check-validation";
import type { SkinCheckAnswers } from "@/types/skin-check";

// TD-37 (3): Breakouts, Texture and Dark marks are shown as what the user told
// us in the questions, never as a reading. Only these questions, so a topic
// never shows an answer from the personal-context questions.
const TOPIC_QUESTIONS: Record<AnswerTopic, { stepId: string; lead: string }[]> = {
  blemishes: [
    { stepId: "breakout_pattern", lead: "What your breakouts usually look like" },
    { stepId: "acne_areas", lead: "Where you usually get breakouts" },
  ],
  texture: [],
  pigment: [{ stepId: "pih_scar_tendency", lead: "When a breakout heals" }],
};

const STEPS = new Map(SECTIONS.flatMap((s) => s.steps).map((step) => [step.id, step]));

export interface ToldTopic {
  topic: AnswerTopic;
  label: string;
  /** The user's own answers on this topic, as option labels. Empty: they said nothing on it. */
  lines: string[];
}

/**
 * The three topics, in a fixed order, from one check's answers (the check's
 * own plus any given later, merged by the caller). null when the questions
 * were skipped: the screen then invites the user to answer them.
 */
export function toldTopics(answers: SkinCheckAnswers | null | undefined): ToldTopic[] | null {
  if (!answers || !hasQuestionAnswers(answers)) return null;
  const concerns = Array.isArray(answers.primary_concerns) ? answers.primary_concerns : [];
  return ANSWER_TOPICS.map((topic) => {
    const lines: string[] = [];
    if (concerns.includes(topic)) lines.push(`You chose ${METRIC_LABELS[topic].toLowerCase()} as a main skin concern.`);
    for (const { stepId, lead } of TOPIC_QUESTIONS[topic]) {
      const step = STEPS.get(stepId);
      const parts = step ? describeStepAnswerParts(step, answers[stepId]) : [];
      if (parts.length > 0) lines.push(`${lead}: ${parts.join(", ")}.`);
    }
    return { topic, label: METRIC_LABELS[topic], lines };
  });
}
