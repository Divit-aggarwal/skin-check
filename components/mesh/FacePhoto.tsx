"use client";

import { useState, type CSSProperties } from "react";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import type { SkinScanOverlays } from "@/types/skin-scan";
import { MeshLayer, useFaceMesh } from "./MeshLayer";
import { useObjectUrl } from "./useObjectUrl";

// TD-39: both photo readings' overlays at once, told apart by colour AND
// pattern, so they stay apart where they overlap and without colour vision.
// Brand decorative colours (system.md §2): neither is red, green or amber, and
// neither is a skin tone. The engine's own colour scales (hot, viridis) both
// end in yellow, so only the overlay's alpha (its strength) is used here.
const REDNESS = "#6a479e"; // lilac, diagonal stripes: the broad map stays see-through
const OILINESS = "#0096d6"; // sky, solid: the small patches read on light and dark skin

const KEYS = ["redness", "oiliness"] as const;
type Key = (typeof KEYS)[number];

const STYLE: Record<Key, CSSProperties> = {
  redness: { backgroundImage: `repeating-linear-gradient(45deg, ${REDNESS} 0 4px, transparent 4px 8px)` },
  oiliness: { backgroundColor: OILINESS },
};
// The overlay's alpha stops at 0.6; stripes cover half the area, so their mask is laid twice (about 0.84).
const LAYERS = { redness: 2, oiliness: 1 } as const;

const masked = (src: string, layers: number): CSSProperties => {
  const image = Array(layers).fill(`url("${src}")`).join(", ");
  return { maskImage: image, WebkitMaskImage: image, maskSize: "cover", WebkitMaskSize: "cover", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" };
};

// Only a PNG data URI goes into the CSS url(): nothing else can end the url() early.
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

/** The legend: one swatch per overlay on the photo, drawn in the overlay's own style. */
export function OverlayLegend({ shown }: { shown: readonly Key[] }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <ul aria-label={C.photo.legend} className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {shown.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm font-medium text-brand-ink">
            <span aria-hidden className="h-4 w-6 rounded-sm border border-brand-line" style={STYLE[k]} />
            {C.photo.labels[k]}
          </li>
        ))}
      </ul>
      <p className="text-center text-sm text-brand-muted">{C.photo.legendNote}</p>
    </div>
  );
}

/**
 * The user's photo once, with the face mesh and, on the results, the Redness
 * and Oiliness overlays together (TD-39). Nothing on it can be chosen.
 * `fallback` (the face drawing) shows until the mesh is ready and whenever it
 * cannot be drawn; without one, the photo shows alone. `mesh` false: no mesh
 * (a photo that was not read).
 */
export function FacePhoto({ photo, overlays = null, fallback, mesh: withMesh = true, read = false }: { photo: Blob | null; overlays?: SkinScanOverlays | null; fallback?: JSX.Element | undefined; mesh?: boolean; read?: boolean }) {
  const url = useObjectUrl(photo);
  const { mesh } = useFaceMesh(withMesh ? photo : null);
  const [failed, setFailed] = useState(false);
  const shown = KEYS.filter((k) => PNG.test(overlays?.[k] ?? ""));

  if (fallback && (!url || !mesh || failed)) return fallback;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div data-testid="face-photo" className="relative aspect-[3/4] w-full max-w-[340px] select-none overflow-hidden rounded-media bg-surface">
        {url && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- transient object URL
          <img src={url} alt={C.photo.alt} className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-brand-muted">{url ? C.photo.failed : ""}</p>
        )}
        {url &&
          !failed &&
          shown.map((k) => (
            <div key={k} role="img" aria-label={C.photo.overlayAlt[k]} className="absolute inset-0 animate-in fade-in duration-200 motion-reduce:animate-none" style={{ ...STYLE[k], ...masked(overlays![k]!, LAYERS[k]) }} />
          ))}
        {mesh && url && !failed && <MeshLayer mesh={mesh} faint={shown.length > 0} />}
        {read && <div className="absolute left-2 top-2 rounded-full bg-brand-paper/90 px-3 py-1 text-xs font-semibold text-brand-ink">{C.photo.read}</div>}
      </div>
      {shown.length > 0 && <OverlayLegend shown={shown} />}
    </div>
  );
}
