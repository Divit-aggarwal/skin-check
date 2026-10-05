// PREVIEW ONLY: direction B, one opened check (preview-1 … preview-6).
import { ChecksWorkspace } from "@/components/preview/b/checks";

export default function CheckPage({ params }: { params: { scanId: string } }) {
  return <ChecksWorkspace mode="detail" scanId={params.scanId} />;
}
