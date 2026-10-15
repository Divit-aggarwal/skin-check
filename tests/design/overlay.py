"""Mockup match (G37): overlay diff and side-by-side for each screen at 393 px.

    python3 -I tests/design/overlay.py <mockups dir> [screen ...]

Reads app shots from docs/design/mockup-match/shots/<NN>-<state>@393.png (made
by tests/design/match.shots config, project 393) and writes, per shot:
  docs/design/mockup-match/<NN>-<state>.png   mockup | app | 50% overlay
and prints a mean pixel difference (0 = identical) to steer iteration.

The mockups are phone renders (850 x 1850): the screen sits inside a dark
bezel and is 393 x 852 points at about 2x. The app has no iOS status bar, so
its shot (393 x 793) is placed under STATUS_BAR points of white.
"""
import sys
from pathlib import Path
from statistics import median
from PIL import Image, ImageChops, ImageStat

OUT = Path("docs/design/mockup-match")
SHOTS = OUT / "shots"
W, H = 393, 852
# Calibration knobs: iPhone 15 status bar height; per-screen vertical nudge (points) if a mockup sits off.
STATUS_BAR = 59
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
    lefts, rights = [], []
    for y in (h // 3, h // 2, 2 * h // 3):
        r = [q for q in runs([g.getpixel((x, y)) < 60 for x in range(w)]) if q[1] - q[0] >= 8]
        left = [q for q in r if q[1] < w // 4]
        right = [q for q in r if q[0] > 3 * w // 4]
        if left:
            lefts.append(left[-1][1])
        if right:
            rights.append(right[0][0])
    if not lefts and not rights:  # a bare screen with no phone frame (01)
        return 0, 0, w, round(H * w / W)
    left = int(median(lefts)) if lefts else 36
    right = int(median(rights)) if rights else w - 36
    if not 770 <= right - left <= 800:  # a dark screen edge (01's hero) fooled the bezel scan
        left, right = 32, 819
    scale = (right - left) / W
    top = left  # the bezel is the same width on every side
    return left, top, right, top + round(H * scale)


def mockup_screen(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGB")
    return im.crop(screen_box(im)).resize((W, H), Image.LANCZOS)


def app_screen(path: Path, nudge: int) -> Image.Image:
    shot = Image.open(path).convert("RGB")
    shot = shot.resize((W, round(shot.height * W / shot.width)), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), "white")
    canvas.paste(shot.crop((0, 0, W, H - STATUS_BAR - nudge)), (0, STATUS_BAR + nudge))
    return canvas


def compare(mockup: Path, shot: Path, out: Path) -> float:
    a = mockup_screen(mockup)
    b = app_screen(shot, NUDGE.get(shot.stem.split("@")[0], 0))
    over = Image.blend(a, b, 0.5)
    gap = 16
    c = Image.new("RGB", (W * 3 + gap * 2, H), "white")
    for i, im in enumerate((a, b, over)):
        c.paste(im, (i * (W + gap), 0))
    c.save(out, optimize=True)
    # Below the status bar only: the status bar is an allowed difference.
    box = (0, STATUS_BAR, W, H)
    return sum(ImageStat.Stat(ImageChops.difference(a.crop(box), b.crop(box))).mean) / 3


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
        score = compare(ms[0], shot, OUT / f"{state}.png")
        print(f"{state}: mean diff {score:.1f}")


if __name__ == "__main__":
    main()
