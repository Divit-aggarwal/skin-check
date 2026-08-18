import { healthValue } from "@/lib/skin-check-score";
import type { SkinScanScores } from "@/types/skin-scan";

const CATEGORY_LABELS: Record<keyof SkinScanScores, string> = {
  redness: "Redness",
  oiliness: "Oiliness",
  texture: "Texture",
  pores: "Pores",
  blemishes: "Blemishes",
  hydration: "Hydration",
  pigment: "Pigment",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as (keyof SkinScanScores)[];
const COUNT = CATEGORY_ORDER.length;

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 80; // radius representing a health value of 1
const LEVELS = 4; // concentric web rings
const LABEL_RADIUS = RADIUS + 20;

// 0deg is 12 o'clock, increasing clockwise — same convention as the rest of
// this dashboard's hand-rolled SVG.
function polarPoint(radius: number, index: number) {
  const angleDeg = (index * 360) / COUNT;
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angleRad), y: CENTER + radius * Math.sin(angleRad) };
}

function polygonPoints(radius: number): string {
  return CATEGORY_ORDER.map((_, i) => {
    const { x, y } = polarPoint(radius, i);
    return `${x},${y}`;
  }).join(" ");
}

// Anchors labels away from the chart center so text grows outward rather
// than back over the plot, with a small dead zone near vertical so
// top/bottom labels center rather than nudging one way arbitrarily.
function labelAnchor(x: number): "start" | "middle" | "end" {
  if (x > CENTER + 4) return "start";
  if (x < CENTER - 4) return "end";
  return "middle";
}

interface ScoreRadarProps {
  scores: SkinScanScores;
}

// Custom SVG radar/spider chart — hand-built, no charting library, so the
// existing brand palette (magenta/rosewood/blush) drives every stroke/fill
// directly, same approach as the rest of this dashboard's SVG (the sub-score
// tiles' plain img grid). Replaces the earlier activity-ring version, which
// read oddly in practice despite testing correctly on paper. Same
// health-oriented convention as the composite score above it (hydration
// as-is, the other 6 inverted) so "further out on every axis = healthier."
export function ScoreRadar({ scores }: ScoreRadarProps) {
  const dataPoints = CATEGORY_ORDER.map((key, i) => {
    const health = Math.max(0, Math.min(1, healthValue(scores, key)));
    return polarPoint(RADIUS * health, i);
  });
  const dataPointsString = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[320px]"
        role="img"
        aria-label="Radar chart across all 7 signals"
      >
        {/* Web rings */}
        {Array.from({ length: LEVELS }).map((_, level) => (
          <polygon
            key={level}
            points={polygonPoints((RADIUS * (level + 1)) / LEVELS)}
            fill="none"
            stroke="#1A1A1A"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}

        {/* Spokes */}
        {CATEGORY_ORDER.map((_, i) => {
          const { x, y } = polarPoint(RADIUS, i);
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="#1A1A1A"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={dataPointsString}
          fill="#E02D79"
          fillOpacity={0.22}
          stroke="#E02D79"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#98415A" />
        ))}

        {/* Labels */}
        {CATEGORY_ORDER.map((key, i) => {
          const { x, y } = polarPoint(LABEL_RADIUS, i);
          return (
            <text
              key={key}
              x={x}
              y={y}
              textAnchor={labelAnchor(x)}
              dominantBaseline="middle"
              fontSize={10.5}
              fontWeight={500}
              fill="#1A1A1A"
              fillOpacity={0.7}
            >
              {CATEGORY_LABELS[key]}
            </text>
          );
        })}
      </svg>

      <p className="text-xs text-[#1A1A1A]/45">Further out = healthier signal</p>
    </div>
  );
}
