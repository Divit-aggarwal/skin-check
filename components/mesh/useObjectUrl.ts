"use client";

import { useEffect, useState } from "react";

/** An object URL for a blob, made and revoked in the same effect (safe under StrictMode's double mount). */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
