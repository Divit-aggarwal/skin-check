import type { KeyboardEvent } from "react";
import { ECHO_REGIONS, type EchoRegion } from "@/lib/echo-regions";

// Shapes and label positions in the 280 x 330 drawing. Labels sit inside
// their areas, so there are no pointer lines.
const AREAS: Record<EchoRegion, { shapes: JSX.Element[]; text: [number, number][] }> = {
  forehead: { shapes: [<rect key="f" x="76" y="52" width="128" height="52" rx="24" />], text: [[140, 83]] },
  nose: { shapes: [<rect key="n" x="118" y="116" width="44" height="82" rx="22" />], text: [[140, 161]] },
  cheeks: {
    shapes: [<ellipse key="l" cx="85" cy="196" rx="29" ry="27" />, <ellipse key="r" cx="195" cy="196" rx="29" ry="27" />],
    text: [
      [85, 200],
      [195, 200],
    ],
  },
  chin: { shapes: [<ellipse key="c" cx="140" cy="276" rx="44" ry="22" />], text: [[140, 280]] },
};

/**
 * An abstract face with the four areas the pipeline reads. Each area that has
 * a reading is a button (tap, click, Enter or Space); choosing the chosen area
 * again goes back to the whole face. The chosen area gets the brand tint and a
 * solid green outline; keyboard focus gets a thicker solid outline. Only the
 * choice changes the look: nothing is coloured by band (system.md §2).
 */
export function FaceDrawing({
  selected,
  labels,
  available,
  onSelect,
}: {
  selected: EchoRegion | null;
  labels: Record<EchoRegion, string>;
  /** Areas with a reading. Any other area is drawn faint and cannot be chosen. */
  available: readonly EchoRegion[];
  onSelect: (region: EchoRegion | null) => void;
}) {
  const choose = (r: EchoRegion) => onSelect(selected === r ? null : r);
  const keys = (r: EchoRegion) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(r);
    }
  };

  return (
    <svg viewBox="0 0 280 330" className="mx-auto block h-auto w-full max-w-[240px] select-none font-body sm:max-w-[300px]">
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
        const on = selected === r;
        return (
          <g
            key={r}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={labels[r]}
            onClick={() => choose(r)}
            onKeyDown={keys(r)}
            className="group cursor-pointer outline-none"
          >
            <g
              className={
                on
                  ? "fill-brand-mist stroke-brand-forest [stroke-width:2.5] group-focus-visible:[stroke-width:4]"
                  : "fill-white stroke-brand-ink [stroke-dasharray:5_4] [stroke-width:1.25] group-hover:fill-brand-mist group-focus-visible:stroke-brand-forest group-focus-visible:[stroke-dasharray:none] group-focus-visible:[stroke-width:3]"
              }
            >
              {shapes}
            </g>
            {text.map(([x, y]) => (
              <text
                key={`${x}-${y}`}
                aria-hidden
                x={x}
                y={y}
                textAnchor="middle"
                fontSize="12.5"
                fontWeight={on ? 700 : 600}
                className={on ? "fill-brand-forest" : "fill-brand-ink"}
              >
                {labels[r]}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
