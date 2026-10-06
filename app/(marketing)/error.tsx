"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SHELL_COPY as S } from "@/components/shell/copy";
import { btnPrimary, btnSecondary, page } from "@/components/ui/page";

// A page that fails to render: a plain sentence, no code, and two ways on (G03 3.9).
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Name only: a message can carry user data.
    console.error("[page] render failed", error.name);
  }, [error]);
  return (
    <main className={page}>
      <div role="alert" className="flex flex-col items-start gap-4 pt-12 sm:pt-16">
        <h1 className="font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-brand-title sm:text-[40px]">{S.errorTitle}</h1>
        <p className="max-w-prose text-brand-muted">{S.errorBody}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={btnPrimary} onClick={reset}>
            {S.tryAgain}
          </button>
          <Link href="/dashboard" className={btnSecondary}>
            {S.goHome}
          </Link>
        </div>
      </div>
    </main>
  );
}
