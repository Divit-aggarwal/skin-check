"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { DEFAULT_COUNTRY, toE164, type Country } from "@/lib/auth-phone";

// One explicit machine rather than a spread of booleans — `sending` and
// `resending` are distinct only so the UI knows which screen is busy, which
// makes "which screen do I render" a pure function of status (see `screen`).
export type PhoneAuthStatus =
  | "phone"
  | "sending"
  | "otp"
  | "resending"
  | "verifying"
  | "authenticated";

export const RESEND_COOLDOWN_SECONDS = 30;
export const OTP_LENGTH = 6;

// Firebase throws codes, not sentences. Everything a real user can trigger is
// translated; anything else falls through to a generic line so a
// misconfiguration never renders as jargon at the customer. The raw code is
// still logged (dev only) for debugging — never the phone number or token.
const ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-phone-number": "Please enter a valid phone number.",
  "auth/missing-phone-number": "Please enter your phone number.",
  "auth/invalid-verification-code": "That code isn't correct. Please try again.",
  "auth/code-expired": "This verification code has expired. Please request a new one.",
  "auth/too-many-requests": "Too many attempts. Please wait a little before trying again.",
  "auth/quota-exceeded": "We couldn't send the verification code right now. Please try again later.",
  "auth/operation-not-allowed": "Phone sign-in isn't available right now. Please try again later.",
  "auth/captcha-check-failed": "We couldn't verify your browser. Please try again.",
  "auth/invalid-app-credential": "We couldn't verify your browser. Please try again.",
  "auth/network-request-failed": "Check your connection and try again.",
  "auth/user-disabled": "This number can't be used to sign in.",
};

const GENERIC_ERROR = "We couldn't send the verification code right now. Please try again.";

function toMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && process.env.NODE_ENV !== "production") {
    console.warn("[phone-auth]", code);
  }
  return (code && ERROR_MESSAGES[code]) || GENERIC_ERROR;
}

interface UsePhoneAuthOptions {
  country?: Country | undefined;
  /** Fired once, after Firebase has verified the code and returned a user. */
  onAuthenticated?: ((user: User) => void) | undefined;
}

export function usePhoneAuth({
  country = DEFAULT_COUNTRY,
  onAuthenticated,
}: UsePhoneAuthOptions = {}) {
  const [status, setStatus] = useState<PhoneAuthStatus>("phone");
  const [error, setError] = useState<string | null>(null);
  const [national, setNational] = useState("");
  const [code, setCode] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // The div the invisible widget mounts into. Passed to Firebase as an
  // element, not an id — two of these can be on one page (the /account form
  // and the Skin Check step) and ids would collide.
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  // Transient client-only auth state: never persisted, never sent anywhere.
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  // Survives changeNumber on purpose. Without it the cooldown is bypassable
  // by tapping "Change phone number" and re-sending the same digits, which
  // is an uncontrolled SMS path (and a real cost) rather than a UX nicety.
  const lastSentRef = useRef<string | null>(null);
  const onAuthenticatedRef = useRef(onAuthenticated);
  onAuthenticatedRef.current = onAuthenticated;

  function disposeVerifier() {
    verifierRef.current?.clear();
    verifierRef.current = null;
  }

  // A verifier's token is spent by the signInWithPhoneNumber call it backs,
  // so every send builds a fresh one and tears down the widget before it.
  // That is what makes resend and change-number work instead of failing with
  // auth/invalid-app-credential the second time around.
  function freshVerifier() {
    disposeVerifier();
    if (!recaptchaRef.current) {
      throw new Error("reCAPTCHA container is not mounted.");
    }
    // Invisible: no checkbox for the user to tick. This is app verification,
    // not a weaker mode — Firebase still runs reCAPTCHA and will escalate to
    // a visible challenge on its own if the risk score demands one, which is
    // the behaviour we want to keep. `size: "normal"` here was a temporary
    // diagnostic (a visible widget renders its own error text instead of
    // failing behind an opaque code) and was the sole reason every user was
    // being shown a checkbox.
    verifierRef.current = new RecaptchaVerifier(auth(), recaptchaRef.current, {
      size: "invisible",
    });
    return verifierRef.current;
  }

  useEffect(() => disposeVerifier, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const busy = status === "sending" || status === "resending" || status === "verifying";
  const validPhone = toE164(national, country) !== null;
  const validCode = new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);

  const sendCode = useCallback(async () => {
    const isResend = status === "otp";
    if (busy || status === "authenticated") return;
    const target = toE164(national, country);
    if (!target) {
      setError(ERROR_MESSAGES["auth/invalid-phone-number"]!);
      return;
    }
    // Throttled per number, not per screen — a different number is a
    // legitimate new send and isn't made to wait out the old one's timer.
    if (resendIn > 0 && target === lastSentRef.current) {
      setError(`Please wait ${resendIn}s before requesting another code.`);
      return;
    }
    setStatus(isResend ? "resending" : "sending");
    setError(null);
    try {
      confirmationRef.current = await signInWithPhoneNumber(auth(), target, freshVerifier());
      lastSentRef.current = target;
      setE164(target);
      setCode("");
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setStatus("otp");
    } catch (err) {
      // A failed send leaves a spent widget behind; drop it so the retry
      // isn't rejected for reusing it.
      disposeVerifier();
      setError(toMessage(err));
      setStatus(isResend ? "otp" : "phone");
    }
    // freshVerifier/disposeVerifier are stable closures over refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, country, national, resendIn, status]);

  const verifyCode = useCallback(async () => {
    if (busy || !confirmationRef.current || !validCode) return;
    setStatus("verifying");
    setError(null);
    try {
      const { user } = await confirmationRef.current.confirm(code);
      confirmationRef.current = null;
      disposeVerifier();
      setStatus("authenticated");
      onAuthenticatedRef.current?.(user);
    } catch (err) {
      setError(toMessage(err));
      setStatus("otp");
    }
  }, [busy, code, validCode]);

  // Back to phone entry without touching anything outside this hook — the
  // Skin Check questionnaire's answers live in a different state tree and
  // are untouched by this.
  const changeNumber = useCallback(() => {
    if (busy) return;
    confirmationRef.current = null;
    disposeVerifier();
    setCode("");
    setE164(null);
    setError(null);
    setStatus("phone");
    // resendIn deliberately left running — see lastSentRef.
  }, [busy]);

  return {
    status,
    /** Which of the two screens to render — derived, never a separate flag. */
    screen: (status === "phone" || status === "sending" ? "phone" : "otp") as "phone" | "otp",
    busy,
    error,
    country,
    national,
    setNational: (value: string) =>
      setNational(value.replace(/\D/g, "").slice(0, country.nationalDigits)),
    code,
    setCode: (value: string) => setCode(value.replace(/\D/g, "").slice(0, OTP_LENGTH)),
    e164,
    validPhone,
    validCode,
    resendIn,
    recaptchaRef,
    sendCode,
    verifyCode,
    changeNumber,
  };
}
