"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AlertCircle, Camera, Check, Ruler, ScanFace, Smile, Sun, Zap, type LucideIcon } from "lucide-react";
import { useCameraStream } from "@/hooks/useCameraStream";
import { getVideoLandmarker, meshAllowed } from "@/components/mesh/landmarks";
import { checkExposure } from "@/lib/capture-quality/exposure";
import { liveChecks, measureFace, LIVE_COPY, type FaceMeasure, type LandmarkPt } from "@/lib/capture-quality/live";
import { CAPTURE_QUALITY_SETTINGS } from "@/lib/capture-quality/settings";
import type { CaptureAngle, LiveCheckId, LiveChecks } from "@/lib/feature-contracts/check-photos";
import { Stepper, TintCard } from "@/components/ui/kit";
import { btnPrimary } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { CAPTURE_COPY as K, GATE_COPY as G, GUIDED_COPY as C, type GuidedFallback } from "../captureStates";

const ANGLES: readonly CaptureAngle[] = ["front", "left", "right"];
/** The preview box (5:6, mockup 07): the live checks measure what the user sees in it. */
const VIEW_RATIO = 5 / 6;
/** Width of the small copy of the frame the light check reads; enough for a mean and clip fractions. */
const LIGHT_SAMPLE_PX = 160;

type Landmarker = Awaited<ReturnType<typeof getVideoLandmarker>>;
export type GuidedPhotos = { front: Blob; left: Blob; right: Blob; frontFace: FaceMeasure | null };

/** Landmarks from the full video frame to the visible 3:4 box (object-cover crops the long side). */
function toView(points: readonly LandmarkPt[], vw: number, vh: number): LandmarkPt[] {
  const sx = Math.min(1, (vh * VIEW_RATIO) / vw);
  const sy = Math.min(1, vw / VIEW_RATIO / vh);
  return points.map((p) => ({ x: (p.x - 0.5) / sx + 0.5, y: (p.y - 0.5) / sy + 0.5 }));
}

/** C11: the four live checks on the camera stream, about 5 times a second. The newest face is in faceRef for the shutter. */
function useLiveChecks(videoRef: RefObject<HTMLVideoElement>, angle: CaptureAngle, lm: Landmarker | null, active: boolean) {
  const [live, setLive] = useState<LiveChecks | null>(null);
  const faceRef = useRef<FaceMeasure | null>(null);
  useEffect(() => {
    setLive(null);
    faceRef.current = null;
    if (!active || !lm) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let last = "";
    let ts = 0;
    const tick = () => {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      let points: LandmarkPt[] | null = null;
      try {
        // VIDEO mode needs a timestamp that always moves forward.
        ts = Math.max(ts + 1, performance.now());
        const found = lm.detectForVideo(v, ts).faceLandmarks[0];
        points = found ? toView(found, v.videoWidth, v.videoHeight) : null;
      } catch {
        points = null;
      }
      const face = measureFace(points);
      faceRef.current = face;
      let exposure = null;
      if (ctx) {
        const w = LIGHT_SAMPLE_PX;
        const h = Math.max(1, Math.round((v.videoHeight * w) / v.videoWidth));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        exposure = checkExposure({ width: w, height: h, data: ctx.getImageData(0, 0, w, h).data });
      }
      const next = liveChecks(angle, face, exposure);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setLive(next);
      }
    };
    const id = setInterval(tick, 1000 / CAPTURE_QUALITY_SETTINGS["live.fps"].value);
    return () => clearInterval(id);
  }, [videoRef, angle, lm, active]);
  return { live, faceRef };
}

const CHECK_ICON: Record<LiveCheckId, LucideIcon> = { lighting: Sun, position: Smile, distance: Ruler, face_clear: ScanFace };

