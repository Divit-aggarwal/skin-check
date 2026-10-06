// Reuses the marketing nav's "+" brand mark as Echo's chat avatar.
export function EchoMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-block shrink-0 ${className}`}>
      <span className="absolute left-1/2 top-0 h-full w-[2.5px] -translate-x-1/2 rounded-full bg-brand-forest" />
      <span className="absolute left-0 top-1/2 h-[2.5px] w-full -translate-y-1/2 rounded-full bg-brand-forest" />
    </span>
  );
}
