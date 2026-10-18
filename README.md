# Spot the Secret

An interactive steganography experiment for the classroom.
Developed by Thilina Mendis, October 2026.

Two games share this folder:

- **Spot the Secret** (`index.html`): the simple game. 10 levels, each with
  two photos, A and B; one of them hides a secret (the side is random each
  level). One tool works on both photos at once: the **Contrast Booster**
  (levels 1-3, faint white text) or the **X-ray**, which shows one bit of
  each colour number (levels 4-10, pictures hidden in the small bits). After
  each pick: correct or not, which photo it was, how it was hidden, and an
  "In plain words" sentence. 10 points per level.
- **Investigation mode** (`investigate.html`, not linked from the simple game):
  the advanced version, with case notes, ten forensic tools, an evidence log
  and JPEG methods. After each verdict, the Hiding Lab (`lab.html`) walks
  through how that method works, step by step.

## Run it locally

    cd spot-the-secret
    python -m http.server 8000

Then open http://localhost:8000 (simple game) or http://localhost:8000/investigate.html.

## Put it online (GitHub Pages)

Push this folder's contents to the repository root, then Settings > Pages >
Deploy from a branch > `main` / `(root)`.

## Files

    index.html, simple.js/.css        the simple game
    investigate.html/.js/.css         Investigation mode
    lab.html, lab.js                  Hiding Lab (lab.html?lab=N opens level N)
    stego.js, style.css               shared helpers and styles
    levels_simple/                    simple game levels (levels.json, level_XX/)
    levels/                           Investigation mode levels, levels.json, investigate.json
    tools/generate_simple.py          regenerates levels_simple/
    tools/generate_levels.py          regenerates levels/
    tools/investigate_data.py         regenerates levels/investigate.json
    tools/source/                     the photos used (Lorem Picsum / Unsplash)

## Regenerate after changing photos or levels

    # simple game
    pip install numpy pillow
    python tools/generate_simple.py --src tools/source --out levels_simple

    # Investigation mode
    pip install numpy pillow matplotlib scipy jpeglib conseal invisible-watermark
    python tools/generate_levels.py --src tools/source --out levels
    python tools/investigate_data.py --levels levels

Level titles and the reveal sentences for the simple game are in the `LEVELS`
table in tools/generate_simple.py. Case notes, toolkits and evidence summaries
for Investigation mode are in the `CASES` table at the top of investigate.js.

## Notes

- Investigation mode levels 7 to 10 use simulated embedding (conseal) at the stated payload.
- Images are loaded with colour management off, so browser pixel values match
  the files exactly. Keep PNGs free of colour profiles.
