#!/usr/bin/env python3
# Spot the Secret: steganography awareness game
# Developed by Thilina Mendis
# Date: October 15, 2026
"""
Spot-the-Secret: generates 10 levels of cover/stego image pairs for a
steganography awareness game, plus "under the hood" reveal assets.

For every level it writes, into out/level_XX/:
  cover.*  stego.*            the two images shown side by side (same look)
  diff.png                    amplified |stego - cover| heat map  (Image C)
  lsb_cover.png lsb_stego.png bit-0 planes            (spatial levels 1-5)
  block_changes.png           per-8x8-block change count heat map (JPEG levels 6-10)
  cost_map.png                embedding cost map, red = cheap   (levels 8-10)
  dct_changes.json            every changed DCT coefficient      (JPEG levels)
and a top-level levels.json with titles, explanations and statistics.

Requirements:  pip install numpy pillow matplotlib jpeglib conseal invisible-watermark
(invisible-watermark only needs opencv + PyWavelets for the DWT-DCT method; this
script stubs out its optional torch import so torch need not be installed.)

Usage:  python generate_levels.py --src source --out out
"""
import argparse, json, os, sys, types
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import matplotlib
matplotlib.use("Agg")
from matplotlib import colormaps
import jpeglib
import conseal

# imwatermark imports torch for its RivaGAN mode, which we don't use.
for _m in ("torch", "onnxruntime"):
    sys.modules.setdefault(_m, types.ModuleType(_m))
from imwatermark import WatermarkEncoder, WatermarkDecoder

W, H = 768, 512
QF = 75          # JPEG quality for levels 6-10 (same for cover and stego)
SEED = 2026      # the "secret key" for keyed embedding

# level -> source image file (change freely)
IMAGES = {
    1: "pic_103.jpg", 2: "pic_152.jpg", 3: "pic_164.jpg", 4: "pic_37.jpg",
    5: "pic_211.jpg", 6: "pic_10.jpg", 7: "pic_188.jpg", 8: "pic_128.jpg",
    9: "pic_54.jpg", 10: "pic_76.jpg",
}

SECRET = ("Meet me at the library at 3pm. Bring the blue notebook. "
          "The password is OWL-42. ")


# ---------------------------------------------------------------- helpers
def load_rgb(path):
    im = Image.open(path).convert("RGB")
    # center-crop to 3:2 then resize
    w, h = im.size
    tw = min(w, int(h * W / H)); th = int(tw * H / W)
    l, t = (w - tw) // 2, (h - th) // 2
    return np.asarray(im.crop((l, t, l + tw, t + th)).resize((W, H), Image.LANCZOS))


def font(size):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "C:/Windows/Fonts/arialbd.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def text_to_bits(msg):
    data = msg.encode("utf-8")
    header = len(data).to_bytes(4, "big")          # 32-bit length header
    return np.unpackbits(np.frombuffer(header + data, dtype=np.uint8))


def bits_to_text(bits):
    n = int.from_bytes(np.packbits(bits[:32]).tobytes(), "big")
    return np.packbits(bits[32:32 + 8 * n]).tobytes().decode("utf-8", "replace")


def heat(arr, cmap="inferno", vmax=None):
    a = arr.astype(np.float64)
    vmax = vmax or (a.max() if a.max() > 0 else 1)
    rgb = colormaps[cmap](np.clip(a / vmax, 0, 1))[..., :3]
    return Image.fromarray((rgb * 255).astype(np.uint8))


def save_diff(cover_rgb, stego_rgb, path):
    d = np.abs(stego_rgb.astype(int) - cover_rgb.astype(int)).sum(axis=2)
    # any change at all lights up; bigger changes glow brighter
    v = np.where(d > 0, 0.45 + 0.55 * np.minimum(d, 3) / 3, 0)
    heat(v, vmax=1).save(path)
    return d


def lsb_plane(rgb):
    return Image.fromarray(((rgb[..., 0] & 1) * 255).astype(np.uint8))


def save_png(arr, path):
    Image.fromarray(arr).save(path)


