# Assets

Every image, icon and font the app ships, with its source and licence (TD-52, G37).

Rules (owner, 2026-10-15):
- **Skin images:** a result, progress, comparison or Skin Twin screen shows only the user's own photos. Never stock.
- **Product images:** product photos come from our own store (theprojectskin.com, via its products.json) and are drawn through next/image.
- **Other imagery:** free for commercial use with no attribution traps (Unsplash, Pexels, Lucide, unDraw-style, or our own SVG), and only in decorative or explanatory places.
- **Storage:** downloaded into the repo, never hotlinked. Every new asset gets a row here in the same commit.

| Asset | Where it is used | Source | Licence | Notes |
|---|---|---|---|---|
| Plus Jakarta Sans (variable, v2.071) | All text (`app/fonts/plus-jakarta-sans/`) | https://github.com/tokotype/PlusJakartaSans | SIL OFL 1.1 (`OFL.txt` alongside) | PR #24 |
| Lucide icons | Icons throughout (`lucide-react`) | https://lucide.dev | ISC | npm package, no files copied |
| Echo avatar | `EchoAvatar` in `components/ui/kit.tsx` | Our own SVG, drawn to match mockup 18 | Ours | No external source |
| MediaPipe wasm | Face mesh and live capture checks (`public/mediapipe/0.10.35/`) | `@mediapipe/tasks-vision` 0.10.35 | Apache 2.0 | Copied from the pinned package at build |
| Face landmarker model | `public/mediapipe/face_landmarker-64184e22.task` | https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker (Google model card) | Apache 2.0 | Committed with TD-37 |
| Product photos | Screens 03, 06, 14, 15, 16 | Our store: `cdn.shopify.com/s/files/1/1006/6100/2611/` | Ours (owner's store) | Live from products.json; the serum's first image is a screenshot (E23) |
