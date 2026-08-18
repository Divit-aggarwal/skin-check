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
      <p className="text-[length:var(--home-text-label,0.8125rem)] font-semibold uppercase tracking-[0.12em] text-[#98415A]/70">
        {activeSectionLabel}
      </p>
      <div className="mt-3 flex gap-1.5">
        {sectionLabels.map((label, i) => {
          const fill = i < activeSectionIndex ? 1 : i === activeSectionIndex ? activeSectionFill : 0;
          return (
            <div key={label} className="h-1 flex-1 overflow-hidden rounded-full bg-[#1A1A1A]/10">
              <div
                className="h-full rounded-full bg-[#98415A] transition-[width] duration-300 ease-out"
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
