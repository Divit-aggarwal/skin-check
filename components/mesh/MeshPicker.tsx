"use client";

import { MeshLayer, useFaceMesh, type AreaChoice } from "./MeshLayer";
import { useObjectUrl } from "./useObjectUrl";

/**
 * The area picker over the user's own photo (TD-37 (2)): the mesh, each area
 * with a reading a button, the chosen one highlighted. Renders `fallback` (the
 * face drawing) until the mesh is ready and whenever it cannot be drawn.
 */
export function MeshPicker({ photo, areas, fallback }: { photo: Blob; areas: AreaChoice; fallback: JSX.Element }) {
  const url = useObjectUrl(photo);
  const { mesh } = useFaceMesh(photo);
  if (!url || !mesh) return fallback;
  return (
    <div data-testid="mesh-picker" className="relative mx-auto aspect-[3/4] w-full max-w-[240px] select-none overflow-hidden rounded-media bg-surface sm:max-w-[300px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- transient object URL */}
      <img src={url} alt="Your photo with a map of your face" className="absolute inset-0 h-full w-full object-cover" />
      <MeshLayer mesh={mesh} areas={areas} />
    </div>
  );
}
