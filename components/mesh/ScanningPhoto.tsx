"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { MeshLayer, useFaceMesh } from "./MeshLayer";
import { useObjectUrl } from "./useObjectUrl";

/**
 * The photo being read, with the face mesh and a sweeping band over it
 * (TD-37 (2)). Until the mesh is ready, and whenever it cannot be drawn, this
 * is the photo alone (or the plain skeleton without a photo); the analysis
 * never waits for it.
 */
export function ScanningPhoto({ photo }: { photo: Blob | null }) {
  const url = useObjectUrl(photo);
  const { mesh } = useFaceMesh(photo);

  if (!url) return <Skeleton className="aspect-[3/4] w-full max-w-[340px] self-center rounded-media" />;
  return (
    <div data-testid="scanning-photo" data-mesh={mesh ? "ready" : "none"} className="relative aspect-[3/4] w-full max-w-[340px] self-center overflow-hidden rounded-media bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element -- transient object URL */}
      <img src={url} alt="Your photo, being read" className="absolute inset-0 h-full w-full object-cover" />
      {mesh ? <MeshLayer mesh={mesh} scanning /> : <div aria-hidden className="absolute inset-0 animate-pulse bg-white/20 motion-reduce:animate-none" />}
    </div>
  );
}
