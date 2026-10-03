"""Phase 0 bench (PROTOCOL §4.4, §4.3): perturb, client-transform, score over HTTP.

Research harness only. Run with the skin-scan repo's pinned venv (mediapipe
0.10.21, opencv 4.11.0, numpy 1.26.4), against a locally running container of
the pinned production digest:

    SKIN_SCAN_REPO=../skin-scan ENGINE_URL=http://127.0.0.1:18000 \
    SCAN_SECRET=... ../skin-scan/.venv/bin/python bench.py matrix|determinism

The engine's own detector and mask builder are imported in-process ONLY to
build injection masks and to measure the realised input change. Every
reported field value comes from POST /scan?stats=both on the pinned digest.
Images are written to OUT_IMG (scratch, never committed); only responses and
hashes go to results/.
"""
import hashlib
import io
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from PIL import Image
from skimage import color

REPO = os.environ["SKIN_SCAN_REPO"]
sys.path.insert(0, os.path.join(REPO, "src"))
from pipeline.face_mesh import _OVAL, _hull_mask, _dilate, get_detector, make_region_masks  # noqa: E402
from pipeline.preprocess import preprocess  # noqa: E402

ENGINE = os.environ.get("ENGINE_URL", "http://127.0.0.1:18000")
SECRET = os.environ["SCAN_SECRET"]
HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
OUT_IMG = os.environ["OUT_IMG"]
SOURCE = os.path.join(REPO, "fixtures", "input_face.png")

FACE_DILATE_PX = 12  # injection covers every engine region mask with margin
BG_GUARD_PX = 40  # background cast stays this far outside the face oval

# PROTOCOL §4.4, verbatim levels. EXPLORATORY rows are marked and never drive A3/A4.
MATRIX = (
    [("baseline", 0, False)]
    + [("faceA", v, False) for v in (1, 2, 4, 8)]
    + [("faceL", v, False) for v in (-2, -4, -8)]
    + [("bgA", v, False) for v in (-10, -5, 5, 10)]
    + [("bgB", v, False) for v in (-10, -5, 5, 10)]
    + [("exposure", v, False) for v in (-1, -0.5, 0.5, 1)]
    + [("blur", v, False) for v in (0.5, 1, 2)]
    + [("scale", v, False) for v in (0.6, 0.8)]
    + [("jpeg", 0.75, False)]
    + [("faceB", v, True) for v in (1, 2, 4, 8)]  # not in PROTOCOL: b* has no intended perturbation there
)


def load_rgb() -> np.ndarray:
    # Alpha is 255 everywhere (checked); ICC is ignored, as the engine ignores it.
    return np.array(Image.open(SOURCE).convert("RGB"))


def landmarks_and_masks(rgb: np.ndarray):
    """Same steps the engine takes: preprocess -> detect -> region masks."""
    pre = preprocess(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    lm = get_detector().detect(pre)
    assert lm is not None, "no face on source"
    assert pre.shape[:2] == rgb.shape[:2], "source must not be resized by preprocess (<=1024)"
    return lm, make_region_masks(lm, pre.shape)


def face_and_bg(lm, shape):
    oval = _hull_mask(lm, _OVAL, shape)
    face = _dilate(oval, FACE_DILATE_PX) > 0
    bg = _dilate(oval, BG_GUARD_PX) == 0
    return face, bg


def lab_shift(rgb: np.ndarray, where: np.ndarray, dL=0.0, da=0.0, db=0.0) -> np.ndarray:
    lab = color.rgb2lab(rgb / 255.0)
    lab[where, 0] += dL
    lab[where, 1] += da
    lab[where, 2] += db
    out = np.clip(color.lab2rgb(lab), 0, 1)
    return np.round(out * 255).astype(np.uint8)


def srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(x):
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def perturb(rgb, kind, level, face, bg):
    if kind == "baseline" or kind == "jpeg":
        return rgb
    if kind == "faceA":
        return lab_shift(rgb, face, da=level)
    if kind == "faceB":
        return lab_shift(rgb, face, db=level)
    if kind == "faceL":
        return lab_shift(rgb, face, dL=level)
    if kind == "bgA":
        return lab_shift(rgb, bg, da=level)
    if kind == "bgB":
        return lab_shift(rgb, bg, db=level)
    if kind == "exposure":
        lin = srgb_to_lin(rgb / 255.0) * (2.0 ** level)
        return np.round(np.clip(lin_to_srgb(np.clip(lin, 0, 1)), 0, 1) * 255).astype(np.uint8)
    if kind == "blur":
        return cv2.GaussianBlur(rgb, (0, 0), sigmaX=level, sigmaY=level)
    if kind == "scale":
        h, w = rgb.shape[:2]
        return cv2.resize(rgb, (round(w * level), round(h * level)), interpolation=cv2.INTER_AREA)
    raise ValueError(kind)


def client_transform(rgb: np.ndarray, quality: float) -> bytes:
    """Production mobile path approximated in PIL: long side <= 1280, JPEG q.

    Not Chromium's encoder (A2 not run). Orientation: source has no EXIF
    orientation, so 'apply once' is trivially satisfied.
    """
    im = Image.fromarray(rgb)
    if max(im.size) > 1280:
        s = 1280 / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=round(quality * 100))
    return buf.getvalue()


