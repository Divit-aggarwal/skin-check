// A question as plain editorial text, not a chat bubble (the name is historical).
export function EchoBubble({ message }: { message: string }) {
  return (
    <p className="font-display text-2xl font-semibold leading-snug text-brand-ink sm:text-[1.75rem]">
      {message}
    </p>
  );
}
