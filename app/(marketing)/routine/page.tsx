import { RoutinePage } from "@/components/routine/RoutinePage";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";

export const metadata = {
  title: "Routine — The Project SKIN",
};

// Reached by URL only: no link from the scan dashboard until G02 is reviewed
// under D-12 (docs/lanes/routine-design.md §5).
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
