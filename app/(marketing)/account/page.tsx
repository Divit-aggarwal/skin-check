import { PhoneOtpForm } from "@/components/auth/PhoneOtpForm";

export const metadata = {
  title: "Account — The Project SKIN",
};

// The smallest surface Phase 2A needs: a place to sign in and sign out.
// Nothing here reads or writes scan data yet — that's Phase 2B.
export default function AccountPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-24">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-text">Your account</h1>
        <p className="text-body text-text/60">
          Sign in with your phone number to save your results across visits.
        </p>
      </div>
      <PhoneOtpForm />
    </main>
  );
}
