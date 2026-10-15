interface ProgressHeaderProps {
  sectionLabels: string[];
  activeSectionIndex: number;
  activeSectionFill: number; // 0-1, progress within the active section
  activeSectionLabel: string;
  /** The start of a check (05) has a title and no parts yet. */
  showBar?: boolean;
}

// "SKIN PHOTO" → "Skin photo": the redesign's sentence-case titles (TD-50).
const sentence = (label: string) => label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();

export function ProgressHeader({
  sectionLabels,
  activeSectionIndex,
  activeSectionFill,
  activeSectionLabel,
  showBar = true,
}: ProgressHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {showBar && (
        <>
          <div className="flex gap-1.5" aria-hidden>
            {sectionLabels.map((label, i) => {
              const fill = i < activeSectionIndex ? 1 : i === activeSectionIndex ? activeSectionFill : 0;
              return (
                <div key={label} className="h-1 flex-1 overflow-hidden rounded-full bg-brand-border">
                  <div
                    className="h-full rounded-full bg-brand-700 transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${fill * 100}%` }}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-text-muted">
            Part {activeSectionIndex + 1} of {sectionLabels.length}
          </p>
        </>
      )}
      {/* The page's one h1: the part of the check the user is in. */}
      {/* The start of a check (05) has the mockup's larger title. */}
      <h1 className={showBar ? "text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-text text-balance sm:text-[32px]" : "text-[34px] font-bold leading-[1.05] tracking-[-0.025em] text-brand-text text-balance"}>
        {sentence(activeSectionLabel)}
      </h1>
    </div>
  );
}
