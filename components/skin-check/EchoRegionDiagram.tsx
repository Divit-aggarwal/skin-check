"use client";

import { ECHO_REGIONS, ECHO_REGION_LABELS, type EchoRegion } from "@/lib/echo-regions";

interface HotspotRect {
  region: EchoRegion;
  top: string;
  left: string;
  width: string;
  height: string;
}

// Non-overlapping grid over the face outline below: a forehead band, a
// cheek/nose/cheek row, then chin — matches the 4 zones the skin-scan
// pipeline actually masks (lib/echo-regions.ts). Cheeks render as two
// buttons (left + right, for a natural face-shaped hit area) that both map
// to the SAME "cheeks" region — the pipeline has no real L/R split, so both
// buttons open the identical thread grounded in the identical score data,
// not two different readings.
const HOTSPOTS: HotspotRect[] = [
  { region: "forehead", top: "6%", left: "22%", width: "56%", height: "22%" },
  { region: "cheeks", top: "40%", left: "6%", width: "32%", height: "26%" },
  { region: "nose", top: "38%", left: "40%", width: "20%", height: "30%" },
  { region: "cheeks", top: "40%", left: "62%", width: "32%", height: "26%" },
  { region: "chin", top: "70%", left: "30%", width: "40%", height: "18%" },
];

interface EchoRegionDiagramProps {
  onSelectRegion: (region: EchoRegion) => void;
  activeRegion?: EchoRegion | null;
}

// Custom hand-built face diagram (CLAUDE.md: Shadcn first, custom only when
// provably needed — no primitive covers a clickable anatomical hotspot map,
// same reasoning as ScoreRadar's SVG). The face outline is decorative SVG
// line-art in the same low-opacity #1A1A1A convention as ScoreRadar's web
// rings; the 4 zones are real <button>s layered on top for touch/keyboard
// accessibility and guaranteed tap size on small viewports, not clickable
// SVG shapes.
export function EchoRegionDiagram({ onSelectRegion, activeRegion }: EchoRegionDiagramProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[4/5] w-full max-w-[280px]">
        <svg
          viewBox="0 0 200 250"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <ellipse cx="100" cy="128" rx="66" ry="92" fill="#FAF4EF" stroke="#1A1A1A" strokeOpacity={0.15} strokeWidth={1.5} />
          {/* eyes */}
          <ellipse cx="72" cy="112" rx="10" ry="5" fill="none" stroke="#1A1A1A" strokeOpacity={0.18} strokeWidth={1.5} />
          <ellipse cx="128" cy="112" rx="10" ry="5" fill="none" stroke="#1A1A1A" strokeOpacity={0.18} strokeWidth={1.5} />
          {/* nose bridge */}
          <path d="M100 118 L92 155 Q100 161 108 155 Z" fill="none" stroke="#1A1A1A" strokeOpacity={0.18} strokeWidth={1.5} />
          {/* mouth */}
          <path d="M80 185 Q100 195 120 185" fill="none" stroke="#1A1A1A" strokeOpacity={0.18} strokeWidth={1.5} />
        </svg>

        {HOTSPOTS.map(({ region, top, left, width, height }, i) => {
          const active = activeRegion === region;
          return (
            <button
              key={`${region}-${i}`}
              type="button"
              onClick={() => onSelectRegion(region)}
              aria-pressed={active}
              aria-label={`${ECHO_REGION_LABELS[region]} — ask Echo about this area`}
              style={{ top, left, width, height }}
              className={
                "group absolute flex items-center justify-center rounded-2xl border border-dashed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2 " +
                (active
                  ? "border-[#E02D79]/50 bg-[#E02D79]/15"
                  : "border-[#1A1A1A]/10 bg-white/0 hover:border-[#98415A]/35 hover:bg-[#98415A]/8 active:bg-[#98415A]/15")
              }
            >
              <span
                className={
                  "rounded-full px-2.5 py-1 text-[0.6875rem] font-medium shadow-sm transition-colors " +
                  (active
                    ? "bg-[#E02D79] text-white"
                    : "bg-white text-[#1A1A1A]/70 group-hover:text-[#98415A]")
                }
              >
                {ECHO_REGION_LABELS[region]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="max-w-[85%] text-center text-xs text-[#1A1A1A]/45">
        Tap a zone to ask Echo about your {ECHO_REGIONS.map((r) => ECHO_REGION_LABELS[r].toLowerCase()).join(", ")}.
      </p>
    </div>
  );
}
