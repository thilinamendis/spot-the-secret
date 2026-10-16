#!/usr/bin/env python3
# Spot the Secret: steganography awareness game
# Developed by Thilina Mendis
# Date: October 16, 2026
"""
Precomputes the forensic readings used by Investigation mode that a browser
cannot compute itself (it never sees JPEG coefficients), for BOTH images of
each level, so the page can show them without knowing which is which.

Writes <levels>/investigate.json:
  { "<level>": { "cover": {...}, "stego": {...} }, ... }
Readings: watermark reader (level 5), JSteg extractor and calibration
estimate (levels 6-7), non-zero AC coefficient count (levels 7-10).

Usage: python investigate_data.py --levels levels
"""
import argparse, json, os, sys, tempfile, types
import numpy as np
import jpeglib
for _m in ("torch", "onnxruntime"):
    sys.modules.setdefault(_m, types.ModuleType(_m))
from imwatermark import WatermarkDecoder
from PIL import Image


def printable(b):
    return "".join(chr(c) if 32 <= c < 127 else "·" for c in b)


def watermark_read(path, nbytes=6):
    bgr = np.ascontiguousarray(np.asarray(Image.open(path).convert("RGB"))[..., ::-1])
    raw = WatermarkDecoder("bytes", 8 * nbytes).decode(bgr, "dwtDct")
    return printable(raw)


def jsteg_read(path, max_chars=160):
    flat = jpeglib.read_dct(path).Y.reshape(-1)
    ij = np.tile(np.arange(64), flat.size // 64)
    bits = flat[(ij != 0) & (flat != 0) & (flat != 1)] & 1
    n = int.from_bytes(np.packbits(bits[:32]).tobytes(), "big")
    valid = 0 < n and 32 + 8 * n <= bits.size
    k = min(n if valid else 40, max_chars)
    text = printable(np.packbits(bits[32:32 + 8 * k]).tobytes())
    if valid and n > k:
        text += "…"
    return dict(valid=bool(valid and text.count("·") < 0.1 * len(text)), length=n if valid else None, text=text)


def calibration_beta(path):
    """Fridrich-style calibration estimate of the fraction of changed
    coefficients (the classic attack on F5-type shrinkage)."""
    j = jpeglib.read_dct(path)
    Y, qt = j.Y, j.qt[0]
    x = jpeglib.read_spatial(path, jpeglib.JCS_GRAYSCALE).spatial[..., 0]
    tmp = tempfile.mktemp(suffix=".jpg")
    jpeglib.from_spatial(np.ascontiguousarray(x[4:-4, 4:-4][..., None])).write_spatial(tmp, qt=qt[None])
    Yc = jpeglib.read_dct(tmp).Y
    os.remove(tmp)
    betas = []
    for k, l in [(0, 1), (1, 0), (1, 1)]:
        a, b = np.abs(Y[:, :, k, l]).ravel(), np.abs(Yc[:, :, k, l]).ravel()
        h = [(a == i).sum() for i in range(3)]
        he = [(b == i).sum() * a.size / b.size for i in range(3)]
        num = he[1] * (h[0] - he[0]) + (h[1] - he[1]) * (he[2] - he[1])
        den = he[1] ** 2 + (he[2] - he[1]) ** 2
        betas.append(num / den)
    return round(float(max(0.0, np.mean(betas))), 4)


def nonzero_ac(path):
    Y = jpeglib.read_dct(path).Y
    return int(np.count_nonzero(Y) - np.count_nonzero(Y[..., 0, 0]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--levels", default="levels")
    a = ap.parse_args()
    out = {}
    for lv in range(1, 11):
        d = os.path.join(a.levels, f"level_{lv:02d}")
        entry = {}
        for side in ("cover", "stego"):
            r = {}
            if lv == 5:
                r["watermark"] = watermark_read(os.path.join(d, f"{side}.png"))
            if lv >= 6:
                p = os.path.join(d, f"{side}.jpg")
                if lv in (6, 7):
                    r["jsteg"] = jsteg_read(p)
                    r["calibration"] = calibration_beta(p)
                if lv >= 7:
                    r["nonzero_ac"] = nonzero_ac(p)
            entry[side] = r
        out[str(lv)] = entry
        print(lv, json.dumps(entry)[:160])
    json.dump(out, open(os.path.join(a.levels, "investigate.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
