# Face mesh and the two photo readings (TD-37, TD-39)

TD-39 (owner, 2026-10-11) replaced the chips: the results show one photo with
the mesh and both overlays and one readings table; Breakouts, Texture and Dark
marks are not shown anywhere. See docs/design/system.md §5.

Owner brief 2026-10-10, decisions TD-37 (1)–(5) in the tracker. Built on
`feat/mesh-two-readings` (G18, G19, F22).

## 1. What is shown

| Reading | Shown as | Overlay | Where the value lives |
|---|---|---|---|
| Redness, Oiliness | Low / Moderate / Elevated from the photo | Yes, with the mesh | Server record, unchanged |
| Breakouts, Texture, Dark marks | Not shown (TD-39). Echo still uses the user's answers about them as things the user said, never as measured | Never | Server record, unchanged (TD-37 (4)), never shown |
| Dryness, Pores | Not shown (unchanged) | Never | Server record |

One list in code decides this: `PHOTO_METRICS` and `ANSWER_TOPICS` in
`lib/skin-check-skus.ts`. Every screen reads its readings through `bandsOf`
(`components/dashboard/state.ts`), so Home, Checks, an opened check, the
results screen, Echo's panel and old checks all follow it. The summary line
and top concerns (`summarizeConcerns`), the overlays asked for
(`OVERLAY_CATEGORIES`), the legacy prompt (`summarizeSkinScanScores`) and the
context package (`lib/context/builder.ts`, ctx-4 / ctx-5) read the same list.

The readings table has fixed columns (Redness, Oiliness) and fixed rows (whole
face, then the areas in Echo's order). Nothing is ever sorted by band.

## 2. Where the mesh points come from

The engine (skin-scan 0.1.6, `ScanResponse`) returns no landmark points. The
browser finds them with `@mediapipe/tasks-vision`, pinned at exactly `0.10.35`
(package.json, `MEDIAPIPE_VERSION`, lockfile; `tests/face-mesh.test.ts`).
This is the same 468-point face topology the engine uses. TD-39 removed the
area outlines on the photo, so only the mesh lines are drawn
(`lib/face-mesh/regions.ts`).

- Why 0.10.35 and not the newer 1.0.x: the privacy review (2026-10-11) found
  that 1.0.0 and 1.0.1 POST usage logs (device class, library version, task,
  timings) to `odml.pa.googleapis.com` every 60 seconds, with no off switch.
  0.10.35 has no such code. `tests/face-mesh.test.ts` fails if a version
  change brings it back.
- Loaded by `import()` only, from `components/mesh/landmarks.ts`. It starts
  when a photo is confirmed (capture), and on screens that show a check's
  results with a photo (results, Home, an opened check). No other page loads it.
- Wasm and model are served from our own site, never an outside address:

| File | Source | Licence | sha256 |
|---|---|---|---|
| `public/mediapipe/face_landmarker-64184e22.task` (3.6 MB, committed) | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task, downloaded 2026-10-11 | Apache-2.0 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| `/mediapipe/0.10.35/wasm/*` (11 MB with SIMD, 10.5 MB without) | Copied from `node_modules/@mediapipe/tasks-vision/wasm` by next.config.js on every dev start and build; not committed | Apache-2.0 | npm lockfile integrity |

- The photo never leaves the device for the mesh, and the points are never
  stored or sent. The kept photo on Home and an opened check is read from
  the same signed link as the thumbnail. Reading its pixels needs a GET rule
  in the photo bucket's CORS settings (H32, owner queue). Until that rule
  exists, those screens show the face drawing.
- GPU first, then CPU. The photo is scaled to 1024 px wide before the search.

## 3. How the mesh is drawn

- A map, never a finding. One thin, even, white line per edge, in a single
  SVG path. No points, no dots, no colour by place or by reading, nothing filled and
  nothing to choose (TD-39). On the results it sits over the two overlays.
- Scanning: while the photo is read, one soft white band sweeps down. It
  moves by CSS transform only, so the mesh is never redrawn per frame. Under
  reduced motion the band is gone and the mesh stays still.
- No mesh (no face found, the library failed, a slow network): the results
  screen shows the photo alone, or the skeleton if there is no photo. The
  analysis never waits for the mesh. Home and an opened check show the face
  drawing.
- A failed check gets no mesh.

## 4. Echo

The context package sends readings and across-check facts for redness and
oiliness only. A missing item says "Photos do not measure breakouts, texture
or dark marks yet." What the user said about them still goes as
self-reported facts. The validator was not changed. A band or a description
for the three now fails, because the package holds no reading for them
(`tests/context-validator.test.ts`, TD-37 block). Product reasons cite only
the user's answers (validator `product_reason` rule), so they are unaffected.
