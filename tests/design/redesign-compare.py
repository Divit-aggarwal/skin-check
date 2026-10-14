"""Redesign review side-by-sides: mockup left, app right, one table for every screen.

    python3 -I tests/design/redesign-compare.py <mockups dir>

The mockups live outside the repo (design/mockups in the main checkout). Each
app shot is scaled to the mockup's width and cut to its height (the first
screen of a full-page shot). Output: docs/design/redesign/<dir>/compare-<name>.png.
"""
import sys
from pathlib import Path
from PIL import Image

R = Path("docs/design/redesign")
# (mockup file, app shot under docs/design/redesign, output name)
TABLE = [
    ("01-today.png", "phase2/p2-01-today.png", "phase2/compare-01-today.png"),
    ("02-environment.png", "phase2/p2-02-environment.png", "phase2/compare-02-environment.png"),
    ("03-todays-routine.png", "phase2/p2-03-routine.png", "phase2/compare-03-routine.png"),
    ("05-weekly-skin-check.png", "capture/05-start.png", "capture/compare-05-weekly-skin-check.png"),
    ("07-guided-capture.png", "capture/07-capture-before.png", "capture/compare-07-guided-capture.png"),
    ("08-weekly-checkin.png", "capture/08-checkin.png", "capture/compare-08-weekly-checkin.png"),
    ("09-weekly-report.png", "checks/09-opened-check-photo.png", "checks/compare-09-opened-check.png"),
    ("10-skin-twin-home.png", "checks/10-checks-overview.png", "checks/compare-10-checks-overview.png"),
    ("11-concern-detail.png", "checks/11-reading.png", "checks/compare-11-reading.png"),
    ("12-progress.png", "checks/12-readings.png", "checks/compare-12-readings.png"),
    ("12-progress.png", "checks/12-photos.png", "checks/compare-12-photos.png"),
    ("06-personalised-routine.png", "products/06-routine-setup.png", "products/compare-06-routine-setup.png"),
    ("14-product-recommendation.png", "products/14-product-cards.png", "products/compare-14-product-cards.png"),
    ("15-product-detail.png", "products/15-product-detail.png", "products/compare-15-product-detail.png"),
    ("18-echo-home.png", "echo/18-echo-home.png", "echo/compare-18-echo-home.png"),
    ("19-echo-conversation.png", "echo/19-echo-conversation.png", "echo/compare-19-echo-conversation.png"),
    ("20-notifications.png", "account/20-notifications-flags.png", "account/compare-20-notifications.png"),
    ("21-profile.png", "account/21-profile.png", "account/compare-21-profile.png"),
    ("22-privacy.png", "account/22-privacy-flags.png", "account/compare-22-privacy.png"),
]


def compare(mockup: Path, shot: Path, out: Path) -> None:
    a = Image.open(mockup).convert("RGB")
    b = Image.open(shot).convert("RGB")
    b = b.resize((a.width, round(b.height * a.width / b.width)))
    b = b.crop((0, 0, a.width, min(b.height, a.height)))
    gap = 40
    c = Image.new("RGB", (a.width * 2 + gap, a.height), "white")
    c.paste(a, (0, 0))
    c.paste(b, (a.width + gap, 0))
    c.save(out, optimize=True)


def main() -> None:
    mockups = Path(sys.argv[1])
    missing = [s for _, s, _ in TABLE if not (R / s).exists()]
    if missing:
        sys.exit(f"missing shots: {missing}")
    for m, s, o in TABLE:
        compare(mockups / m, R / s, R / o)
        print(o)


if __name__ == "__main__":
    main()
