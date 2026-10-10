import { LaterQuestionsPage } from "@/components/skin-check/LaterQuestions";
import { page } from "@/components/ui/page";

// description and openGraph are set here so the root description is not
// inherited (D-12; same reason as /routine).
export const metadata = {
  title: "Skin Check questions — The Project SKIN",
  description: "Answer the Skin Check questions for your newest check.",
  openGraph: { title: "Skin Check questions — The Project SKIN", description: "Answer the Skin Check questions for your newest check." },
};

// TD-33 (1): reached from Home's and Account's "Answer the questions", the
// results screen after a skip, an opened check and Echo's notice.
export default function QuestionsRoute() {
  return (
    <main className={page}>
      <LaterQuestionsPage />
    </main>
  );
}
