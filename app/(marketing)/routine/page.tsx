import { RoutinePage } from "@/components/routine/RoutinePage";
import { page } from "@/components/ui/page";
import { AppHeader } from "@/components/ui/kit";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";

// description and openGraph are set here so the root description, which links
// a routine to results, is not inherited (D-12, R-4 A).
export const metadata = {
  title: "Routine — The Project SKIN",
  description: C.purpose,
  openGraph: { title: "Routine — The Project SKIN", description: C.purpose },
};

// Reached from the main navigation, Home's routine card and the timeline.
// The page title lives in RoutinePage (screen 03: the slot title replaces it once loaded).
export default function RoutineRoute() {
  return (
    <main className={page}>
      {/* Phones: the wordmark bar (redesign); the rail and side bar carry it from 640px. */}
      <div className="sm:hidden">
        <AppHeader back="/dashboard" backLabel="Back to Today" />
      </div>
      <RoutinePage />
    </main>
  );
}
