"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import type { EchoRegion } from "@/lib/echo-regions";
import { areaOutlines, meshPath, polygonPath } from "@/lib/face-mesh/regions";
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

const DRAW_ORDER: EchoRegion[] = ["cheeks", "forehead", "chin", "nose"];

export interface AreaChoice {
  selected: EchoRegion | null;
  labels: Record<EchoRegion, string>;
  available: readonly EchoRegion[];
  onSelect: (region: EchoRegion | null) => void;
}

/**
 * The face mesh over a photo shown with object-cover (TD-37 (2)). A map of
 * the face, never a finding: one thin, even, white line for every edge, no
 * points, no colour by place or reading. The only area ever marked is the one
 * the user chose (the brand tint and a solid green outline, system.md §2):
 * `areas` makes the areas buttons; `highlight` only marks one (the results
 * photo, whose area is chosen on the drawing beside it). `scanning` adds a
 * band that sweeps down while the photo is read; none under reduced motion.
 */
export function MeshLayer({ mesh, scanning = false, areas, highlight = null }: { mesh: FaceMesh; scanning?: boolean; areas?: AreaChoice; highlight?: EchoRegion | null }) {
  const maskId = useId();
  const lines = useMemo(() => meshPath(mesh.points, mesh.edges), [mesh]);
  const outlines = useMemo(() => areaOutlines(mesh.points), [mesh]);
  const { width: w, height: h } = mesh;
  // 12px at the phone width (240px shown), never under the design system's minimum.
  const font = Math.round(w * 0.05);
  const chosen = areas ? areas.selected : highlight;

  const choose = (r: EchoRegion) => areas?.onSelect(areas.selected === r ? null : r);
  const keys = (r: EchoRegion) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(r);
    }
  };
  const maskOf = (r: EchoRegion) => `url(#${maskId}-${r})`;

  return (
    <>
      <svg
        aria-hidden={areas ? undefined : true}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full animate-in fade-in duration-200 motion-reduce:animate-none"
      >
        {outlines && (
          <defs>
            {DRAW_ORDER.map((r) => (
              <mask key={r} id={`${maskId}-${r}`}>
                <path d={polygonPath(outlines[r].fill)} fill="white" />
                <path d={polygonPath(outlines[r].holes)} fill="black" />
              </mask>
            ))}
          </defs>
        )}
        <path d={lines} fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
        {outlines &&
          areas &&
          // Cheeks first: their outline wraps round the nose and mouth, so the smaller areas sit on top for a tap.
          DRAW_ORDER.filter((r) => areas.available.includes(r)).map((r) => {
            const o = outlines[r];
            const on = areas.selected === r;
            return (
              <g key={r} role="button" tabIndex={0} aria-pressed={on} aria-label={areas.labels[r]} onClick={() => choose(r)} onKeyDown={keys(r)} className="group cursor-pointer outline-none">
                {/* The tap target is the whole area. A dark under-line keeps the dashed outline visible on fair skin. */}
                <path d={polygonPath(o.fill)} mask={maskOf(r)} fill="none" stroke="#2C2C2A" strokeOpacity={0.45} strokeWidth={3} vectorEffect="non-scaling-stroke" />
                <path
                  d={polygonPath(o.fill)}
                  mask={maskOf(r)}
                  vectorEffect="non-scaling-stroke"
                  className="fill-white/0 stroke-white [stroke-dasharray:5_4] [stroke-width:1.5] group-hover:fill-brand-mist/30 group-focus-visible:stroke-brand-forest group-focus-visible:[stroke-dasharray:none] group-focus-visible:[stroke-width:3]"
                />
              </g>
            );
          })}
        {/* The chosen area last, above every other outline, and never a tap target. */}
        {outlines && chosen && (
          <path
            d={polygonPath(outlines[chosen].fill)}
            mask={maskOf(chosen)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            className="fill-brand-mist/60 stroke-brand-forest [stroke-width:2.5]"
          />
        )}
        {outlines &&
          areas &&
          DRAW_ORDER.filter((r) => areas.available.includes(r)).flatMap((r) =>
            outlines[r].label.map(([x, y]) => (
              <text
                key={`${r}-${x}-${y}`}
                aria-hidden
                pointerEvents="none"
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={font}
                fontWeight={areas.selected === r ? 700 : 600}
                paintOrder="stroke"
                stroke="#FFFFFF"
                strokeWidth={font * 0.28}
                strokeLinejoin="round"
                className={areas.selected === r ? "fill-brand-forest font-body" : "fill-brand-ink font-body"}
              >
                {areas.labels[r]}
              </text>
            ))
          )}
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
