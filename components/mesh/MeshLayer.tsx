"use client";

import { useEffect, useMemo, useState } from "react";
import { meshPath } from "@/lib/face-mesh/regions";
import { faceMeshOf, type FaceMesh } from "./landmarks";

/** The mesh for a photo; null until it is found, and null for good when it cannot be. */
export function useFaceMesh(photo: Blob | null | undefined): { mesh: FaceMesh | null; failed: boolean } {
  const [state, setState] = useState<{ photo: Blob | null; mesh: FaceMesh | null; failed: boolean }>({ photo: null, mesh: null, failed: false });
  useEffect(() => {
    if (!photo) return;
    let live = true;
    void faceMeshOf(photo).then((mesh) => live && setState({ photo, mesh, failed: mesh === null }));
    return () => {
      live = false;
    };
  }, [photo]);
  // A mesh found for an earlier photo is never drawn over this one.
  return state.photo === photo && photo ? state : { mesh: null, failed: !photo };
}

/**
 * The face mesh over a photo shown with object-cover (TD-37 (2)). A map of
 * the face, never a finding: one thin, even, white line for every edge, no
 * points, no colour by place or reading, and nothing to choose (TD-39).
 * `scanning` adds a band that sweeps down while the photo is read; none under
 * reduced motion. `faint`: fainter lines, so the overlays under them stay readable.
 */
export function MeshLayer({ mesh, scanning = false, faint = false }: { mesh: FaceMesh; scanning?: boolean; faint?: boolean }) {
  const lines = useMemo(() => meshPath(mesh.points, mesh.edges), [mesh]);
  return (
    <>
      <svg
        aria-hidden
        viewBox={`0 0 ${mesh.width} ${mesh.height}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full animate-in fade-in duration-200 motion-reduce:animate-none"
      >
        <path d={lines} fill="none" stroke="#FFFFFF" strokeOpacity={faint ? 0.15 : 0.55} strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
      </svg>
      {scanning && (
        // One soft white band, moved by transform only (no repaint of the mesh per frame).
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
          <div className="mesh-scan absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent via-white/35 to-transparent" />
        </div>
      )}
    </>
  );
}
