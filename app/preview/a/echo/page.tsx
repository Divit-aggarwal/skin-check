// PREVIEW ONLY (direction A): Echo. No API call; see EchoChat.
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/CheckReadings";
import { DASHBOARDS, ECHO_THREAD, openCheck } from "@/components/preview/fixtures";
import { ECHO_REGIONS, ECHO_REGION_LABELS } from "@/lib/echo-regions";
import { A_COPY as A } from "@/components/preview/a/copy";
import { P } from "@/components/preview/a/data";
import { EchoChat } from "@/components/preview/a/EchoChat";

export default function EchoPage() {
  const c = openCheck(DASHBOARDS.set.echoScanId!)!;
  return (
    <EchoChat
      thread={ECHO_THREAD}
      reading={{
        title: A.echo.readingFrom(formatDate(c.date)),
        kind: C.history.kind[c.kind],
        photoCheck: c.photoCheck ? C.photoCheck[c.photoCheck] : null,
        href: `${P}/checks/${c.scanId}`,
      }}
      regions={ECHO_REGIONS.map((r) => ECHO_REGION_LABELS[r])}
    />
  );
}
