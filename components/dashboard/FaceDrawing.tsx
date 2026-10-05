import type { EchoRegion } from "@/lib/echo-regions";

/**
 * An abstract face in neutral ink with the four areas marked. The selected
 * area gets a solid outline; nothing is filled or coloured to mean anything
 * (docs/design/system.md §2). Decorative: the readings are in text beside it.
 */
export function FaceDrawing({ selected, labels }: { selected: EchoRegion | null; labels: Record<EchoRegion, string> }) {
  const ink = "#2C2C2A";
  const zone = (r: EchoRegion) => ({
    fill: "none",
    stroke: ink,
    strokeWidth: selected === r ? 2 : 1,
    strokeDasharray: selected === r ? undefined : "4 4",
    opacity: selected && selected !== r ? 0.45 : 1,
  });
  const text = (r: EchoRegion) => ({ fontSize: 13, fontWeight: selected === r ? 700 : 500, fill: ink, textAnchor: "middle" as const });
  const lead = (r: EchoRegion) => ({ stroke: ink, strokeWidth: 1, opacity: selected && selected !== r ? 0.45 : 1 });
  return (
    <svg width="300" height="292" viewBox="0 0 300 292" aria-hidden className="mx-auto block h-auto max-w-full shrink-0 font-body">
      <g transform="translate(30 0)">
        <path d="M120 22c-50 0-80 38-80 92 0 72 36 144 80 144s80-72 80-144c0-54-30-92-80-92Z" fill="#FFFFFF" stroke={ink} strokeWidth="1.5" />
        <path d="M48 92c14-30 40-44 72-44s58 14 72 44" fill="none" stroke="#B7A58F" strokeWidth="1.5" />
        <path d="M40 132c-10-2-12 26 2 30M200 132c10-2 12 26-2 30" fill="none" stroke={ink} strokeWidth="1.2" />
        <path d="M82 134q12-8 24 0M134 134q12-8 24 0" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M120 140v30q-8 6 0 10" fill="none" stroke={ink} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M100 212q20 12 40 0" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
        <rect x="70" y="60" width="100" height="50" rx="18" {...zone("forehead")} />
        <ellipse cx="74" cy="180" rx="22" ry="24" {...zone("cheeks")} />
        <ellipse cx="166" cy="180" rx="22" ry="24" {...zone("cheeks")} />
        <rect x="106" y="122" width="28" height="64" rx="14" {...zone("nose")} />
        <ellipse cx="120" cy="238" rx="28" ry="13" {...zone("chin")} />
      </g>
      <text x="150" y="90" {...text("forehead")}>{labels.forehead}</text>
      <line x1="164" y1="140" x2="252" y2="112" {...lead("nose")} />
      <text x="256" y="117" {...text("nose")} textAnchor="start">{labels.nose}</text>
      <line x1="90" y1="198" x2="36" y2="236" {...lead("cheeks")} />
      <text x="2" y="252" {...text("cheeks")} textAnchor="start">{labels.cheeks}</text>
      <line x1="210" y1="198" x2="264" y2="236" {...lead("cheeks")} />
      <text x="298" y="252" {...text("cheeks")} textAnchor="end">{labels.cheeks}</text>
      <text x="150" y="284" {...text("chin")}>{labels.chin}</text>
    </svg>
  );
}
