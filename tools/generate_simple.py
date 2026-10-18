#!/usr/bin/env python3
# Spot the Secret: steganography awareness game
# Developed by Thilina Mendis
# Date: October 17, 2026
"""
Generates the 10 levels of the simple game (index.html).

For every level it writes, into out/level_XX/:
  cover.png   the original photo
  stego.png   the same photo with the secret hidden in it
and a top-level levels.json with the title, tool and the two reveal
sentences for each level.

"Writing a picture into bit k" means: for every pixel, set bit k of each
chosen colour value to 1 where the secret picture is white and 0 where it is
black, leaving the other 7 bits untouched.

Requirements:  pip install numpy pillow
Usage:  python generate_simple.py --src source --out ../levels_simple
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 768, 512
RED, GREEN, BLUE = 0, 1, 2


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


def text_picture(text, size=150):
    """Black-and-white picture (True = white) of the text, centred."""
    canvas = Image.new("L", (W, H), 0)
    ImageDraw.Draw(canvas).multiline_text((W // 2, H // 2), text, font=font(size), fill=255,
                                          anchor="mm", align="center", spacing=12)
    return np.asarray(canvas) > 127


def stamp_picture(size=96):
    """A postage-stamp-sized smiley in a frame (True = white), drawn at 4x and shrunk."""
    s = size * 4
    im = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(im)
    d.rectangle([6, 6, s - 7, s - 7], outline=255, width=14)
    d.ellipse([60, 60, s - 61, s - 61], outline=255, width=18)
    d.ellipse([130, 135, 160, 175], fill=255); d.ellipse([s - 160, 135, s - 130, 175], fill=255)
    d.arc([115, 130, s - 116, s - 105], 20, 160, fill=255, width=18)
    return np.asarray(im.resize((size, size), Image.LANCZOS)) > 127


def write_bit(x, picture, bit, channels=(RED, GREEN, BLUE)):
    y = x.copy()
    for c in channels:
        v = y[..., c]
        y[..., c] = (v & ~np.uint8(1 << bit)) | (picture.astype(np.uint8) << bit)
    return y


def busiest_corner(x, size, margin=24):
    """Top-left corner of the most textured size x size square among the four corners."""
    g = x.astype(float).mean(axis=2)
    spots = [(margin, margin), (W - margin - size, margin),
             (margin, H - margin - size), (W - margin - size, H - margin - size)]
    def busy(p):
        a = g[p[1]:p[1] + size, p[0]:p[0] + size]
        return np.abs(np.diff(a, axis=0)).mean() + np.abs(np.diff(a, axis=1)).mean()
    return max(spots, key=busy)


# ---------------------------------------------------------------- hiding methods
def overlay(x, opacity, text="SECRET", size=150, cy=0.30):
    """White text blended over the photo at the given opacity."""
    im = Image.fromarray(x).convert("RGBA")
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((W // 2, int(H * cy)), text, font=font(size),
                               fill=(255, 255, 255, round(255 * opacity)), anchor="mm")
    return np.asarray(Image.alpha_composite(im, layer).convert("RGB"))


def second_photo(x, hidden):
    """The top 2 bits of the hidden photo become the bottom 2 bits of the cover."""
    return (x & 0xFC) | (hidden >> 6)


def small_stamp(x, channel, size=96):
    """A small picture written into the last bit of one colour, in the busiest corner."""
    pic = stamp_picture(size)
    px, py = busiest_corner(x, size)
    y = x.copy()
    region = y[py:py + size, px:px + size, channel]
    y[py:py + size, px:px + size, channel] = (region & 0xFE) | pic.astype(np.uint8)
    return y, (px, py)


# ---------------------------------------------------------------- levels
# level: (cover photo, title, tool, colour switch, how it was hidden, in plain words)
LEVELS = {
    1: ("pic_103.jpg", "Warm-up", "booster", False,
        "The word SECRET was painted over the photo in white, at 15% strength.",
        "It's like writing on a window with a nearly dry marker: faint, but there if you look closely."),
    2: ("pic_10.jpg", "Fading ink", "booster", False,
        "The same white word SECRET, but fainter: only 10% strength.",
        "The marker is running out, so the writing is even harder to see."),
    3: ("pic_54.jpg", "Almost invisible", "booster", False,
        "The word SECRET at just 2% strength, too faint for most eyes.",
        "The ink is so faint that you need the booster to make it stand out."),
    4: ("pic_128.jpg", "Bit 3", "xray", False,
        "A black-and-white picture of the word HELLO was written into bit 3 of every colour number.",
        "Every colour number was nudged by up to 8 out of 255. That's small, but the X-ray shows the word clearly."),
    5: ("pic_110.jpg", "Bit 2", "xray", False,
        "A picture of the word SPY was written into bit 2 of every colour number.",
        "Smaller nudges this time, up to 4 out of 255, so your eyes can't see them."),
    6: ("pic_164.jpg", "Bit 1", "xray", False,
        "A picture of the word AGENT was written into bit 1 of every colour number.",
        "Each colour changed by 2 at most. Only a look at that one bit gives it away."),
    7: ("pic_152.jpg", "The last bit", "xray", False,
        "A picture of the word FOUND ME was written into the last bit (bit 0) of every colour number.",
        "Like changing every price in a shop by one cent: nobody notices, but look only at the cents and a word appears."),
    8: ("pic_29.jpg", "Only in blue", "xray", True,
        "A picture of the words CODE 42 was written into the last bit of the blue numbers only.",
        "The secret is only in the blue paint, so you have to check the right colour."),
    9: ("pic_211.jpg", "Photo inside a photo", "xray", False,
        "A whole second photo, of a hiker, was hidden in the last two bits of every colour number.",
        "The rough outline of another photo is tucked into the tiniest part of each pixel, like a ghost underneath."),
    10: ("pic_15.jpg", "Postage stamp", "xray", True,
         "A tiny smiley picture was written into the last bit of the green numbers, in one busy corner.",
         "Like a stamp dropped in a messy room: the right tool shows it, but you still have to look everywhere."),
}
HIDDEN_PHOTO = "pic_177.jpg"   # level 9's second photo


def make_stego(lv, x, src):
    if lv == 1: return overlay(x, 0.15)
    if lv == 2: return overlay(x, 0.10)
    if lv == 3: return overlay(x, 0.02)
    if lv == 4: return write_bit(x, text_picture("HELLO"), 3)
    if lv == 5: return write_bit(x, text_picture("SPY", 200), 2)
    if lv == 6: return write_bit(x, text_picture("AGENT"), 1)
    if lv == 7: return write_bit(x, text_picture("FOUND\nME", 140), 0)
    if lv == 8: return write_bit(x, text_picture("CODE\n42", 160), 0, channels=(BLUE,))
    if lv == 9: return second_photo(x, load_rgb(os.path.join(src, HIDDEN_PHOTO)))
    y, _ = small_stamp(x, GREEN)
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="source")
    ap.add_argument("--out", default="out")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    meta = []
    for lv, (photo, title, tool, colours, how, plain) in LEVELS.items():
        od = os.path.join(a.out, f"level_{lv:02d}")
        os.makedirs(od, exist_ok=True)
        x = load_rgb(os.path.join(a.src, photo))
        y = make_stego(lv, x, a.src)
        # PNG without colour profile, so browser pixel values match exactly
        Image.fromarray(x).save(os.path.join(od, "cover.png"))
        Image.fromarray(np.ascontiguousarray(y)).save(os.path.join(od, "stego.png"))
        meta.append(dict(level=lv, title=title, tool=tool, colours=colours,
                         how=how, plain=plain, source=photo,
                         pct_pixels_changed=round(100 * (x != y).any(axis=2).mean(), 2),
                         max_change=int(np.abs(y.astype(int) - x.astype(int)).max())))
        print(f"level {lv:2d}  {title:22s} max change {meta[-1]['max_change']}")
    json.dump(meta, open(os.path.join(a.out, "levels.json"), "w"), indent=2)


if __name__ == "__main__":
    main()
