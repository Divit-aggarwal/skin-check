import { ECHO_REGIONS, type EchoRegion } from "@/lib/echo-regions";

// Shapes and label positions in the 280 x 330 drawing. Labels sit inside
// their areas, so there are no pointer lines.
const AREAS: Record<EchoRegion, { shapes: JSX.Element[]; text: [number, number][] }> = {
  forehead: { shapes: [<rect key="f" x="76" y="52" width="128" height="52" rx="24" />], text: [[140, 83]] },
  nose: { shapes: [<rect key="n" x="118" y="116" width="44" height="82" rx="22" />], text: [[140, 161]] },
  cheeks: {
    shapes: [<ellipse key="l" cx="82" cy="196" rx="32" ry="27" />, <ellipse key="r" cx="198" cy="196" rx="32" ry="27" />],
    text: [
      [82, 201],
      [198, 201],
    ],
  },
  chin: { shapes: [<ellipse key="c" cx="140" cy="276" rx="44" ry="22" />], text: [[140, 280]] },
};

/**
 * An abstract face with the four areas the pipeline reads, labelled, so the
 * readings table below it can be read against it. A picture only (TD-39:
 * nothing to choose). An area without a reading is drawn faint. Nothing is
 * coloured by band (system.md §2).
 */
export function FaceDrawing({
  labels,
  available,
}: {
  labels: Record<EchoRegion, string>;
  /** Areas with a reading. Any other area is drawn faint. */
  available: readonly EchoRegion[];
}) {
  return (
    <svg role="img" aria-label="A drawing of a face with its four areas: forehead, nose, cheeks and chin" viewBox="0 0 280 330" className="mx-auto block h-auto w-full max-w-[240px] select-none font-body sm:max-w-[300px]">
      <g aria-hidden fill="none" stroke="#B0AAA2" strokeLinecap="round" strokeWidth="1.5">
        <path d="M140 16C78 16 40 62 40 130c0 88 46 186 100 186s100-98 100-186C240 62 202 16 140 16Z" fill="#FFFFFF" stroke="#2C2C2A" />
        <path d="M58 88c16-34 46-52 82-52s66 18 82 52" />
        <path d="M80 128q14-7 28 0M172 128q14-7 28 0" />
        <path d="M124 236q16 9 32 0" />
      </g>
      {ECHO_REGIONS.map((r) => {
        const { shapes, text } = AREAS[r];
        if (!available.includes(r)) {
          return (
            <g key={r} aria-hidden fill="none" stroke="#B0AAA2" strokeDasharray="3 5">
              {shapes}
            </g>
          );
        }
        return (
          <g key={r}>
            <g className="fill-white stroke-brand-ink [stroke-dasharray:5_4] [stroke-width:1.25]">{shapes}</g>
            {text.map(([x, y]) => (
              <text key={`${x}-${y}`} x={x} y={y} textAnchor="middle" fontSize="14" fontWeight={600} className="fill-brand-ink">
                {labels[r]}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
