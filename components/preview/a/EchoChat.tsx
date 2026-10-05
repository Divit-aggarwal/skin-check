"use client";
// PREVIEW ONLY (direction A). Echo chat. Calls no API: Send only appends the
// user's message on this page. The context panel names the reading being
// discussed (date, kind, photo check) and links to it; band words stay on the
// opened check page, next to PAST_CHECK_LINE.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, SendHorizontal, UserRound } from "lucide-react";
import { A_COPY as A } from "./copy";
import { eyebrow, PhotoCheckLine } from "./ui";

type Msg = { id: string; role: "echo" | "user"; text: string };
export type EchoProps = {
  thread: Msg[];
  reading: { title: string; kind: string; photoCheck: string | null; href: string };
  regions: string[];
};

export function EchoChat({ thread, reading, regions }: EchoProps) {
  const [msgs, setMsgs] = useState(thread);
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [msgs]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMsgs((m) => [...m, { id: `local-${m.length + 1}`, role: "user", text }]);
    setDraft("");
  };
  const ask = (area: string) => {
    setDraft(A.echo.areaPrompt(area));
    input.current?.focus();
  };

  const chips = (
    <div role="group" aria-label={A.echo.areasTitle} className="flex flex-wrap gap-2">
      {regions.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => ask(r)}
          className="min-h-[44px] shrink-0 rounded-full border bg-[var(--a-paper)] px-4 text-[14px] font-medium hover:border-[var(--a-ink)]"
        >
          {r}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-var(--a-bar))] flex-col sm:h-dvh">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 sm:px-6 sm:py-5 lg:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-10 place-items-center rounded-full bg-[var(--a-mist)]">
            <span className="size-3 rounded-full bg-[var(--a-forest)]" />
          </span>
          <div>
            <h1 className="a-head text-[28px] font-semibold leading-[1.15] sm:text-[36px]">{A.echo.title}</h1>
            <p className="text-[14px] text-[var(--a-muted)]">{A.echo.subtitle}</p>
          </div>
        </div>
        <Link href="#" aria-label={A.nav.account} className="grid size-11 shrink-0 place-items-center rounded-full border sm:hidden">
          <UserRound aria-hidden size={20} />
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Phone and tablet: the reading being discussed, as one line. */}
          <Link
            href={reading.href}
            className="flex min-h-[48px] shrink-0 items-center justify-between gap-3 border-b bg-[var(--a-linen)] px-4 text-[14px] sm:px-6 lg:hidden"
          >
            <span className="min-w-0">
              <span className="text-[var(--a-muted)]">{A.echo.about}: </span>
              <span className="font-medium">{reading.title}</span>
            </span>
            <ChevronRight aria-hidden size={18} className="shrink-0" />
          </Link>

          <div ref={log} role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 lg:px-8">
            <ol className="mx-auto flex max-w-2xl flex-col gap-4">
              {msgs.map((m) => (
                <li key={m.id} className={`a-fade flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-md bg-[var(--a-ink)] px-4 py-3 text-white"
                        : "max-w-[85%] rounded-2xl rounded-bl-md bg-[var(--a-linen)] px-4 py-3"
                    }
                  >
                    <span className="sr-only">{m.role === "user" ? A.echo.you : A.echo.echo}: </span>
                    {m.text}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="shrink-0 border-t bg-[var(--a-paper)] px-4 pb-3 pt-3 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              <div className="-mx-4 overflow-x-auto px-4 lg:hidden [&>div]:flex-nowrap">{chips}</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-end gap-2 rounded-3xl border bg-[var(--a-paper)] p-1.5 pl-4 focus-within:ring-2 focus-within:ring-[var(--a-forest)] focus-within:ring-offset-2"
              >
                <label htmlFor="a-echo-input" className="sr-only">
                  {A.echo.inputLabel}
                </label>
                <textarea
                  id="a-echo-input"
                  ref={input}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={A.echo.placeholder}
                  className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 outline-none placeholder:text-[var(--a-muted)] focus-visible:outline-none"
                />
                <button
                  type="submit"
                  aria-label={A.echo.send}
                  disabled={!draft.trim()}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--a-action)] text-white disabled:opacity-40"
                >
                  <SendHorizontal aria-hidden size={18} />
                </button>
              </form>
              <p className="text-center text-[12px] text-[var(--a-muted)]">{A.echo.previewNote}</p>
            </div>
          </div>
        </section>

        {/* Desktop: the reading in a right panel. */}
        <aside aria-labelledby="a-context" className="hidden w-[340px] shrink-0 flex-col gap-6 overflow-y-auto border-l p-8 lg:flex">
          <div>
            <p id="a-context" className={eyebrow}>
              {A.echo.about}
            </p>
            <div className="mt-3 rounded-2xl bg-[var(--a-linen)] p-5">
              <p className="text-[14px] text-[var(--a-muted)]">{reading.kind}</p>
              <p className="a-head mt-1 text-[22px] font-semibold leading-tight">{reading.title}</p>
              {reading.photoCheck && (
                <div className="mt-3">
                  <PhotoCheckLine text={reading.photoCheck} />
                </div>
              )}
              <Link
                href={reading.href}
                className="mt-2 inline-flex min-h-[44px] items-center gap-1 font-medium text-[var(--a-forest)] underline-offset-4 hover:underline"
              >
                {A.echo.openCheck}
                <ChevronRight aria-hidden size={16} />
              </Link>
            </div>
          </div>
          <div>
            <p className={`${eyebrow} mb-3`}>{A.echo.areasTitle}</p>
            {chips}
          </div>
          <p className="mt-auto text-[14px] leading-[1.45] text-[var(--a-muted)]">{A.echo.note}</p>
        </aside>
      </div>
    </div>
  );
}