# --------------------------------------------------- spatial levels (1-5)
def level1_overlay(x):
    """Faint visible text overlay at ~5% opacity."""
    im = Image.fromarray(x).convert("RGBA")
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((W // 2, H // 2), "TOP SECRET", font=font(110), fill=(255, 255, 255, 14),
           anchor="mm")
    return np.asarray(Image.alpha_composite(im, layer).convert("RGB")), "TOP SECRET (visible overlay)"


def level2_lsb_picture(x):
    """Replace bit 0 of every pixel with a black/white picture of a message."""
    msg = "HELLO\nSPY!"
    canvas = Image.new("L", (W, H), 0)
    ImageDraw.Draw(canvas).multiline_text((W // 2, H // 2), msg, font=font(150), fill=255,
                                          anchor="mm", align="center", spacing=10)
    bits = (np.asarray(canvas) > 127).astype(np.uint8)
    y = (x & 0xFE) | bits[..., None]
    return y, msg.replace("\n", " ")


def level3_lsb_sequential(x, bpc=0.12):
    """Sequential LSB replacement of a text message, row by row from the top."""
    cap = int(x.size * bpc) // 8 - 4
    msg = (SECRET * (cap // len(SECRET) + 1))[:cap]
    bits = text_to_bits(msg)
    flat = x.reshape(-1).copy()
    flat[:bits.size] = (flat[:bits.size] & 0xFE) | bits
    y = flat.reshape(x.shape)
    assert bits_to_text(y.reshape(-1) & 1) == msg
    return y, msg


def mulberry32(seed):
    """Tiny PRNG that is reproduced bit-for-bit in stego.js, so the browser can
    re-derive the secret positions from the key."""
    state = [seed & 0xFFFFFFFF]
    M = 0xFFFFFFFF
    def imul(a, b):
        return (a * b) & M
    def rnd():
        state[0] = (state[0] + 0x6D2B79F5) & M
        a = state[0]
        t = imul(a ^ (a >> 15), a | 1)
        t = ((t + imul(t ^ (t >> 7), t | 61)) & M) ^ t
        return ((t ^ (t >> 14)) & M) / 4294967296
    return rnd


def keyed_positions(n_total, k, key):
    """First k entries of a key-driven Fisher-Yates shuffle of range(n_total)."""
    rnd = mulberry32(key)
    arr = np.arange(n_total, dtype=np.int64)
    for i in range(k):
        j = i + int(rnd() * (n_total - i))
        arr[i], arr[j] = arr[j], arr[i]
    return arr[:k].copy()


def level4_lsb_matching(x, bpc=0.06):
    """LSB matching (+-1) at key-selected random positions."""
    cap = int(x.size * bpc) // 8 - 4
    msg = (SECRET * (cap // len(SECRET) + 1))[:cap]
    bits = text_to_bits(msg)
    pos = keyed_positions(x.size, bits.size, SEED)
    rng = np.random.default_rng(SEED)
    flat = x.reshape(-1).astype(np.int16)
    need = (flat[pos] & 1) != bits
    step = rng.choice([-1, 1], size=pos.size)
    step[flat[pos] == 0] = 1
    step[flat[pos] == 255] = -1
    flat[pos[need]] += step[need]
    y = flat.astype(np.uint8).reshape(x.shape)
    assert bits_to_text(y.reshape(-1)[pos] & 1) == msg
    return y, msg


def level5_watermark(x):
    """Invisible DWT-DCT watermark (the method Stable Diffusion's reference code used)."""
    mark = "AUBURN"
    enc = WatermarkEncoder()
    enc.set_watermark("bytes", mark.encode())
    bgr = np.ascontiguousarray(x[..., ::-1])
    y = enc.encode(bgr, "dwtDct")[..., ::-1]
    dec = WatermarkDecoder("bytes", 8 * len(mark))
    got = dec.decode(np.ascontiguousarray(y[..., ::-1]), "dwtDct").decode("utf-8", "replace")
    return np.ascontiguousarray(y), mark, got == mark


# ---------------------------------------------------- JPEG levels (6-10)
def make_cover_jpeg(x, path):
    jpeglib.from_spatial(np.ascontiguousarray(x)).write_spatial(path, qt=QF)
    return jpeglib.read_dct(path)


def jsteg(y0, msg):
    """JSteg: sequential LSB replacement in AC coefficients not in {0, 1}."""
    bits = text_to_bits(msg)
    y = y0.copy()
    flat = y.reshape(-1)                      # order: block row, block col, i, j
    ij = np.tile(np.arange(64), flat.size // 64)
    usable = np.flatnonzero((ij != 0) & (flat != 0) & (flat != 1))
    assert bits.size <= usable.size, "message too long"
    idx = usable[:bits.size]
    flat[idx] = (flat[idx] & ~1) | bits       # two's-complement LSB, never yields 0/1
    # verify
    flat2 = y.reshape(-1)
    usable2 = np.flatnonzero((ij != 0) & (flat2 != 0) & (flat2 != 1))
    assert bits_to_text(flat2[usable2] & 1) == msg
    return y


def jpeg_level(level, x, outdir):
    cpath = os.path.join(outdir, "cover.jpg")
    spath = os.path.join(outdir, "stego.jpg")
    jpg = make_cover_jpeg(x, cpath)
    y0 = jpg.Y.copy()
    qt = jpg.qt[0]
    x0 = jpeglib.read_spatial(cpath, jpeglib.JCS_GRAYSCALE).spatial[..., 0]
    info, cost = {}, None
    nzac = int(np.count_nonzero(y0) - np.count_nonzero(y0[..., 0, 0]))

    if level == 6:
        nbytes = int(0.10 * nzac) // 8 - 4
        msg = (SECRET * (nbytes // len(SECRET) + 1))[:nbytes]
        y1 = jsteg(y0, msg)
        info = dict(payload="0.10 bpnzAC", message=msg[:120] + "...", decodable=True)
    elif level == 7:
        y1 = conseal.nsF5.simulate_single_channel(y0, 0.20, seed=SEED)
        info = dict(payload="0.20 bpnzAC", simulated=True)
    elif level == 8:
        rp, rm = conseal.uerd.compute_cost_adjusted(y0, qt)
        cost = rp
        y1 = conseal.uerd.simulate_single_channel(y0, qt, 0.30, seed=SEED)
        info = dict(payload="0.30 bpnzAC", simulated=True)
    else:
        alpha = 0.30 if level == 9 else 0.05
        rp, rm = conseal.juniward.compute_cost_adjusted(x0, y0, qt)
        cost = rp
        y1 = conseal.juniward.simulate_single_channel(x0, y0, qt, alpha, seed=SEED)
        info = dict(payload=f"{alpha:.2f} bpnzAC", simulated=True)

    jpg.Y = y1
    jpg.write_dct(spath)

    c_rgb = jpeglib.read_spatial(cpath).spatial
    s_rgb = jpeglib.read_spatial(spath).spatial
    save_diff(c_rgb, s_rgb, os.path.join(outdir, "diff.png"))

    changed = y1 != y0
    per_block = changed.sum(axis=(2, 3))
    heat(np.kron(per_block, np.ones((8, 8))), vmax=max(1, per_block.max())).save(
        os.path.join(outdir, "block_changes.png"))

    if cost is not None:
        c = np.log10(np.clip(cost, 1e-3, 1e4)).mean(axis=(2, 3))   # mean per block
        lo, hi = np.percentile(c, [2, 98])
        c = np.clip((c - lo) / ((hi - lo) or 1), 0, 1)
        heat(np.kron(1 - c, np.ones((8, 8))), cmap="coolwarm", vmax=1).save(
            os.path.join(outdir, "cost_map.png"))

    br, bc, i, j = np.nonzero(changed)
    rec = [dict(block=[int(a), int(b)], coef=[int(c_), int(d)],
                old=int(y0[a, b, c_, d]), new=int(y1[a, b, c_, d]))
           for a, b, c_, d in zip(br, bc, i, j)]
    json.dump(rec, open(os.path.join(outdir, "dct_changes.json"), "w"))

    info.update(changed_coefficients=int(changed.sum()),
                pct_coefficients_changed=round(100 * changed.sum() / changed.size, 3),
                blocks_touched_pct=round(100 * (per_block > 0).mean(), 1))
    return info


# ------------------------------------------------------------------ levels
LEVELS = {
    1: ("Ghost writing", "Text overlay at about 5% opacity",
        "A faint 'TOP SECRET' overlay changes thousands of pixels by a few shades, "
        "enough to find if you look closely."),
    2: ("The hidden picture", "LSB replacement of a picture",
        "Every pixel's last bit was replaced with a black-and-white picture. Your eyes "
        "can't see a change of 1 out of 256, but the bit-0 plane shows it at once."),
    3: ("Message in the attic", "Sequential LSB replacement, ~12% of bits",
        "A text message was written into the last bits row by row from the top, so the "
        "top strip of the bit-0 plane looks different from the rest."),
    4: ("Scattered secrets", "LSB matching (+/-1) at key-chosen positions",
        "The same message, scattered randomly with a secret key and written by adding or "
        "subtracting 1. Without the key, the bit-0 plane looks like normal noise."),
    5: ("Invisible signature", "DWT-DCT invisible watermark",
        "A watermark was mixed into the image's frequency bands, the way some AI image "
        "tools tag their outputs. It survives saving and is invisible to the eye."),
    6: ("JPEG smuggler", "JSteg in DCT coefficients, 0.10 bpnzAC",
        "JPEGs store 8x8 blocks of frequencies, not pixels. JSteg hides bits in those "
        "numbers, which leaves a tell-tale pattern in their histogram."),
    7: ("Shrinking numbers", "nsF5, 0.20 bpnzAC (simulated)",
        "nsF5 only ever shrinks coefficients toward zero and uses clever coding to make "
        "fewer changes, so JSteg's histogram tell disappears."),
    8: ("Hide in the grass", "UERD, 0.30 bpnzAC (simulated)",
        "Content-adaptive: each change has a cost, and changes go where the image is "
        "already busy. The cost map shows where hiding is cheap."),
    9: ("Master of disguise", "J-UNIWARD, 0.30 bpnzAC (simulated)",
        "J-UNIWARD measures cost with wavelet filters, so changes land almost only in "
        "textured regions where detectors struggle."),
    10: ("Needle in a haystack", "J-UNIWARD, 0.05 bpnzAC (simulated)",
         "Very few changes, all in the busiest textures. This is near the limit of what "
         "modern steganalysis tools can detect, let alone human eyes."),
}


SIMPLE = {
    1: "It's like writing on a window with a nearly dry marker: it's there, but you have to tilt your head to see it.",
    2: 'Imagine changing every price in a shop by one cent. Nobody notices, but if you only look at the cents, a picture appears.',
    3: 'Like writing a note in tiny letters along the top edge of a page: hard to see, but easy to find once you know to look at the top.',
    4: 'Now the letters are sprinkled all over the page, and only someone with the secret key knows which spots to read.',
    5: "Like a faint pattern woven into fabric: you can't see it, but the right scanner can still read it after the photo is saved again.",
    6: "A JPEG is a recipe for each small square of the photo. JSteg changes the recipe's numbers slightly instead of the pixels.",
    7: 'The same recipe trick, but it only ever makes numbers a little smaller and changes as few as it can, so there are fewer clues.',
    8: 'Like whispering in a noisy room: the changes go where the photo is already busy, so nobody notices them.',
    9: 'An even smarter whisperer: it checks every edge in every direction and only hides where nothing would look out of place.',
    10: 'The same expert hider with a tiny message. Fewer changes means almost nothing to find, even for computers.',
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="source")
    ap.add_argument("--out", default="out")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    meta = []
    for lv in range(1, 11):
        od = os.path.join(a.out, f"level_{lv:02d}")
        os.makedirs(od, exist_ok=True)
        x = load_rgb(os.path.join(a.src, IMAGES[lv]))
        title, method, why = LEVELS[lv]
        entry = dict(level=lv, title=title, method=method, explanation=why,
                     simple=SIMPLE[lv], source=IMAGES[lv])
        if lv <= 5:
            if lv == 1: y, msg = level1_overlay(x); ok = True
            elif lv == 2: y, msg = level2_lsb_picture(x); ok = True
            elif lv == 3: y, msg = level3_lsb_sequential(x); ok = True
            elif lv == 4: y, msg = level4_lsb_matching(x); ok = True
            else: y, msg, ok = level5_watermark(x)
            save_png(x, os.path.join(od, "cover.png"))
            save_png(y, os.path.join(od, "stego.png"))
            d = save_diff(x, y, os.path.join(od, "diff.png"))
            lsb_plane(x).save(os.path.join(od, "lsb_cover.png"))
            lsb_plane(y).save(os.path.join(od, "lsb_stego.png"))
            if lv == 3: entry["decode"] = dict(mode="sequential")
            if lv == 4: entry["decode"] = dict(mode="keyed", key=SEED, bits=int(8 * (4 + len(msg.encode()))))
            entry.update(format="png", hidden=msg[:120] + ("..." if len(msg) > 120 else ""),
                         decode_verified=bool(ok),
                         pct_pixels_changed=round(100 * (d > 0).mean(), 2),
                         max_channel_change=int(np.abs(y.astype(int) - x.astype(int)).max()))
        else:
            entry.update(format="jpg", quality=QF, **jpeg_level(lv, x, od))
        meta.append(entry)
        print(f"level {lv:2d}  {title:22s} done")
    json.dump(meta, open(os.path.join(a.out, "levels.json"), "w"), indent=2)


if __name__ == "__main__":
    main()