def decode_like_engine(data: bytes) -> np.ndarray:
    return cv2.cvtColor(np.array(Image.open(io.BytesIO(data)).convert("RGB")), cv2.COLOR_RGB2BGR)


def realised(data: bytes, masks) -> dict:
    """Region means of what /scan received, in the engine's own native units."""
    lab = cv2.cvtColor(decode_like_engine(data), cv2.COLOR_BGR2LAB).astype(np.float64)
    out = {}
    for name, m in masks.items():
        b = m > 0
        if lab.shape[:2] != b.shape:  # scale variants: no matched mask
            out[name] = None
            continue
        out[name] = {
            "L": float(lab[..., 0][b].mean() * 100 / 255),
            "a": float((lab[..., 1][b] - 128).mean()),
            "b": float((lab[..., 2][b] - 128).mean()),
        }
    return out


def post(path: str) -> tuple[int, dict]:
    r = subprocess.run(
        ["curl", "-s", "-w", "\n%{http_code}", "-H", f"X-Scan-Secret: {SECRET}",
         "-F", f"image=@{path};type=image/jpeg", f"{ENGINE}/scan?stats=both"],
        capture_output=True, text=True, check=True,
    )
    body, code = r.stdout.rsplit("\n", 1)
    return int(code), json.loads(body)


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def run_matrix():
    rgb = load_rgb()
    lm, masks = landmarks_and_masks(rgb)
    face, bg = face_and_bg(lm, rgb.shape[:2])
    # Injection must cover every engine region; background must touch none.
    union = np.any([m > 0 for m in masks.values()], axis=0)
    assert np.all(face[union]), "face injection does not cover all region masks"
    assert not np.any(bg[union]), "background cast overlaps a region mask"
    rows = []
    for kind, level, exploratory in MATRIX:
        img = perturb(rgb, kind, level, face, bg)
        data = client_transform(img, level if kind == "jpeg" else 0.92)
        path = os.path.join(OUT_IMG, f"{kind}_{level}.jpg")
        with open(path, "wb") as f:
            f.write(data)
        code, resp = post(path)
        rows.append({
            "variant": f"{kind}_{level}", "kind": kind, "level": level,
            "exploratory": exploratory, "transmittedSha256": sha(data),
            "transmittedSize": [Image.open(io.BytesIO(data)).width, Image.open(io.BytesIO(data)).height],
            "realised": realised(data, masks), "httpStatus": code, "response": resp,
        })
        print(kind, level, code, flush=True)
    meta = {
        "sourceSha256": sha(open(SOURCE, "rb").read()),
        "faceMaskPx": int(face.sum()), "bgMaskPx": int(bg.sum()),
        "regionPx": {k: int((v > 0).sum()) for k, v in masks.items()},
        "faceDilatePx": FACE_DILATE_PX, "bgGuardPx": BG_GUARD_PX,
    }
    with open(os.path.join(RESULTS, "matrix.json"), "w") as f:
        json.dump({"meta": meta, "rows": rows}, f, indent=1, sort_keys=True)


DET_INPUTS = ["baseline_0", "faceA_4", "faceL_-4", "exposure_-1", "blur_1"]


def run_determinism(batches=5, per_batch=20, concurrency=4):
    """PROTOCOL §4.3: 100 submissions x 5 inputs, concurrency 4.

    One 'fresh container' per batch (restart via RESTART_CMD between batches).
    Inputs are the source plus four perturbed variants (only one source image exists).
    """
    restart = os.environ["RESTART_CMD"]
    hashes = {k: [] for k in DET_INPUTS}
    responses = {}
    for b in range(batches):
        subprocess.run(restart, shell=True, check=True)
        jobs = [k for _ in range(per_batch) for k in DET_INPUTS]
        with ThreadPoolExecutor(concurrency) as ex:
            res = list(ex.map(lambda k: (k, post(os.path.join(OUT_IMG, k + ".jpg"))), jobs))
        for k, (code, resp) in res:
            assert code == 200, (k, code)
            canon = json.dumps(resp, sort_keys=True)
            hashes[k].append({"batch": b, "sha256": sha(canon.encode())})
            responses.setdefault(sha(canon.encode()), resp)
        print("batch", b, "done", time.strftime("%H:%M:%S"), flush=True)
    with open(os.path.join(RESULTS, "determinism.json"), "w") as f:
        json.dump({"inputs": DET_INPUTS, "batches": batches, "perBatch": per_batch,
                   "concurrency": concurrency, "hashes": hashes,
                   "distinctResponses": responses}, f, indent=1, sort_keys=True)


if __name__ == "__main__":
    {"matrix": run_matrix, "determinism": run_determinism}[sys.argv[1]]()
