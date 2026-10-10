"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * The user's own kept photo as bytes, for the mesh on Home and an opened
 * check (TD-37 (2)). Same route and checks as the thumbnail (Thumb, TD-25
 * (2)); the bytes stay in this tab's memory and are never stored. Reading them
 * needs the bucket to allow a GET from our site (CORS, owner queue TD-37); until
 * then, and on any failure, this is null and the face drawing is shown.
 */
export function useKeptPhoto(scanId: string | null, claimed: boolean): Blob | null {
  const { user } = useAuth();
  const [photo, setPhoto] = useState<{ scanId: string; blob: Blob } | null>(null);
  useEffect(() => {
    if (!user || !scanId || !claimed) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/checks/photo?scanId=${encodeURIComponent(scanId)}`, { headers: { authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
        const body = res.ok ? ((await res.json()) as { url?: unknown }) : null;
        if (typeof body?.url !== "string") return;
        const img = await fetch(body.url, { cache: "no-store", referrerPolicy: "no-referrer", credentials: "omit" });
        if (img.ok && live) setPhoto({ scanId, blob: await img.blob() });
      } catch {
        // No CORS rule yet, offline, or expired: the face drawing stays.
      }
    })();
    return () => {
      live = false;
    };
  }, [user, scanId, claimed]);
  // Never a photo from another check or another user (security review G03, L1).
  return user && photo?.scanId === scanId ? photo.blob : null;
}
