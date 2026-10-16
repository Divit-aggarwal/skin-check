// Screen 08 (E19): the weekly check-in's request and what each answer from
// POST /api/checkins means on screen. Pure apart from submitCheckin's fetch.

import { CHECKIN_QUESTIONS, CHECKINS_ROUTE, type CheckinAnswers } from "@/lib/feature-contracts/checkin";

export type CheckinOutcome = "saved" | "already" | "signed_out" | "not_allowed" | "too_many" | "failed";

/** The request body: only known questions and options (the server refuses anything else). */
export function checkinBody(answers: CheckinAnswers, scanId: string | null, timeZone: string) {
  const clean: CheckinAnswers = {};
  for (const q of CHECKIN_QUESTIONS) {
    const a = answers[q.id];
    if (a && q.options.some((o) => o.id === a)) clean[q.id] = a;
  }
  return { answers: clean, ...(scanId ? { scanId } : {}), timeZone };
}

export const canSubmitCheckin = (answers: CheckinAnswers) => Object.keys(checkinBody(answers, null, "UTC").answers).length > 0;

export function checkinOutcome(status: number): CheckinOutcome {
  if (status === 201 || status === 200) return "saved";
  if (status === 409) return "already";
  if (status === 401) return "signed_out";
  if (status === 403) return "not_allowed";
  if (status === 429) return "too_many";
  return "failed";
}

export async function submitCheckin(idToken: string, body: ReturnType<typeof checkinBody>): Promise<CheckinOutcome> {
  try {
    const res = await fetch(CHECKINS_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    return checkinOutcome(res.status);
  } catch {
    return "failed";
  }
}
