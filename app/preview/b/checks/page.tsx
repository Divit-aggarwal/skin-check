// PREVIEW ONLY: direction B Checks. ?view=timeline shows checks and routine events together.
import { ChecksWorkspace } from "@/components/preview/b/checks";

export default function ChecksPage({ searchParams }: { searchParams: { view?: string } }) {
  return <ChecksWorkspace mode="list" view={searchParams.view === "timeline" ? "timeline" : "list"} />;
}
