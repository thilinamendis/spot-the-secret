# Spot the Secret

An interactive steganography experiment for the classroom.
Developed by Thilina Mendis, October 15, 2026.

Each level shows the same photo twice, and one copy hides a secret. Players
pick the photo (click or press A / B) and score points, with harder levels
worth more. Then they analyse the photo with tools: amplified changes, pixel
numbers, bit planes, message decoding, JPEG 8x8 blocks, and embedding cost
maps. The Hiding Lab walks through each level's method step by step and is
linked from every level.

## Run it locally

Browsers block pixel access for pages opened as files, so use a local server:

    cd spot-the-secret
    python -m http.server 8000

Then open http://localhost:8000

## Put it online (GitHub Pages)

1. Create a GitHub repository and push this folder's contents to it.
2. In the repository, open Settings > Pages, choose "Deploy from a branch",
   pick `main` and `/ (root)`, and save.
3. After a minute the game is live at `https://<user>.github.io/<repo>/`.

## Files

    index.html, style.css     screens and styling
    game.js                   game flow, score, analysis tools, Lab screen
    lab.js                    Hiding Lab chapters (text and visuals per level)
    stego.js                  pixel helpers (decoding, bit planes, change maps)
    levels/                   generated level assets and levels.json
    tools/generate_levels.py  regenerates levels/
    tools/source/             the photos used (Lorem Picsum / Unsplash, free to use)

## Change the photos or levels

    pip install numpy pillow matplotlib jpeglib conseal invisible-watermark
    python tools/generate_levels.py --src tools/source --out levels

Edit `IMAGES`, the payloads, `LEVELS` (titles and explanations) or `SIMPLE`
(the plain-words lines) in the script. Lab text lives in lab.js. Level 4's
key-based positions use a small PRNG mirrored in stego.js, so keep
`mulberry32()` identical in both files.

## Notes

- "Hide your own message" is switched off. Its HTML is commented out in
  index.html and its code is commented out near the end of game.js.
- Levels 7 to 10 use simulated embedding (conseal) at the stated payload:
  the coefficient changes are realistic, but there is no extractable message.
- Images are loaded with colour management turned off, so browser pixel
  values match the files exactly. Keep PNGs free of colour profiles.
