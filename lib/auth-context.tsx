"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

interface AuthContextValue {
  // undefined = not yet determined (initial load); null = signed out.
  // Callers that need `user.uid` should check `user` is truthy first — this
  // shape makes "don't know yet" impossible to confuse with "signed out."
  user: User | null | undefined;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Wraps the whole app (app/layout.tsx) — public pages read `user` to decide
// what to show (or not), it never gates access by itself. The verified
// identity for anything that matters always comes from the ID token Firebase
// attaches to each Firestore request and checks against firestore.rules,
// never from this context.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // onAuthStateChanged also fires on every hourly token refresh; without this
  // each one would cost a Firestore write for no new information.
  const upserted = useRef<string | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth(), (next) => {
        setUser(next);
        if (next && upserted.current !== next.uid) {
          upserted.current = next.uid;
          void upsertProfile(next);
        }
      }),
    []
  );

  async function signOut() {
    await fbSignOut(auth());
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading: user === undefined, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// One doc per user at users/{uid}, merged so a returning user only refreshes
// lastSeenAt. Fired on every auth state change rather than only at
// verification, so a user created before this existed still gets a row.
// Failure is non-fatal: sign-in already succeeded, and nothing renders off
// this doc yet.
async function upsertProfile(user: User) {
  try {
    await setDoc(
      doc(db(), "users", user.uid),
      { phoneNumber: user.phoneNumber, lastSeenAt: serverTimestamp() },
      { merge: true }
    );
  } catch (error) {
    console.error("users/{uid} upsert failed", error);
  }
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return ctx;
}
