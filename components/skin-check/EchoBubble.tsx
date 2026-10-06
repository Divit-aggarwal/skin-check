// Editorial question/statement text — no chat avatar or speech-bubble
// shape. The name is kept (rather than renamed across every call site) but
// this no longer renders anything chat-like; PART 3 of the redesign brief
// is explicit that this shouldn't read as a chatbot.
export function EchoBubble({ message }: { message: string }) {
  return (
    <p className="font-display text-2xl font-semibold leading-snug text-brand-ink sm:text-[1.75rem]">
      {message}
    </p>
  );
}
