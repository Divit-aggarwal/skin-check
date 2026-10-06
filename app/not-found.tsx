import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { SHELL_COPY as S } from "@/components/shell/copy";
import { btnPrimary, btnSecondary, page } from "@/components/ui/page";

// Every unknown address: inside the app shell, with two ways on (G03 3.9).
export default function NotFound() {
  return (
    <AppShell>
      <main className={page}>
        <div className="flex flex-col items-start gap-4 pt-12 sm:pt-16">
          <h1 className="font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-brand-title sm:text-[40px]">{S.notFoundTitle}</h1>
          <p className="max-w-prose text-brand-muted">{S.notFoundBody}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className={btnPrimary}>
              {S.goHome}
            </Link>
            <Link href="/skin-check" className={btnSecondary}>
              {S.startCheck}
            </Link>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
