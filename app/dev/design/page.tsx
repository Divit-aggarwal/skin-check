import { notFound } from "next/navigation";
import { Showcase } from "./Showcase";

// Redesign Phase 1 (TD-50): every kit piece in one page, for the 375px review
// screenshots. Local development only: "not found" in any other build. The
// words here are labelled samples for the review, never shown to users.

export default function DesignPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Showcase />;
}
