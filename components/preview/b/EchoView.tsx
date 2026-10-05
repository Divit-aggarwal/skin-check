"use client";
// PREVIEW ONLY (direction B). Echo chat: no API call. Send only appends the
// user's message locally. From 1024px the reading being discussed sits on the
// right, treated as one opened check (date, photo check, PAST_CHECK_LINE).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { B_COPY as B } from "./copy";
import type { Opened } from "./data";
import { checkHref } from "./links";
import { RegionTabs } from "./RegionTabs";
import { AccountButton } from "./Shell";
import { FixedLine, Readings, StatusLine } from "./ui";

type Msg = { id: string; role: "echo" | "user"; text: string };

export function EchoView({ thread, ctx, fixedLine }: { thread: Msg[]; ctx: Opened; fixedLine: string }) {
  const [msgs, setMsgs] = useState<Msg[]>(thread);
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  function send(t: string) {
    const v = t.trim();
    if (!v) return;
    setMsgs((m) => [...m, { id: `local-${m.length + 1}`, role: "user", text: v }]);
    setText("");
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--nav-h))] w-full max-w-[1200px] flex-col px-4 sm:h-dvh sm:px-6 lg:px-8">
      <header className="flex items-start justify-between gap-4 border-b pb-3 pt-4 sm:pt-6 lg:pb-4 lg:pt-8">
        <div className="min-w-0">
          <p className="b-eyebrow mb-1">{B.echo.eyebrow}</p>
          <h1 className="b-h1">{B.echo.title}</h1>
          <Link href={checkHref(ctx.scanId)} className="b-link mt-1 inline-flex min-h-[44px] items-center gap-1 text-[14px] lg:hidden">
            {B.echo.about(ctx.date)}
            <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
        <AccountButton />
      </header>

      <div className="flex min-h-0 flex-1 gap-6 lg:grid lg:grid-cols-[1fr_minmax(320px,380px)]">
        <section aria-labelledby="b-conv" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <h2 id="b-conv" className="sr-only">
            {B.echo.log}
          </h2>
          <div ref={logRef} role="log" aria-live="polite" aria-label={B.echo.log} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto py-4">
            <ol className="flex flex-col gap-3">
              {msgs.map((m) => (
                <li key={m.id} className={clsx("b-fade flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={clsx(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 lg:max-w-[min(70ch,80%)]",
                      m.role === "user" ? "rounded-br-md bg-[var(--surface)]" : "rounded-bl-md border bg-white"
                    )}
                  >
                    <p className="b-eyebrow mb-0.5">{m.role === "user" ? B.echo.you : B.echo.echo}</p>
                    <p>{m.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="border-t pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:pb-6">
            {ctx.regions && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="b-eyebrow mr-1 w-full sm:w-auto">{B.echo.quick}</p>
                {ctx.regions.map((r) => (
                  <button
                    key={r.region}
                    type="button"
                    onClick={() => send(B.echo.areaQuestion(r.label))}
                    className="min-h-[44px] rounded-full border bg-white px-4 text-[14px] font-medium transition-colors duration-150 hover:bg-[var(--surface)]"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
              className="flex items-center gap-2"
            >
              <label htmlFor="b-echo-input" className="sr-only">
                {B.echo.inputLabel}
              </label>
              <input
                id="b-echo-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={B.echo.placeholder}
                autoComplete="off"
                className="h-12 min-w-0 flex-1 rounded-full border bg-white px-5 text-[16px] placeholder:text-[var(--muted)]"
              />
              <button
                type="submit"
                aria-label={B.echo.send}
                disabled={!text.trim()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--action)] text-white transition-colors duration-150 hover:bg-[var(--action-hover)] disabled:bg-[var(--surface-2)] disabled:text-[var(--muted)]"
              >
                <ArrowUp size={20} aria-hidden />
              </button>
            </form>
            <p className="b-meta mt-2">{B.echo.note}</p>
          </div>
        </section>

        <aside aria-labelledby="b-ctx" className="hidden min-h-0 overflow-y-auto py-4 lg:block">
          <div className="b-card overflow-hidden">
            <div className="border-b px-5 py-4">
              <p className="b-eyebrow">{B.echo.contextEyebrow}</p>
              <h2 id="b-ctx" className="b-h2 mt-0.5">
                {B.echo.contextTitle}
              </h2>
              <p className="mt-1 font-semibold">{B.home.checkedOn(ctx.date)}</p>
              {ctx.photoLine && (
                <div className="mt-1">
                  <StatusLine>{ctx.photoLine}</StatusLine>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-4 px-5 py-5">
              <FixedLine text={fixedLine} />
              {ctx.wholeFace && (
                <div>
                  <h3 className="b-h3 mb-2">{B.home.wholeFace}</h3>
                  <Readings readings={ctx.wholeFace} />
                </div>
              )}
              {ctx.regions && (
                <div>
                  <h3 className="b-h3 mb-2">{B.home.byArea}</h3>
                  <RegionTabs areas={ctx.regions} label={B.home.areaTabs} />
                </div>
              )}
              <Link href={checkHref(ctx.scanId)} className="b-link inline-flex min-h-[44px] items-center gap-1 text-[14px]">
                {B.echo.showReading}
                <ChevronRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
