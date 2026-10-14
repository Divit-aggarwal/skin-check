// Echo's mark (mockups 18, 19, TD-50): a soft brand-tinted circle with two
// eyes. Decorative only; it scales with `className` (the eyes are in %).
export function EchoMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block shrink-0 rounded-full border border-brand-100 bg-[radial-gradient(circle_at_50%_40%,#FFFFFF_0%,var(--brand-100)_75%)] ${className}`}
    >
      <span className="absolute left-[32%] top-[38%] h-[22%] w-[11%] rounded-full bg-brand-900" />
      <span className="absolute right-[32%] top-[38%] h-[22%] w-[11%] rounded-full bg-brand-900" />
    </span>
  );
}
