"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listSkinChecks, type SkinCheckSummary } from "@/lib/firebase/skin-checks";
import { Skeleton } from "@/components/ui/skeleton";

// What each terminal status means to the person who made the scan — not the
// raw enum. "questionnaire_only" in particular must not read as a failure:
// they answered the questions and chose not to (or couldn't) add a photo.
const STATUS_LABEL: Record<SkinCheckSummary["status"], string> = {
  completed: "Photo analyzed",
  analysis_failed: "Photo couldn't be analyzed",
  questionnaire_only: "Questionnaire only",
};

function formatWhen(date: Date | null): string {
  // A serverTimestamp() this client just wrote hasn't resolved yet — that's
  // an expected state on the first render after saving, not an error.
  if (!date) return "Just now";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A signed-in user's own previous scans, newest first.
 *
 * Read-only by design: scans are append-only records (firestore.rules denies
 * update and delete), and retained originals are not user-deletable. This
 * screen exists so a returning user can see that their history is there.
 */
export function PreviousScans() {
  const { user, loading } = useAuth();
  const [scans, setScans] = useState<SkinCheckSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) {
      setScans(null);
      setFailed(false);
      return;
    }
    let active = true;
    setFailed(false);
    listSkinChecks(user.uid)
      .then((result) => {
        if (active) setScans(result);
      })
      .catch((error) => {
        // Never surface the Firestore error code — it says nothing the user
        // can act on. The retry is a reload, which re-runs this effect.
        console.error("[skin-check] couldn't load previous scans", error);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [user]);

  // Signed out (or Firebase hasn't reported yet) — the sign-in form above
  // this component is the whole story; a second empty panel would just be noise.
  if (loading || !user) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg text-text">Your previous scans</h2>

      {failed ? (
        <p className="text-body text-text/60">
          We couldn&rsquo;t load your scans just now. Refresh the page to try again.
        </p>
      ) : scans === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : scans.length === 0 ? (
        <p className="text-body text-text/60">
          No scans yet.{" "}
          <Link href="/skin-check" className="text-text underline underline-offset-4">
            Take your first Skin Check
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {scans.map((scan) => (
            <li
              key={scan.scanId}
              className="flex items-center justify-between gap-4 rounded-lg bg-canvas px-4 py-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-body text-text">{formatWhen(scan.createdAt)}</span>
                <span className="text-sm text-text/60">{STATUS_LABEL[scan.status]}</span>
              </div>
              {/* Only claimed when the object really landed in S3 — the record
                  under-claims rather than over-claims (lib/firebase/skin-checks.ts). */}
              {scan.imageStored && (
                <span className="shrink-0 text-sm text-text/50">Photo saved</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/skin-check"
        className="w-fit text-sm font-medium text-text underline underline-offset-4 hover:text-blush"
      >
        Start a new skin check
      </Link>
    </section>
  );
}
