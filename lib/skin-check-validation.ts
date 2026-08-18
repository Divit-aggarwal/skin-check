import type { StepAnswerValue, StepConfig } from "@/types/skin-check";

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidPhone(value: string) {
  const digits = normalizeDigits(value);
  return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
}

export function defaultAnswerFor(step: StepConfig): StepAnswerValue {
  return step.type === "multi-select-cards" || step.type === "body-map" ? [] : "";
}

export function isStepAnswerValid(step: StepConfig, value: StepAnswerValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!value.trim()) return false;
  if (step.type === "phone") return isValidPhone(value);
  return true;
}
