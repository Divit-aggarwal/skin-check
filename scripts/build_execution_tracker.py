"""Build docs/PROJECT_SKIN_EXECUTION_TRACKER.xlsx from the Markdown tracker.

The Markdown file is the source of truth. Edit it, then run:
    uv run --with openpyxl python scripts/build_execution_tracker.py

One sheet per Markdown table. Refuses to write if a Build/Check status is not an allowed value.
"""
import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font

ROOT = Path(__file__).resolve().parent.parent
MD = ROOT / "docs/PROJECT_SKIN_EXECUTION_TRACKER.md"
XLSX = ROOT / "docs/PROJECT_SKIN_EXECUTION_TRACKER.xlsx"

BUILD = {"NOT STARTED", "IN PROGRESS", "DONE", "BLOCKED", "OWNER ACTION", "LATER"}
CHECK = {"NOT CHECKED", "CHECKED LOCAL", "CHECKED PROD", "NOT NEEDED"}


def cells(line):
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line)[1:-1]]


tables, heading, current = [], "Tracker", None
for line in MD.read_text().splitlines():
    if line.startswith("#"):
        heading, current = line.lstrip("#").strip(), None
    elif line.startswith("|"):
        if current is None:
            current = (heading, [])
            tables.append(current)
        if not line.startswith("|---"):
            current[1].append(cells(line))
    else:
        current = None

for name, rows in tables:
    head = rows[0]
    for col, allowed in (("Build status", BUILD), ("Check status", CHECK)):
        if col in head:
            i = head.index(col)
            bad = [(r[0], r[i]) for r in rows[1:] if r[i] not in allowed]
            assert not bad, f"{name}: bad {col}: {bad}"

wb = Workbook()
wb.remove(wb.active)
used = set()
for name, rows in tables:
    title = re.sub(r"[\[\]:*?/\\]", "", name)[:31]
    while title in used:
        title = title[:29] + str(len(used))
    used.add(title)
    ws = wb.create_sheet(title)
    for r in rows:
        ws.append(r)
    for c in ws[1]:
        c.font = Font(bold=True)
    for row in ws.iter_rows():
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "B2"
wb.save(XLSX)
print(f"OK: {len(tables)} tables -> {XLSX.name}")
