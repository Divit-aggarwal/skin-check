// PREVIEW ONLY: direction B Echo. No API call: send only appends locally.
import { notFound } from "next/navigation";
import { DASHBOARDS, ECHO_THREAD, PAST_CHECK_LINE } from "@/components/preview/fixtures";
import { opened } from "@/components/preview/b/data";
import { EchoView } from "@/components/preview/b/EchoView";

export default function EchoPage() {
  const ctx = DASHBOARDS.set.echoScanId ? opened(DASHBOARDS.set.echoScanId) : null;
  if (!ctx) notFound();
  return <EchoView thread={[...ECHO_THREAD]} ctx={ctx} fixedLine={PAST_CHECK_LINE} />;
}
