import { RoutinePage } from "@/components/routine/RoutinePage";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";

// description and openGraph are set here so the root description, which links
// a routine to results, is not inherited (D-12, R-4 A).
export const metadata = {
  title: "Routine — The Project SKIN",
  description: C.purpose,
  openGraph: { title: "Routine — The Project SKIN", description: C.purpose },
};

// Reached from the dashboard's routine link (owner lane decision 7, which
// supersedes routine-design.md §5) and by URL. No link from the results screen.
export default function RoutineRoute() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-24">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-text">{C.title}</h1>
        <p className="text-body text-text/60">{C.purpose}</p>
      </div>
      <RoutinePage />
    </main>
  );
}
