/*
 * Spot the Secret: steganography game for the classroom
 * Developed by Thilina Mendis
 * Date: October 21, 2026
 *
 * leaderboard.js: saves scores and reads the top of the board.
 *
 * With a Firebase project in firebase-config.js, every device shares one
 * live board (Cloud Firestore, path boards/{board}/scores). Without one, or
 * if Firebase can't be reached, each browser keeps its own board in
 * localStorage, so the game always works.
 *
 * Boards: index.html?board=period3 uses a separate board called "period3",
 * so a teacher can start a fresh leaderboard just by sharing a new link.
 * Each agent name appears once, with its best score.
 */
(function (root) {
  "use strict";
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const MAX_NAME = 16;
  const MAX_SCORE = 118;   // 10 levels x 10 points + 9 x 2 streak bonus; keep in step with firestore.rules
  const LIMIT = 200;       // scores read for ranking

  const board = (new URLSearchParams(location.search).get("board") || "main")
    .toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "main";

  // ---------------------------------------------------------------- names
  // Letters, digits, spaces, - and _ only, and nothing rude.
  const BLOCKED = ["fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "nigg", "fag", "slut", "whore",
    "bastard", "asshole", "penis", "vagina", "porn", "rape", "nazi", "hitler", "kill"];
  function cleanName(s) {
    return String(s || "").replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  }
  function nameProblem(raw) {
    const s = cleanName(raw);
    if (!s) return "Type an agent name first (letters and numbers).";
    if (s.length < 2) return "Make your agent name at least 2 characters.";
    const flat = s.toLowerCase().replace(/[\s_-]/g, "")
      .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t");
    if (BLOCKED.some(w => flat.includes(w))) return "Please pick a different name.";
    return "";
  }
  const ADJ = ["Shadow", "Silent", "Swift", "Clever", "Cosmic", "Pixel", "Turbo", "Hidden", "Neon", "Lucky", "Sneaky", "Mighty", "Secret", "Cyber", "Rapid"];
  const NOUN = ["Fox", "Owl", "Falcon", "Panda", "Tiger", "Otter", "Hawk", "Wolf", "Lynx", "Gecko", "Raven", "Comet", "Byte", "Badger", "Koala"];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const randomName = () => `${pick(ADJ)} ${pick(NOUN)} ${Math.floor(Math.random() * 90) + 10}`;

  // ---------------------------------------------------------------- backend
  let mode = "local", db = null, ready = null;
  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => no(new Error(`Could not load ${src}`));
      document.head.appendChild(s);
    });
  }
  function init() {
    if (ready) return ready;
    ready = (async () => {
      const cfg = root.FIREBASE_CONFIG;
      if (!cfg || !cfg.projectId) return (mode = "local");
      try {
        if (!root.firebase) { await loadScript(`${SDK}firebase-app-compat.js`); await loadScript(`${SDK}firebase-firestore-compat.js`); }
        if (!root.firebase.apps.length) root.firebase.initializeApp(cfg);
        db = root.firebase.firestore();
        mode = "online";
      } catch (e) {
        console.warn("Leaderboard: Firebase unavailable, using this computer only.", e);
        mode = "local";
      }
      return mode;
    })();
    return ready;
  }
  const scores = () => db.collection("boards").doc(board).collection("scores");

  // higher score first; ties go to the faster average, then whoever got there first
  const order = rows => rows.sort((a, b) => b.score - a.score || a.avgMs - b.avgMs || a.at - b.at);
  // one row per agent name (not case sensitive): its best game
  const bestPerName = rows => {
    const seen = new Set();
    return order(rows).filter(r => { const k = r.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  };
  let shown = [];   // the last rows handed to subscribers
  const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const clean = e => ({
    name: cleanName(e.name) || "Agent",
    score: int(e.score, 0, MAX_SCORE),
    found: int(e.found, 0, 10),
    avgMs: int(e.avgMs, 0, 60000),
    bestStreak: int(e.bestStreak, 0, 10),
  });

  // local fallback, one list per board
  const KEY = `spot-the-secret-board-${board}`;
  const localRows = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const localWrite = rows => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) { /* storage blocked */ } };
  const localListeners = new Set();
  addEventListener("storage", e => { if (e.key === KEY) localListeners.forEach(f => f()); });

  async function submit(entry) {
    await init();
    const row = clean(entry);
    if (mode === "online") {
      try {
        const ref = await scores().add({ ...row, createdAt: root.firebase.firestore.FieldValue.serverTimestamp() });
        return { id: ref.id, mode };
      } catch (e) {
        console.warn("Leaderboard: could not save online, keeping it on this computer.", e);
      }
    }
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    localWrite(order([...localRows(), { ...row, id, at: Date.now() }]).slice(0, LIMIT));
    localListeners.forEach(f => f());
    return { id, mode: "local" };
  }

  // Calls back with the ordered rows now and whenever the board changes.
  function subscribe(cb0) {
    const cb = (rows, m) => { shown = bestPerName(rows); cb0(shown, m); };
    let stop = () => {}, dead = false;
    init().then(() => {
      if (dead) return;
      if (mode === "online") {
        stop = scores().orderBy("score", "desc").limit(LIMIT).onSnapshot(
          snap => cb(order(snap.docs.map(d => {
            const v = d.data();
            return { ...clean(v), id: d.id, at: v.createdAt && v.createdAt.toMillis ? v.createdAt.toMillis() : Date.now() };
          })), "online"),
          err => { console.warn("Leaderboard: live updates stopped.", err); cb(order(localRows()), "error"); });
      } else {
        const f = () => cb(order(localRows()), "local");
        localListeners.add(f); f();
        stop = () => localListeners.delete(f);
      }
    });
    return () => { dead = true; stop(); };
  }

  // Clears this board. Only the local board can be cleared from the game; an
  // online board is cleared in the Firebase console (the rules forbid deletes).
  async function reset() {
    await init();
    if (mode === "online") return { ok: false, reason: "This board is shared online. Clear it in the Firebase console (Firestore > boards)." };
    try { localStorage.removeItem(KEY); } catch (e) { return { ok: false, reason: "This browser blocked the change." }; }
    localListeners.forEach(f => f());
    return { ok: true };
  }
  const count = () => shown.length;

  root.Board = { init, submit, subscribe, reset, count, cleanName, nameProblem, randomName, board, MAX_NAME, get mode() { return mode; } };
})(window);
