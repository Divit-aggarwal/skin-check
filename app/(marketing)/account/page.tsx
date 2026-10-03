import { PhoneOtpForm } from "@/components/auth/PhoneOtpForm";
import { PreviousScans } from "@/components/skin-check/PreviousScans";
import { DeleteAccount } from "./DeleteAccount";

export const metadata = {
  title: "Account — The Project SKIN",
};

// Sign in / sign out, plus the signed-in user's own scan history. PreviousScans
// and DeleteAccount (H01b) render nothing at all when signed out, so the
// signed-out page is unchanged.
export default function AccountPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-text">Your account</h1>
        <p className="text-body text-text/60">
          Sign in with your phone number to save your results across visits.
        </p>
      </div>
      <PhoneOtpForm />
      <PreviousScans />
      <DeleteAccount />
    </main>
  );
}
