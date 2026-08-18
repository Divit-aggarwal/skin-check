import { cn } from "@/lib/utils";

type ConfidenceLevel = "high" | "medium" | "low";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  className?: string;
}

const config: Record<ConfidenceLevel, { label: string; className: string }> = {
  high: {
    label: "High confidence",
    className: "bg-confidence-bg-high text-confidence-high dark:bg-confidence-high/15 dark:text-confidence-high",
  },
  medium: {
    label: "Medium confidence",
    className: "bg-confidence-bg-medium text-confidence-medium dark:bg-confidence-medium/15 dark:text-confidence-medium",
  },
  low: {
    label: "Low confidence",
    className: "bg-confidence-bg-low text-confidence-low dark:bg-confidence-low/15 dark:text-confidence-low",
  },
};

export function ConfidenceBadge({ level, className }: ConfidenceBadgeProps) {
  const { label, className: levelClass } = config[level];
  return (
    <span className={cn("confidence-badge", levelClass, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
