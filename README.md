# Spot the Secret

An interactive steganography experiment for the classroom.
Developed by Thilina Mendis, October 2026.

Students don't guess: for each of the 10 cases they get case notes and a
forensic workbench. They choose which photo to examine, run tools on it
(magnifier, compare, pixel numbers, bit planes, message reader, noise meter,
watermark reader, JSteg extractor, calibration test, zero counter), switch
photos with the tool settings kept, and collect readings in an evidence log.
They gather evidence first and give their verdict after. Cases 1-7 each have
a clear clue; cases 8-10 only leave weak traces, which is the lesson about
adaptive steganography.

After each verdict, the Hiding Lab (`lab.html`) walks through how that
method works, step by step.

## Run it locally

    cd spot-the-secret
    python -m http.server 8000

Then open http://localhost:8000.

## Put it online (GitHub Pages)

Push this folder's contents to the repository root, then Settings > Pages >
Deploy from a branch > `main` / `(root)`.

## Files

    index.html, investigate.js/.css  the investigation game
    lab.html, lab.js                 Hiding Lab (lab.html?lab=N opens level N)
    stego.js, style.css              shared helpers and styles
    levels/                          level assets, levels.json, investigate.json
    tools/generate_levels.py         regenerates levels/
    tools/investigate_data.py        regenerates levels/investigate.json
    tools/source/                    the photos used (Lorem Picsum / Unsplash)

## Regenerate after changing photos or levels

    pip install numpy pillow matplotlib scipy jpeglib conseal invisible-watermark
    python tools/generate_levels.py --src tools/source --out levels
    python tools/investigate_data.py --levels levels

Case notes, toolkits and evidence summaries for each case are in the
`CASES` table at the top of investigate.js.

## Notes

- Levels 7 to 10 use simulated embedding (conseal) at the stated payload.
- Images are loaded with colour management off, so browser pixel values match
  the files exactly. Keep PNGs free of colour profiles.
