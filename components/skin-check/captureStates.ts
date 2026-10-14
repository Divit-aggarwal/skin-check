// G16 (TD-33 (3)): the capture step's camera states and every sentence they
// show, in one place for the unit and D-12 wording tests. The capture logic and its quality checks
// are unchanged; only what each state says and when the camera is asked for.

export const CAPTURE_COPY = {
  open: "Open camera",
  take: "Take photo",
  retake: "Retake photo",
  tryAgain: "Try again",
  // One short line under the button: what happens next, including the permission prompt.
  nextLaptop: "Opens your camera to take one photo of your face. Your browser may ask to use the camera: choose Allow.",
  nextPhone: "Opens your phone's camera to take one photo of your face. If your browser asks to use the camera, choose Allow.",
  loading: "Starting your camera…",
  ready: "Your camera is on. Face it in good light, then take the photo.",
  previewLabel: "Camera preview",
  refusedTitle: "Camera access is blocked.",
  unavailable: "We couldn't find a camera on this device.",
  failed: "Your camera didn't start. Close other apps that use it, then try again.",
  howTitle: "How to allow the camera",
  phoneHelp: "Camera didn't open?",
  how: [
    { device: "iPhone (Safari)", steps: "Tap aA in the address bar › Website Settings › Camera › Allow. Or open Settings › Safari › Camera › Allow." },
    { device: "Android (Chrome)", steps: "Tap the icon left of the web address › Permissions › Camera › Allow." },
    { device: "Laptop", steps: "Click the camera or lock icon in the address bar, choose Allow for the camera, then reload if asked." },
  ],
} as const;

/**
 * G16 (TD-33 (3)): which camera state the capture step shows. Pure, so every
 * state is a unit test. "start": nothing asked yet (the laptop asks for the
 * camera only on "Open camera"); the phone has no live preview, so it is
 * "start" until a photo comes back from its camera.
 */
export type CameraView = "start" | "loading" | "ready" | "refused" | "unavailable" | "failed" | "after";
export function cameraView(isMobile: boolean, status: string, hasCaptured: boolean): CameraView {
  if (hasCaptured) return "after";
  if (isMobile) return "start";
  if (status === "requesting") return "loading";
  if (status === "active") return "ready";
  if (status === "denied") return "refused";
  if (status === "unavailable") return "unavailable";
  if (status === "error") return "failed";
  return "start";
}

// Redesign 07 (TD-50): the quality gate's own result, shown after capture.
// Only the three checks the gate measures (C11: no live checks; pose, distance
// and framing are never measured, so they are never shown as passing). An
// unchecked photo (the light could not be measured) shows nothing.
export const GATE_COPY = {
  title: "Photo check",
  frameTitle: "Keep your face in the frame",
  checks: { exposure: "Light", blur: "Sharpness", resolution: "Photo size" },
  pass: "Fine",
  fail: "Retake",
  notMeasured: "Not checked",
} as const;

type GateCheck = { id: string; status: "pass" | "fail" | "not_measured" };
export type GateRow = { id: keyof typeof GATE_COPY.checks; label: string; status: GateCheck["status"] };
export function gateRows(quality: { verdict: string; checks: readonly GateCheck[] } | null | undefined): GateRow[] {
  if (!quality || quality.verdict === "unchecked") return [];
  return (Object.keys(GATE_COPY.checks) as GateRow["id"][]).flatMap((id) => {
    const c = quality.checks.find((x) => x.id === id);
    return c ? [{ id, label: GATE_COPY.checks[id], status: c.status }] : [];
  });
}
