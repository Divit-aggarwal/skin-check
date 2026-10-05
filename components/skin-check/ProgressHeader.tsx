interface ProgressHeaderProps {
  sectionLabels: string[];
  activeSectionIndex: number;
  activeSectionFill: number; // 0-1, progress within the active section
  activeSectionLabel: string;
}

export function ProgressHeader({
  sectionLabels,
  activeSectionIndex,
  activeSectionFill,
  activeSectionLabel,
}: ProgressHeaderProps) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs font-semibold uppercase tracking-[0.06em] text-brand-forest">
        <span>{activeSectionLabel}</span>
        <span className="font-medium normal-case tracking-normal text-brand-muted">
          Part {activeSectionIndex + 1} of {sectionLabels.length}
        </span>
      </p>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {sectionLabels.map((label, i) => {
          const fill = i < activeSectionIndex ? 1 : i === activeSectionIndex ? activeSectionFill : 0;
          return (
            <div key={label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-linen2">
              <div
                className="h-full rounded-full bg-brand-action transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