function LiveCheckBadges({ live }: { live: LiveChecks | null }) {
  return (
    <ul aria-label={C.checksLabel} className="absolute right-3 top-3 flex flex-col gap-2.5">
      {(Object.keys(CHECK_ICON) as LiveCheckId[]).map((id) => {
        const state = live?.checks[id] ?? "unknown";
        const Icon = CHECK_ICON[id];
        return (
          <li key={id} className="flex flex-col items-center gap-1">
            <span className={cn("relative grid size-12 place-items-center rounded-full border-2 border-white/80 text-white", state === "ok" ? "bg-brand-700" : "bg-black/45")}>
              <Icon aria-hidden size={22} strokeWidth={1.75} />
              {state !== "unknown" && (
                <span aria-hidden className={cn("absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-white", state === "ok" ? "bg-brand-700" : "bg-brand-error")}>
                  {state === "ok" ? <Check size={11} strokeWidth={3} /> : <AlertCircle size={11} strokeWidth={3} />}
                </span>
              )}
            </span>
            <span className="text-xs font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
              {LIVE_COPY.labels[id]}
              <span className="sr-only">: {LIVE_COPY.states[state]}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * C10/C11 (screen 07), behind threeAngleUi(): Front, Left cheek and Right
 * cheek, each with the live checks. The shutter is never blocked by them (the
 * thresholds are provisional, C09); the gate after capture still runs. No
 * camera, a refusal, a model that will not load or a data-saver connection
 * hands back to today's one-photo capture with the reason.
 */
export function GuidedCapture({ onDone, onFallback }: { onDone: (photos: GuidedPhotos) => void; onFallback: (why: GuidedFallback) => void }) {
  const { videoRef, status, requestCamera, stopCamera } = useCameraStream();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lm, setLm] = useState<Landmarker | null>(null);
  const [step, setStep] = useState(0);
  const [shots, setShots] = useState<{ angle: CaptureAngle; blob: Blob; url: string; face: FaceMeasure | null }[]>([]);
  const angle = ANGLES[step]!;
  const { live, faceRef } = useLiveChecks(videoRef, angle, lm, status === "active");
  const shutterRef = useRef<HTMLButtonElement>(null);

  // The model starts loading at once, so a device that cannot run it falls back before the camera is asked for.
  useEffect(() => {
    if (!meshAllowed()) return onFallback("dataSaver");
    let active = true;
    getVideoLandmarker().then(
      (l) => active && setLm(l),
      () => active && onFallback("model")
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (status === "denied") onFallback("denied");
    else if (status === "unavailable") onFallback("unavailable");
    else if (status === "error") onFallback("failed");
    else if (status === "active") shutterRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  // Object URLs of the thumbnails go with the component.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !ctx || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const face = faceRef.current;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        const all = [...shots, { angle, blob, url, face }];
        setShots(all);
        if (all.length < ANGLES.length) return setStep(all.length);
        stopCamera();
        const by = (a: CaptureAngle) => all.find((s) => s.angle === a)!;
        onDone({ front: by("front").blob, left: by("left").blob, right: by("right").blob, frontFace: by("front").face });
      },
      "image/jpeg",
      0.92
    );
  }, [videoRef, faceRef, shots, angle, stopCamera, onDone]);

  const prev = shots[shots.length - 1];
  const nextAngle = ANGLES[step + 1];
  const ready = status === "active";
  return (
    <div className="flex flex-col gap-3">
      <Stepper steps={[...C.steps]} current={step} />
      <div>
        <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-brand-text">{C.title[angle]}</h2>
        <p className="mt-1 text-[17px] leading-snug text-brand-text-muted">{C.intro}</p>
      </div>
      <div className="relative -mx-1 aspect-[5/6] overflow-hidden rounded-card bg-brand-900">
        <video ref={videoRef} aria-label={K.previewLabel} aria-hidden={!ready} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="hidden" />
        {!ready && (
          <div aria-hidden className="absolute inset-0 grid place-items-center">
            {status === "requesting" ? <div className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" /> : <Camera className="size-10 text-white/60" />}
          </div>
        )}
        {/* Framing guide: corners only. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-[22%] inset-y-[24%]">
          <span className="absolute left-0 top-0 size-8 rounded-tl-lg border-l-[3px] border-t-[3px] border-white/90" />
          <span className="absolute right-0 top-0 size-8 rounded-tr-lg border-r-[3px] border-t-[3px] border-white/90" />
          <span className="absolute bottom-0 left-0 size-8 rounded-bl-lg border-b-[3px] border-l-[3px] border-white/90" />
          <span className="absolute bottom-0 right-0 size-8 rounded-br-lg border-b-[3px] border-r-[3px] border-white/90" />
        </div>
        {ready && live?.checks.lighting === "ok" && (
          <p className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-2 text-sm font-medium text-white">
            <Zap aria-hidden size={16} className="fill-current" />
            {LIVE_COPY.goodLight}
          </p>
        )}
        {ready && <LiveCheckBadges live={live} />}
      </div>
      <div aria-live="polite">
        <TintCard icon={ScanFace} title={G.frameTitle} body={ready ? (live ? live.hint ?? LIVE_COPY.ready : K.loading) : undefined} className="bg-brand-50 py-3 sm:py-3" />
      </div>
      {ready ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col items-center gap-1 justify-self-start">
            {prev && (
              <>
                <span className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the user's own photo, a transient object URL */}
                  <img src={prev.url} alt="" className="size-12 rounded-full object-cover" />
                  <span aria-hidden className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-white bg-brand-700 text-white">
                    <Check size={11} strokeWidth={3} />
                  </span>
                </span>
                <span className="text-sm font-medium text-brand-700">
                  {C.steps[ANGLES.indexOf(prev.angle)]}
                  <span className="sr-only"> ({C.done})</span>
                </span>
              </>
            )}
          </div>
          <button ref={shutterRef} type="button" onClick={shoot} className="grid size-[76px] place-items-center rounded-full border-4 border-brand-700 bg-brand-surface transition-colors duration-fast hover:bg-brand-50">
            <span aria-hidden className="size-14 rounded-full bg-brand-700" />
            <span className="sr-only">{C.takeAngle[angle]}</span>
          </button>
          <div className="flex flex-col items-center gap-1 justify-self-end">
            {nextAngle && (
              <>
                <span aria-hidden className="grid size-12 place-items-center rounded-full bg-brand-50 text-base font-semibold text-brand-text-muted">{step + 2}</span>
                <span className="text-sm text-brand-text-muted">
                  <span className="sr-only">{C.next}: </span>
                  {C.steps[step + 1]}
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => void requestCamera()} disabled={status === "requesting"} className={cn(btnPrimary, "w-full")}>
          <Camera aria-hidden className="size-5" />
          {status === "requesting" ? K.loading : K.open}
        </button>
      )}
    </div>
  );
}
