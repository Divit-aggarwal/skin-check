import { ApiError } from "@/lib/api";

// One named list of retake reasons: on-device checks and engine refusals.
export const RETAKE_REASONS = [
  // on-device
  "too_dark",
  "too_bright",
  "blurry",
  "too_small",
  "too_far_or_close",
  "face_not_centred",
  "face_turned",
  "expression_not_neutral",
  // from the engine or the route, via /api/skin-scan
  "no_face_found",
  "unreadable_image",
  "engine_too_small",
  "engine_too_large",
] as const;
export type RetakeReason = (typeof RETAKE_REASONS)[number];

/** Instruction only: no number, score or comparison. */
export const RETAKE_COPY: Record<RetakeReason, string> = {
  too_dark: "Your photo is too dark. Face a window or a lamp.",
  too_bright: "Your photo is too bright. Move out of direct light.",
  blurry: "Your photo is blurry. Hold still and tap to focus.",
  too_small: "Your photo is too small. Use your camera at its normal size.",
  too_far_or_close: "Hold the camera at arm's length, with your face filling the frame.",
  face_not_centred: "Keep your face in the middle of the frame.",
  face_turned: "Look straight at the camera.",
  expression_not_neutral: "Keep a relaxed, neutral face.",
  no_face_found: "We couldn't find a face. Face the camera in good light.",
  unreadable_image: "We couldn't read that photo. Please take a new one.",
  engine_too_small: "That photo is too small to read. Please take a new one.",
  engine_too_large: "That photo is too large. Please take a new one with your camera.",
};

const SERVER_CODES: Record<string, RetakeReason> = {
  NO_FACE_DETECTED: "no_face_found",
  IMAGE_UNPARSEABLE: "unreadable_image",
  IMAGE_TOO_SMALL: "engine_too_small",
  IMAGE_DIMENSIONS_TOO_LARGE: "engine_too_large",
  IMAGE_TOO_LARGE: "engine_too_large",
};

/** null for anything that is not a photo problem: a retake would not fix it. */
export function retakeReasonFromServerCode(code: string | undefined | null): RetakeReason | null {
  return code && Object.hasOwn(SERVER_CODES, code) ? SERVER_CODES[code]! : null;
}

export function isRetakeError(err: unknown): err is ApiError & { code: string } {
  return err instanceof ApiError && retakeReasonFromServerCode(err.code) !== null;
}
