"use client";

import { useEffect, useRef } from "react";
import { OTP_LENGTH, usePhoneAuth } from "@/lib/usePhoneAuth";
import type { Country } from "@/lib/auth-phone";
import type { User } from "firebase/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Matches the questionnaire's other text inputs (TextInput/PhoneInput) so the
// auth step doesn't read as a different product.
const inputClass =
  "h-12 w-full rounded-lg border bg-brand-paper px-4 text-base text-brand-ink placeholder:text-brand-muted/70";

interface PhoneAuthFormProps {
  onAuthenticated?: (user: User) => void;
  country?: Country;
  /** Consent/expectation copy shown under the phone field. */
  note?: string;
  sendLabel?: string;
}

const DEFAULT_NOTE =
  "We'll send you a verification code by SMS to confirm your number. Standard messaging rates may apply.";

export function PhoneAuthForm({
  onAuthenticated,
  country,
  note = DEFAULT_NOTE,
  sendLabel = "Send verification code",
}: PhoneAuthFormProps) {
  const auth = usePhoneAuth({ country, onAuthenticated });
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Focus the code field the moment the OTP screen appears, so the numeric
  // keypad is already open on mobile when the SMS lands.
  useEffect(() => {
    if (auth.screen === "otp") codeInputRef.current?.focus();
  }, [auth.screen]);

  return (
    <div className="flex flex-col gap-4">
      {auth.screen === "phone" ? (
        <div className="flex flex-col gap-3">
          <div className="flex max-w-sm items-stretch gap-2">
            <span
              aria-hidden
              className="flex h-12 shrink-0 items-center rounded-lg border border-brand-line bg-brand-paper px-3 text-base text-brand-muted"
            >
              {auth.country.dialCode}
            </span>
            <input
              id="phone-auth-number"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              aria-label={`Mobile number, ${auth.country.label} ${auth.country.dialCode}`}
              value={auth.national}
              disabled={auth.busy}
              onChange={(e) => auth.setNational(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && auth.validPhone) {
                  e.preventDefault();
                  void auth.sendCode();
                }
              }}
              placeholder="10-digit mobile number"
              className={cn(
                inputClass,
                "border-brand-line"
              )}
            />
          </div>
          <Button
            variant="ink"
            size="lg"
            onClick={() => void auth.sendCode()}
            disabled={!auth.validPhone || auth.busy}
            aria-busy={auth.status === "sending"}
            className="w-fit"
          >
            {auth.status === "sending" ? "Sending code…" : sendLabel}
          </Button>
          <p className="max-w-sm text-sm text-brand-muted">{note}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p>
            We sent a {OTP_LENGTH}-digit code to{" "}
            <span className="whitespace-nowrap font-semibold">{auth.e164}</span>
          </p>
          <input
            ref={codeInputRef}
            id="phone-auth-code"
            type="text"
            inputMode="numeric"
            // One field, not six boxes: this is what lets iOS/Android fill the
            // code straight from the SMS, and paste/backspace stay native.
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            aria-label={`${OTP_LENGTH}-digit verification code`}
            value={auth.code}
            disabled={auth.status === "verifying"}
            onChange={(e) => auth.setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && auth.validCode) {
                e.preventDefault();
                void auth.verifyCode();
              }
            }}
            placeholder="------"
            className={cn(
              inputClass,
              "max-w-sm text-center font-mono text-2xl tracking-[0.4em]",
              "border-brand-line"
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ink"
              size="lg"
              onClick={() => void auth.verifyCode()}
              disabled={!auth.validCode || auth.busy}
              aria-busy={auth.status === "verifying"}
            >
              {auth.status === "verifying" ? "Verifying…" : "Verify"}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="rounded-full px-4 text-brand-forest"
              onClick={() => void auth.sendCode()}
              disabled={auth.resendIn > 0 || auth.busy}
            >
              {auth.status === "resending"
                ? "Sending…"
                : auth.resendIn > 0
                  ? `Resend code in ${auth.resendIn}s`
                  : "Resend code"}
            </Button>
            <Button variant="ghost" size="lg" className="rounded-full px-4 text-brand-forest" onClick={auth.changeNumber} disabled={auth.busy}>
              Change phone number
            </Button>
          </div>
        </div>
      )}

      {/* Announced without moving anything: the block is always in the tree,
          so an error appearing never shifts the buttons under the user's thumb. */}
      <p role="status" aria-live="polite" className="max-w-sm text-sm text-brand-error empty:hidden">
        {auth.error}
      </p>

      {/* Invisible reCAPTCHA mounts here. Always rendered — the verifier is
          constructed against this element and it must already be in the DOM. */}
      <div ref={auth.recaptchaRef} />
    </div>
  );
}
