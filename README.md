# Spot the Secret

An interactive steganography experiment for the classroom.
Developed by Thilina Mendis, October 2026.

Two games share this folder:

- **Spot the Secret** (`index.html`): the simple game. 10 levels, each with
  two photos, A and B; one of them hides a secret (the side is random each
  level). One tool works on both photos at once: the **Contrast Booster**
  (levels 1-3, faint white text) or the **X-ray**, which shows one bit of
  each colour number (levels 4-10, pictures hidden in the small bits). After
  each pick a popup shows correct or not, the points, which photo it was, how
  it was hidden, and an "In plain words" sentence.
  Each level has a 1-minute clock (paused while the popup is open). A find
  within 10 seconds earns 10 points, then 1 point less every 5 seconds (at
  least 1); out of time or a wrong pick earns 0. Every correct answer from
  the 2nd in a row onwards adds a +2 streak bonus, shown on the end screen
  with stars, an agent rank and achievements. The numbers are constants at
  the top of simple.js (`LEVEL_TIME`, `FULL_TIME`, `MAX_POINTS`, `STEP_TIME`,
  `STREAK_BONUS`). Every screen shows "Presented by C-FORCE Laboratory".
- **Investigation mode** (`investigate.html`, not linked from the simple game):
  the advanced version, with case notes, ten forensic tools, an evidence log
  and JPEG methods. After each verdict, the Hiding Lab (`lab.html`) walks
  through how that method works, step by step.

## Run it locally

    cd spot-the-secret
    python -m http.server 8000

Then open http://localhost:8000 (simple game) or http://localhost:8000/investigate.html.

## Leaderboard

Players type an agent name (a nickname; the dice picks a random one) before
"Play now", and their score is saved at the end. The landing page and end
screen show the top 10, with the player's own row highlighted. Each name
appears once, with its best score.

**Admin reset**: click the small "Admin" button at the top right (hidden
during a level), or click the "Top agents" heading 5 times quickly. The first
time, it asks you to create an admin PIN; after that it asks for the PIN. The PIN is never
in the code or on GitHub: only a salted hash is kept in that computer's
browser. After 5 wrong PINs it locks for 30 seconds. Forgot the PIN? Clear
this site's data in the browser settings (this also clears the leaderboard).

- **Without setup** each computer keeps its own leaderboard (browser storage).
- **With Firebase** every device shares one live leaderboard:
  1. Create a project at https://console.firebase.google.com (free plan).
  2. Build > Firestore Database > Create database (production mode).
  3. Firestore > Rules: paste `firestore.rules`, then Publish.
  4. Project settings > Your apps > Web app: copy its `firebaseConfig` into
     `firebase-config.js`. These keys are public; the rules protect the data.
- **Separate boards**: `index.html?board=period3` uses its own leaderboard, so
  each class or event can have a fresh one. To clear a board, delete
  `boards/<name>` in the Firebase console.
- The rules accept scores up to 118 (10 x 10 points + 9 x 2 streak bonus). If
  you change the scoring constants in simple.js, update `MAX_SCORE` in
  leaderboard.js and the limit in `firestore.rules` too.

## Put it online (GitHub Pages)

Push this folder's contents to the repository root, then Settings > Pages >
Deploy from a branch > `main` / `(root)`.

## Files

    index.html, simple.js/.css        the simple game
    fx.js                             its animations (confetti, flying points, ...)
    leaderboard.js                    names and the leaderboard (Firebase or this computer)
    admin.js                          hidden admin panel (PIN-protected leaderboard reset)
    firebase-config.js                your Firebase project settings (null = this computer only)
    firestore.rules                   security rules to paste into Firebase
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
