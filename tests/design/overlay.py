"""Mockup match (G37): side-by-side and first-screenful overlays at 393 px.

    python3 -I tests/design/overlay.py <mockups dir> [screen ...]

Reads app shots from docs/design/mockup-match/shots/<NN>-<state>@393.png (made
by tests/design/match.config.ts, project 393; full page) and writes, per shot:
  docs/design/mockup-match/<NN>-<state>.png        mockup | whole app page | 50% overlay
  docs/design/mockup-match/<NN>-<state>-first.png  the first screenful (852 points) of the same

The mockups are phone renders (850 x 1850): the screen sits inside a dark
bezel and is 393 x 852 points at about 2x (01 has no bezel). The two are
aligned on their content tops, not on a fixed status-bar offset: the app has
no iOS status bar, and the mockups draw their header partly inside it.
"""
import sys
from pathlib import Path
from statistics import median
from PIL import Image

OUT = Path("docs/design/mockup-match")
SHOTS = OUT / "shots"
W, H = 393, 852
# Calibration knobs (points): the iOS status bar's height, the highest a mockup's
# content run may start (the status bar and island end above it), the ink
# threshold, and a per-screen vertical nudge if a detected top is off.
STATUS_BAR = 59
STATUS_TOP = 40
INK = 140
NUDGE: dict[str, int] = {}


def runs(flags):
    out, start = [], None
    for i, v in enumerate(flags + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    return out


def screen_box(im: Image.Image) -> tuple[int, int, int, int]:
    """Inner screen edges: the end of the dark bezel run on each side of three rows."""
    g = im.convert("L")
    w, h = g.size
    if all(g.getpixel((x, h // 2)) > 200 for x in range(w // 12)):  # no bezel (01): the whole image is the screen
        return 0, 0, w, min(h, round(H * w / W))
    lefts, rights = [], []
    for y in (h // 3, h // 2, 2 * h // 3):
        r = [q for q in runs([g.getpixel((x, y)) < 60 for x in range(w)]) if q[1] - q[0] >= 8]
        left = [q for q in r if q[1] < w // 4]
        right = [q for q in r if q[0] > 3 * w // 4]
        if left:
            lefts.append(left[-1][1])
        if right:
            rights.append(right[0][0])
    left = int(median(lefts)) if lefts else 36
    right = int(median(rights)) if rights else w - 36
    if not 770 <= right - left <= 800:  # a dark screen edge fooled the bezel scan
        left, right = 32, 819
    scale = (right - left) / W
    # Top: the end of the first dark run down two columns clear of the island
    # (the phone does not always sit as far from the top as from the side).
    tops = []
    for x in (w // 5, 4 * w // 5):
        r = [q for q in runs([g.getpixel((x, y)) < 60 for y in range(h // 4)]) if q[1] - q[0] >= 8]
        if r:
            tops.append(r[0][1])
    top = min(tops) if tops else left
    return left, top, right, top + round(H * scale)


def ink_rows(im: Image.Image) -> list[bool]:
    """Rows with dark pixels between x 12 and 320 (inside the bezel's edge, left of the header's right-hand icon)."""
    g = im.convert("L")
    return [any(g.getpixel((x, y)) < INK for x in range(12, 320)) for y in range(g.height)]


def mockup_top(im: Image.Image) -> int:
    """The first content row below the status bar: the start of the ink run at or after y 59."""
    rows = ink_rows(im)
    y = next((y for y in range(STATUS_BAR, H) if rows[y]), STATUS_BAR)
    while y > STATUS_TOP and rows[y - 1]:  # the header straddles y 59: walk up to the start of its run
        y -= 1
    return y


def app_top(im: Image.Image) -> int:
    return next((y for y, r in enumerate(ink_rows(im)) if r), 0)


def mockup_screen(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGB")
    return im.crop(screen_box(im)).resize((W, H), Image.LANCZOS)


def app_page(path: Path) -> Image.Image:
    shot = Image.open(path).convert("RGB")
    return shot.resize((W, round(shot.height * W / shot.width)), Image.LANCZOS)


def panels(a: Image.Image, b: Image.Image) -> Image.Image:
    """mockup | app | 50% overlay, as tall as the app panel."""
    gap, h = 16, b.height
    a_full = Image.new("RGB", (W, h), "white")
    a_full.paste(a.crop((0, 0, W, min(H, h))), (0, 0))
    c = Image.new("RGB", (W * 3 + gap * 2, h), "white")
    for i, im in enumerate((a_full, b, Image.blend(a_full, b, 0.5))):
        c.paste(im, (i * (W + gap), 0))
    return c


def compare(mockup: Path, shot: Path, state: str) -> tuple[int, int]:
    a = mockup_screen(mockup)
    page = app_page(shot)
    ma, pa = mockup_top(a), app_top(page)
    shift = ma - pa + NUDGE.get(state, 0)
    b = Image.new("RGB", (W, max(H, page.height + shift)), "white")
    b.paste(page.crop((0, max(0, -shift), W, page.height)), (0, max(0, shift)))
    panels(a, b).save(OUT / f"{state}.png", optimize=True)
    panels(a, b.crop((0, 0, W, H))).save(OUT / f"{state}-first.png", optimize=True)
    return ma, pa


def main() -> None:
    mockups = Path(sys.argv[1])
    only = set(sys.argv[2:])
    shots = sorted(SHOTS.glob("*@393.png"))
    if not shots:
        sys.exit(f"no shots in {SHOTS}")
    for shot in shots:
        state = shot.stem.split("@")[0]
        nn = state[:2]
        if only and nn not in only and state not in only:
            continue
        ms = sorted(mockups.glob(f"{nn}-*.png"))
        if not ms:
            print(f"{state}: no mockup {nn} (kit-matched only)")
            continue
        ma, pa = compare(ms[0], shot, state)
        print(f"{state}: content top mockup {ma} pt, app {pa} pt (shift {ma - pa:+d})")


if __name__ == "__main__":
    main()
