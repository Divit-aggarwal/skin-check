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
      <p className="text-label font-semibold uppercase tracking-label text-blush">
        {activeSectionLabel}
      </p>
      <div className="mt-3 flex gap-1.5">
        {sectionLabels.map((label, i) => {
          const fill = i < activeSectionIndex ? 1 : i === activeSectionIndex ? activeSectionFill : 0;
          return (
            <div key={label} className="h-1 flex-1 overflow-hidden rounded-full bg-text/10">
              <div
                className="h-full rounded-full bg-text transition-[width] duration-300 ease-out"
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
