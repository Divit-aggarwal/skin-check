"""Phase 0 analysis: per field x region responses (ANALYSIS_PLAN §10, CLASSIFICATION_RULE.md).

    python analyse.py > results/summary.md      (writes results/summary.json too)
"""
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, os.environ.get("RESULTS_DIR", "results"))
matrix = json.load(open(os.path.join(R, "matrix.json")))
states = {s["variant"]: s["skinState"] for s in json.load(open(os.path.join(R, "skinstates.json")))}
rows = {r["variant"]: r for r in matrix["rows"]}
REGIONS = ["cheeks", "forehead", "nose", "chin"]

FIELDS = {
    "corrected.aStarMean": ("colour", "corrected", "aStarMean"),
    "corrected.aStarP90": ("colour", "corrected", "aStarP90"),
    "corrected.aStarSd": ("colour", "corrected", "aStarSd"),
    "corrected.bStarMean": ("colour", "corrected", "bStarMean"),
    "corrected.lStarMeanPostClahe": ("colour", "corrected", "lStarMeanPostClahe"),
    "corrected.lStarSdPostClahe": ("colour", "corrected", "lStarSdPostClahe"),
    "native.aStarMean": ("colour", "native", "aStarMean"),
    "native.aStarP90": ("colour", "native", "aStarP90"),
    "native.aStarSd": ("colour", "native", "aStarSd"),
    "native.bStarMean": ("colour", "native", "bStarMean"),
    "native.lStarMean": ("colour", "native", "lStarMean"),
    "native.lStarSd": ("colour", "native", "lStarSd"),
    "texture.laplacianVarMean": ("texture", "laplacianVarMean"),
    "texture.lbpEntropy": ("texture", "lbpEntropy"),
    "texture.gradientMean": ("texture", "gradientMean"),
    "specular.fraction": ("specular", "fraction"),
    "pixelCount": ("pixelCount",),
}
# intended-change perturbation and realised channel, per field (CLASSIFICATION_RULE)
INTENDED = {
    "corrected.aStarMean": ("faceA", "a"), "corrected.aStarP90": ("faceA", "a"),
    "native.aStarMean": ("faceA", "a"), "native.aStarP90": ("faceA", "a"),
    "corrected.lStarMeanPostClahe": ("faceL", "L"), "native.lStarMean": ("faceL", "L"),
    "corrected.bStarMean": ("faceB", "b"), "native.bStarMean": ("faceB", "b"),  # EXPLORATORY
}


def get(state, region, field):
    reg = state["regions"][region]
    if reg["status"] != "available":
        return None
    path = FIELDS[field]
    if path[0] == "pixelCount":
        return reg["pixelCount"]
    if path[0] == "colour":
        block = reg["colour"][path[1]]
        return None if block is None else block[path[2]]
    return reg[path[0]][path[1]]


def ita(state, region):
    L, b = get(state, region, "native.lStarMean"), get(state, region, "native.bStarMean")
    return math.degrees(math.atan((L - 50) / b))


def hist_summary(h):
    counts = np.array(h["counts"], float)
    edges = np.array(h["edges"], float)
    centres = (edges[:-1] + edges[1:]) / 2
    return float((counts * centres).sum() / counts.sum())


def clip_mass(clip, px):
    return (clip["underflow"] + clip["overflow"]) / px if px else None


def levels(kind):
    return sorted([r for r in rows.values() if r["kind"] == kind], key=lambda r: r["level"])


