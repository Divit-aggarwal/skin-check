"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toE164India } from "@/lib/auth-phone";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

type Phase = "enter-phone" | "enter-otp";

const inputClass =
  "w-full rounded-lg border bg-white px-4 py-3 pr-11 text-[1.0625rem] text-text shadow-sm outline-none placeholder:text-text/35 focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2 border-text/10 focus:border-blush/50";

// The smallest UI Phase 2A needs: phone -> OTP -> signed in -> sign out.
// No "save results"/scan-claim entry point yet (that's Phase 2B) — this
// component only ever changes auth state, nothing scan-related.
export function PhoneOtpForm() {
  const { user, loading, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>("enter-phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [e164Phone, setE164Phone] = useState<string | null>(null);

  const validPhone = toE164India(phone) !== null;
  const validOtp = /^\d{6}$/.test(otp);

  async function requestOtp() {
    const target = toE164India(phone);
    if (!target || submitting) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ phone: target });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setE164Phone(target);
    setPhase("enter-otp");
  }

  async function verifyOtp() {
    if (!e164Phone || !validOtp || submitting) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      phone: e164Phone,
      token: otp,
      type: "sms",
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    // onAuthStateChange (lib/auth-context.tsx) picks up the new session —
    // no local "authenticated" state to set here.
  }

  function resetToPhoneEntry() {
    setPhase("enter-phone");
    setOtp("");
    setError(null);
  }

  if (loading) {
    return <div className="h-11 w-40 animate-pulse rounded-lg bg-canvas" />;
  }

  if (user) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text/70">Signed in.</p>
        <Button variant="outline" size="sm" onClick={() => void signOut()} className="w-fit">
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {phase === "enter-phone" && (
        <div className="flex flex-col gap-2">
          <div className="relative max-w-sm">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              disabled={submitting}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && validPhone) {
                  e.preventDefault();
                  void requestOtp();
                }
              }}
              placeholder="10-digit mobile number"
              className={cn(inputClass, validPhone && "border-blush/50")}
            />
            {validPhone && (
              <button
                type="button"
                onClick={() => void requestOtp()}
                disabled={submitting}
                aria-label="Send code"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-blush text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            )}
          </div>
          <Button
            variant="ink"
            size="sm"
            onClick={() => void requestOtp()}
            disabled={!validPhone || submitting}
            className="w-fit"
          >
            {submitting ? "Sending…" : "Send code"}
          </Button>
        </div>
      )}

      {phase === "enter-otp" && (
        <div className="flex flex-col gap-2">
          <p className="text-label uppercase tracking-label text-text/45">
            Code sent to {phone}
          </p>
          <div className="relative max-w-sm">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              disabled={submitting}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && validOtp) {
                  e.preventDefault();
                  void verifyOtp();
                }
              }}
              placeholder="6-digit code"
              className={cn(inputClass, validOtp && "border-blush/50")}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="ink"
              size="sm"
              onClick={() => void verifyOtp()}
              disabled={!validOtp || submitting}
            >
              {submitting ? "Verifying…" : "Verify"}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetToPhoneEntry} disabled={submitting}>
              Use a different number
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-status-error">{error}</p>}
    </div>
  );
}