def slope0(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    return float((x * y).sum() / (x * x).sum())


def monotone(levels_, deltas):
    order = np.argsort(levels_)
    d = np.diff(np.asarray(deltas)[order])
    return bool(np.all(d > 0) or np.all(d < 0))


base = states["baseline_0"]
out = {"fields": {}, "ita": {}, "hist": {}, "scores": {}, "harness": {}}

# harness: realised vs nominal
for kind, ch in (("faceA", "a"), ("faceL", "L"), ("faceB", "b")):
    for reg in REGIONS:
        lv = levels(kind)
        x = [r["level"] for r in lv]
        y = [r["realised"][reg][ch] - rows["baseline_0"]["realised"][reg][ch] for r in lv]
        out["harness"].setdefault(kind, {})[reg] = {"slope": slope0(x, y), "realisedAtMax": y[-1] if kind != "faceL" else y[0]}

for field in FIELDS:
    fo = out["fields"][field] = {}
    for reg in REGIONS:
        b0 = get(base, reg, field)
        if b0 is None:
            fo[reg] = None
            continue
        d = lambda v: get(states[v], reg, field) - b0  # noqa: E731
        res = {"baseline": b0}
        if field in INTENDED:
            kind, ch = INTENDED[field]
            lv = levels(kind)
            xr = [r["realised"][reg][ch] - rows["baseline_0"]["realised"][reg][ch] for r in lv]
            dy = [d(r["variant"]) for r in lv]
            res["intended"] = {
                "kind": kind, "levels": [r["level"] for r in lv], "delta": dy, "realised": xr,
                "engineSlope": slope0(xr, dy), "monotone": monotone([r["level"] for r in lv], dy),
            }
        for kind in ("faceA", "faceL", "faceB"):
            res[kind] = {str(r["level"]): d(r["variant"]) for r in levels(kind)}
        res["bgA"] = {str(r["level"]): d(r["variant"]) for r in levels("bgA")}
        res["bgB"] = {str(r["level"]): d(r["variant"]) for r in levels("bgB")}
        res["leakPct10"] = max(abs(res["bgA"]["10"]), abs(res["bgA"]["-10"]), abs(res["bgB"]["10"]), abs(res["bgB"]["-10"])) / 10 * 100
        for kind in ("exposure", "blur", "scale", "jpeg"):
            res[kind] = {str(r["level"]): d(r["variant"]) for r in levels(kind)}
        res["pctOfBaseline"] = {f"{k}:{lv_}": (100 * res[k][lv_] / b0 if b0 else None)
                                for k, lv_ in (("blur", "1"), ("blur", "2"), ("scale", "0.8"), ("scale", "0.6"),
                                               ("jpeg", "0.75"), ("exposure", "-1"), ("exposure", "1"))}
        fo[reg] = res

# D1 ITA on every region (primary: cheeks)
for reg in REGIONS:
    b0 = ita(base, reg)
    o = {"baseline": b0}
    for kind in ("faceL", "faceB", "faceA", "bgA", "bgB", "exposure"):
        o[kind] = {str(r["level"]): ita(states[r["variant"]], reg) - b0 for r in levels(kind)}
    # ITA the engine should report if it passed the realised change through exactly
    lv = levels("faceL")
    exp_ = []
    for r in lv:
        rl = r["realised"][reg]
        r0 = rows["baseline_0"]["realised"][reg]
        exp_.append(math.degrees(math.atan((rl["L"] - 50) / rl["b"])) - math.degrees(math.atan((r0["L"] - 50) / r0["b"])))
    o["faceLExpectedFromRealised"] = {str(r["level"]): e for r, e in zip(lv, exp_)}
    out["ita"][reg] = o

# histogram adequacy + centroid
for reg in REGIONS:
    rg = base["regions"][reg]
    px = rg["pixelCount"]
    h = {}
    for path, hist, clip in (
        ("corrected.aStarHist", rg["colour"]["corrected"]["aStarHist"], rg["colour"]["corrected"]["aStarHistClip"]),
        ("native.aStarHist", rg["colour"]["native"]["aStarHist"], rg["colour"]["native"]["aStarHistClip"]),
        ("texture.localLContrastHist", rg["texture"]["localLContrastHist"], rg["texture"]["localLContrastHistClip"]),
        ("native.localLContrastHist", rg["colour"]["native"]["localLContrastHist"], rg["colour"]["native"]["localLContrastHistClip"]),
    ):
        h[path] = {"clipMass": clip_mass(clip, px), "centroid": hist_summary(hist)}
    for path in ("corrected.aStarHist", "native.aStarHist"):
        blk = path.split(".")[0]
        h[path]["faceA8CentroidDelta"] = hist_summary(states["faceA_8"]["regions"][reg]["colour"][blk]["aStarHist"]) - h[path]["centroid"]
        h[path]["faceA8ClipMass"] = clip_mass(states["faceA_8"]["regions"][reg]["colour"][blk]["aStarHistClip"],
                                              states["faceA_8"]["regions"][reg]["pixelCount"])
    out["hist"][reg] = h

# deprecated scores: document only
for v in ("baseline_0", "faceA_8", "faceL_-8", "exposure_-1", "exposure_1", "bgA_10"):
    out["scores"][v] = rows[v]["response"]["scores"]

# determinism
det_path = os.path.join(R, "determinism.json")
if os.path.exists(det_path):
    det = json.load(open(det_path))
    out["determinism"] = {k: {"n": len(v), "distinct": len({h["sha256"] for h in v})} for k, v in det["hashes"].items()}

json.dump(out, open(os.path.join(R, "summary.json"), "w"), indent=1, sort_keys=True)


def f(x, nd=2):
    return "—" if x is None else f"{x:+.{nd}f}"


print("## Harness: realised / nominal\n")
for kind, regs in out["harness"].items():
    print(kind, {r: round(v["slope"], 3) for r, v in regs.items()})
print("\n## Intended-change slopes (engine Δ / realised Δ), monotone, max bg leak %\n")
print("| field | " + " | ".join(REGIONS) + " |\n|---|" + "---|" * len(REGIONS))
for field in INTENDED:
    cells = []
    for reg in REGIONS:
        r = out["fields"][field][reg]
        i = r["intended"]
        cells.append(f"{i['engineSlope']:.3f} {'mono' if i['monotone'] else 'NON-mono'}, leak {r['leakPct10']:.0f}%")
    print(f"| {field} | " + " | ".join(cells) + " |")
print("\n## All fields: Δ per perturbation, cheeks/forehead/nose/chin\n")
for field in FIELDS:
    print(f"\n### {field}")
    for reg in REGIONS:
        r = out["fields"][field][reg]
        if r is None:
            print(reg, "absent")
            continue
        print(f"{reg}: base {r['baseline']:.4g} | faceA {[round(v, 3) for v in r['faceA'].values()]} | faceL {[round(v, 3) for v in r['faceL'].values()]}"
              f" | faceB* {[round(v, 3) for v in r['faceB'].values()]} | bgA {[round(v, 3) for v in r['bgA'].values()]} | bgB {[round(v, 3) for v in r['bgB'].values()]}"
              f" | exp {[round(v, 3) for v in r['exposure'].values()]} | blur {[round(v, 4) for v in r['blur'].values()]}"
              f" | scale {[round(v, 4) for v in r['scale'].values()]} | jpeg {[round(v, 4) for v in r['jpeg'].values()]}")
print("\n## ITA\n")
for reg, o in out["ita"].items():
    print(reg, json.dumps({k: (round(v, 3) if isinstance(v, float) else {kk: round(vv, 3) for kk, vv in v.items()}) for k, v in o.items()}))
print("\n## Histograms\n")
print(json.dumps(out["hist"], indent=1))
print("\n## Deprecated scores\n")
print(json.dumps(out["scores"], indent=1))
print("\n## Determinism\n")
print(json.dumps(out.get("determinism", "pending"), indent=1))

# Q3 yardstick: spread under chroma-only perturbations, which carry no texture/shine change
# (faceA, faceB, bgA, bgB). A confounder response inside this spread is not distinguishable
# from the engine's sensitivity to arbitrary small input changes (landmark/mask jitter).
print("\n## Texture / specular: chroma-only spread vs confounders (|Δ|, and % of baseline)\n")
print("| field | region | baseline | chroma-only max|Δ| | blur 0.5/1/2 | scale 0.8/0.6 | jpeg 0.75 | exposure -1/-0.5/+0.5/+1 |\n|---|---|---|---|---|---|---|---|")
for field in ("texture.laplacianVarMean", "texture.lbpEntropy", "texture.gradientMean", "specular.fraction", "pixelCount"):
    for reg in REGIONS:
        r = out["fields"][field][reg]
        null = max(abs(v) for k in ("faceA", "faceB", "bgA", "bgB") for v in r[k].values())
        pc = lambda v: f"{v:+.3g} ({100 * v / r['baseline']:+.1f}%)"  # noqa: E731
        r["chromaOnlySpread"] = null
        print(f"| {field} | {reg} | {r['baseline']:.4g} | {null:.3g} ({100 * null / r['baseline']:.1f}%) | "
              + ", ".join(pc(r['blur'][k]) for k in ("0.5", "1", "2")) + " | "
              + ", ".join(pc(r['scale'][k]) for k in ("0.8", "0.6")) + f" | {pc(r['jpeg']['0.75'])} | "
              + ", ".join(pc(r['exposure'][k]) for k in ("-1", "-0.5", "0.5", "1")) + " |")
print("\n## Colour: exposure response vs the intended-change response\n")
print("| field | region | exposure -1/-0.5/+0.5/+1 EV (Δ, field units) |\n|---|---|---|")
for field in ("native.lStarMean", "native.aStarMean", "native.bStarMean", "corrected.lStarMeanPostClahe", "corrected.aStarMean", "corrected.bStarMean"):
    for reg in REGIONS:
        e = out["fields"][field][reg]["exposure"]
        print(f"| {field} | {reg} | " + ", ".join(f"{e[k]:+.2f}" for k in ("-1", "-0.5", "0.5", "1")) + " |")
json.dump(out, open(os.path.join(R, "summary.json"), "w"), indent=1, sort_keys=True)
