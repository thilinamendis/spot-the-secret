/*
 * Spot the Secret: steganography game for the classroom
 * Developed by Thilina Mendis
 * Date: October 17, 2026
 *
 * simple.js: ten levels, two photos each, one tool per level that works on
 * both photos at once. Each level has its own 1-minute clock, and a find is
 * worth more the faster it is. Correct answers in a row earn a streak bonus,
 * added on the end screen. Animations live in fx.js; the leaderboard (with
 * the player's agent name) lives in leaderboard.js. Expects levels_simple/levels.json and
 * levels_simple/level_XX/{cover,stego}.png from tools/generate_simple.py.
 */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BASE = "levels_simple/";
  const BLUR = 4;            // Booster: radius of the blurred copy
  const MAX_BOOST = 30;

  // ---- timing and scoring (change these to tune the game)
  const LEVEL_TIME = 60 * 1000;   // each level has 1 minute
  const LOW_TIME = 10 * 1000;     // the clock turns red for the last 10 seconds
  const FULL_TIME = 10 * 1000;    // a find within 10 seconds earns full points
  const MAX_POINTS = 10;          // ...which is 10 points
  const STEP_TIME = 5 * 1000;     // after that, 1 point less every 5 seconds
  const MIN_POINTS = 1;           // a correct find always earns at least 1 point
  const STREAK_BONUS = 2;         // bonus for each correct answer from the 2nd in a row on
  const pointsFor = ms => ms <= FULL_TIME ? MAX_POINTS
    : Math.max(MIN_POINTS, MAX_POINTS - Math.ceil((ms - FULL_TIME) / STEP_TIME));

  const state = {
    levels: [], idx: 0, score: 0,
    results: [],             // per level: true found, false missed
    outcomes: [],            // per level: "found", "wrong" or "timeout"
    times: [],               // per level: ms taken
    points: [],              // per level: speed points earned
    secretSide: "A", cur: null, cache: new Map(), phase: "loading", token: 0,
    view: "photo",           // "photo" or "tool"
    boost: 1, bit: 7, ch: 0, // tool settings
    started: 0, timer: 0, startTimer: 0,   // the level clock
    streak: 0, bestStreak: 0, toolUsed: false,
    name: "",                // agent name for the leaderboard
    rows: null, boardMode: "", myId: null, saving: false,   // leaderboard
  };
  const NAME_KEY = "spot-the-secret-name";   // remembers the agent name on this computer
  const BOARD_SHOW = 10;                     // rows shown on a leaderboard
  const TOOL_LOCK = 10 * 1000;   // the tool unlocks 10 seconds into a level, so students look first
  const BANNER_TIME = 1100;  // the level clock starts once the level banner has gone
  // Unlocked on the end screen. found(levels) = all those levels were found.
  const ACHIEVEMENTS = [
    { icon: "👁️", name: "Sharp Eyes", how: "Find all three faint-text secrets (levels 1-3)", test: g => g.found(1, 2, 3) },
    { icon: "🔬", name: "X-ray Vision", how: "Find every bit-plane secret (levels 4-7)", test: g => g.found(4, 5, 6, 7) },
    { icon: "🎨", name: "Colour Detective", how: "Find the single-colour secrets (levels 8 and 10)", test: g => g.found(8, 10) },
    { icon: "🔥", name: "On Fire", how: "Get 5 right in a row", test: g => g.bestStreak >= 5 },
    { icon: "⚡", name: "Lightning Fast", how: "Find a secret in under 5 seconds", test: g => g.fastest < 5000 },
    { icon: "🏆", name: "Perfect Agent", how: "Find all 10 secrets", test: g => g.count === 10 },
  ];
  // ranks and stars go by total points (a perfect, fast game is 100 + 18 streak bonus)
  const RANKS = [[100, "Master Spy Catcher"], [75, "Senior Agent"], [50, "Field Agent"], [20, "Junior Agent"], [0, "Agent in Training"]];
  const STARS = [80, 50, 20];   // total points for 3, 2 and 1 stars

  const TOOLS = {
    booster: {
      name: "Contrast Booster", view: "Booster",
      help: "Makes tiny brightness differences much bigger, so faint marks stand out. Slide it up.",
    },
    xray: {
      name: "X-ray", view: "X-ray",
      help: "Each colour is a number from 0 to 255 stored as 8 bits. The X-ray shows one bit: white = 1, black = 0. Bit 7 is the biggest, bit 0 (the last bit) the smallest.",
    },
  };

  // ---------------------------------------------------------------- loading
  async function loadImage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`);
    const blob = await res.blob();
    let bmp;
    // Skip colour management so every pixel value arrives exactly as stored.
    try { bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" }); }
    catch (e) { bmp = await createImageBitmap(blob); }
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    return { canvas: c, data: ctx.getImageData(0, 0, c.width, c.height) };
  }
  async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`);
    return res.json();
  }
  function loadLevel(i) {
    const meta = state.levels[i];
    if (!meta) return null;
    if (state.cache.has(i)) return state.cache.get(i);
    const d = `${BASE}level_${String(meta.level).padStart(2, "0")}/`;
    const p = Promise.all([loadImage(`${d}cover.png`), loadImage(`${d}stego.png`)])
      .then(([cover, stego]) => ({ meta, cover, stego, w: cover.data.width, h: cover.data.height }));
    state.cache.set(i, p);
    p.catch(() => state.cache.delete(i));
    return p;
  }

  // ---------------------------------------------------------------- DOM helpers
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    kids.flat().forEach(k => k != null && n.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
    return n;
  }
  function segmented(name, options, value, onChange) {
    const wrap = el("div", { class: "seg", role: "radiogroup", "aria-label": name });
    options.forEach(([val, label]) => {
      const b = el("button", { type: "button", role: "radio", "aria-checked": String(val === value), text: label });
      b.addEventListener("click", () => {
        $$("button", wrap).forEach(x => x.setAttribute("aria-checked", "false"));
        b.setAttribute("aria-checked", "true"); onChange(val);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }
  // A slider with a clickable, labelled mark under each stop.
  function stepped(slider, labels, onPick) {
    const n = labels.length - 1;
    const ticks = el("div", { class: "ticks", style: `--n: ${n}` }, ...labels.map((t, i) =>
      el("button", { type: "button", class: "tick", style: `--i: ${i}`, text: t, tabindex: "-1",
        onclick: () => { slider.value = slider.min ? +slider.min + i : i; onPick(); } })));
    const mark = i => Array.from(ticks.children).forEach((b, j) => b.classList.toggle("on", j === i));
    return { node: el("div", { class: "stepped" }, slider, ticks), mark };
  }

  // ---------------------------------------------------------------- tools
  // The photos as the student sees them.
  const img = side => side === state.secretSide ? state.cur.stego : state.cur.cover;

  // Booster: brightness minus a blurred copy, kept per photo so the slider is fast.
  function detail(asset) {
    if (asset.detail) return asset.detail;
    const { width: W, height: H, data } = asset.data;
    const Y = new Float32Array(W * H);
    for (let i = 0, p = 0; p < Y.length; i += 4, p++) Y[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // box blur, rows then columns, edges repeat the nearest pixel
    const boxPass = (src, dst, len, count, stride, step) => {
      for (let line = 0; line < count; line++) {
        const o = line * stride;
        const at = k => src[o + Math.min(len - 1, Math.max(0, k)) * step];
        let sum = 0;
        for (let k = -BLUR; k <= BLUR; k++) sum += at(k);
        for (let k = 0; k < len; k++) {
          dst[o + k * step] = sum / (2 * BLUR + 1);
          sum += at(k + BLUR + 1) - at(k - BLUR);
        }
      }
    };
    const tmp = new Float32Array(W * H), blur = new Float32Array(W * H);
    boxPass(Y, tmp, W, H, W, 1);
    boxPass(tmp, blur, H, W, 1, W);
    for (let p = 0; p < Y.length; p++) Y[p] -= blur[p];
    return (asset.detail = Y);
  }
  function boosted(asset, k, out) {
    const d = detail(asset);
    for (let p = 0, i = 0; p < d.length; p++, i += 4) {
      out[i] = out[i + 1] = out[i + 2] = 128 + k * d[p];   // clamped by Uint8ClampedArray
      out[i + 3] = 255;
    }
    return out;
  }

  function paint() {
    if (!state.cur) return;
    const tool = state.cur.meta.tool;
    $$(".pane").forEach(p => {
      const c = $(".photo", p), asset = img(p.dataset.side), ctx = c.getContext("2d");
      if (state.view === "photo") { ctx.drawImage(asset.canvas, 0, 0); return; }
      const out = new ImageData(state.cur.w, state.cur.h);
      if (tool === "booster") boosted(asset, state.boost, out.data);
      else Stego.bitPlane(asset.data.data, state.bit, state.ch, out.data);
      ctx.putImageData(out, 0, 0);
    });
  }

  function lockTool(locked) {
    state.toolLocked = locked;
    $("#toolbar").classList.toggle("locked", locked);
    $("#toolControls").inert = locked;
    $(".view-seg").inert = locked;
    if (locked) { $("#lockSecs").textContent = String(TOOL_LOCK / 1000); return; }
    FX.pulse($("#toolbar"), "unlocked");
    if (!state.toolUsed) $("#tryHint").hidden = false;
    if (window.Sound) Sound.play("unlock");
  }

  function toolTouched() {
    state.toolUsed = true;
    $("#tryHint").hidden = true;
  }

  function setView(v) {
    if (v === "tool") toolTouched();
    const turnedOn = v === "tool" && state.view !== "tool";
    state.view = v;
    $$(".view-seg button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.view === v)));
    paint();
    if (turnedOn) $$(".frame").forEach(f => FX.pulse(f, "scanning"));
  }

  function buildToolbar(meta) {
    const T = TOOLS[meta.tool];
    $("#toolName").textContent = T.name;
    $("#toolViewBtn").textContent = T.view;
    $("#toolHelp").textContent = T.help;
    const box = $("#toolControls");
    box.replaceChildren();
    // moving any control switches the photos to the tool view
    const changed = () => { toolTouched(); if (state.view !== "tool") setView("tool"); else paint(); };

    if (meta.tool === "booster") {
      const out = el("output", { class: "readout-inline", text: `×${state.boost}` });
      const slider = el("input", { type: "range", min: 1, max: MAX_BOOST, step: 1, value: state.boost, "aria-label": "Boost" });
      slider.addEventListener("input", () => { state.boost = +slider.value; out.textContent = `×${state.boost}`; changed(); });
      box.append(el("div", { class: "controls" }, el("label", { text: "Boost" }), slider, out));
    } else {
      // the slider runs from bit 7 on the left down to bit 0 on the right
      const slider = el("input", { type: "range", min: 0, max: 7, step: 1, value: 7 - state.bit, "aria-label": "Bit" });
      const out = el("output", { class: "readout-inline" });
      const s = stepped(slider, ["7", "6", "5", "4", "3", "2", "1", "0"], () => update());
      const update = () => {
        state.bit = 7 - +slider.value;
        out.textContent = state.bit === 0 ? "bit 0 (last)" : `bit ${state.bit}`;
        slider.setAttribute("aria-valuetext", `bit ${state.bit}`);
        s.mark(+slider.value);
      };
      slider.addEventListener("input", () => { update(); changed(); });
      $$(".tick", s.node).forEach(t => t.addEventListener("click", changed));
      update();
      box.append(el("div", { class: "controls" }, el("label", { text: "Bit" }), s.node, out));
      if (meta.colours) {
        box.append(el("div", { class: "controls colour" }, el("label", { text: "Colour" }),
          // a new colour starts again from bit 7, so each colour is scanned from the top
          segmented("Colour", [[0, "Red"], [1, "Green"], [2, "Blue"]], state.ch, v => { state.ch = v; slider.value = 0; update(); changed(); })));
      }
    }
  }

  // ---------------------------------------------------------------- leaderboard
  const MEDALS = ["🥇", "🥈", "🥉"];
  function boardRow(r, i, mine) {
    return el("li", { class: "br" + (mine ? " mine" : "") + (i < 3 ? ` top${i + 1}` : "") },
      el("span", { class: "br-rank", text: MEDALS[i] || String(i + 1) }),
      el("span", { class: "br-name", text: r.name }),
      el("span", { class: "br-found", text: `${r.found}/10` }),
      el("span", { class: "br-score", text: String(r.score) }));
  }
  function renderBoard(list) {
    const rows = state.rows;
    if (!rows) { list.replaceChildren(el("li", { class: "br-empty", text: "Loading the leaderboard…" })); return; }
    if (!rows.length) { list.replaceChildren(el("li", { class: "br-empty", text: "No scores yet. Be the first agent on the board!" })); return; }
    const me = myRow(rows);
    const items = rows.slice(0, BOARD_SHOW).map((r, i) => boardRow(r, i, i === me));
    if (me >= BOARD_SHOW) items.push(el("li", { class: "br-gap", "aria-hidden": "true", text: "⋯" }), boardRow(rows[me], me, true));
    list.replaceChildren(...items);
  }
  // The player's row: their latest game, or their best one if that is still higher.
  function myRow(rows) {
    const byId = rows.findIndex(r => r.id === state.myId);
    if (byId >= 0 || !state.myId) return byId;
    return rows.findIndex(r => r.name.toLowerCase() === state.name.toLowerCase());
  }
  function renderBoards() {
    renderBoard($("#boardLanding"));
    requestAnimationFrame(fitDemo);
    renderBoard($("#boardEnd"));
    const label = state.boardMode === "online" ? "● Live" : state.boardMode === "error" ? "Offline" : "This computer";
    $$("[data-board-mode]").forEach(n => { n.textContent = label; n.dataset.mode = state.boardMode; });
    if (state.phase !== "end") return;
    const rows = state.rows || [], me = myRow(rows), latest = rows.some(r => r.id === state.myId);
    $("#placed").textContent = state.saving ? "Saving your score…"
      : me < 0 ? ""
      : latest ? `🏆 You're #${me + 1} of ${rows.length} on the leaderboard!`
      : `🏆 Your best score, ${rows[me].score}, is #${me + 1} of ${rows.length}.`;
  }
  function saveScore(total, found, avg) {
    state.saving = true; state.myId = null; renderBoards();
    Board.submit({ name: state.name, score: total, found, avgMs: found ? avg : 60000, bestStreak: state.bestStreak })
      .then(r => { state.myId = r.id; })
      .catch(e => console.warn(e))
      .finally(() => { state.saving = false; renderBoards(); });
  }

  // Photos take whatever height is left, so both pick buttons are always on screen.
  function fitPhotos() {
    const arena = $("#arena"), pick = $(".pick");
    if (!arena || $("#screenPlay").hidden) return;
    const top = arena.getBoundingClientRect().top + scrollY;
    const room = innerHeight - top - pick.offsetHeight - 12 /* gap */ - 14 /* frame */ - 10 /* margin */;
    document.documentElement.style.setProperty("--photo-max", `${Math.max(160, Math.floor(room))}px`);
  }

  // Landing page: the demo picture gets most of the height the Top 10 leaves free.
  const DEMO_SHARE = 0.8;
  function fitDemo() {
    const side = $(".title-side"), demo = $("#demoCard"), board = $(".title-side .board-card"), list = $("#boardLanding");
    if (!side || $("#screenTitle").hidden || getComputedStyle(demo).display === "none") return;
    const cs = getComputedStyle(side);
    const inner = side.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.rowGap || cs.gap || 0);
    const boardNeeds = board.offsetHeight - list.clientHeight + list.scrollHeight;
    const frame = demo.offsetHeight - demo.querySelector("canvas").offsetHeight;   // the card's own padding
    // use about 80% of the free space, so the picture doesn't crowd the column
    const h = Math.max(130, Math.min(280, Math.floor((inner - boardNeeds - frame - 4) * DEMO_SHARE)));
    document.documentElement.style.setProperty("--demo-h", `${h}px`);
  }

  // ---------------------------------------------------------------- flow
  function show(id) {
    $$(".screen").forEach(s => s.hidden = s.id !== id);
    $("#hud").hidden = id === "screenTitle";
    document.body.dataset.screen = id;   // the Admin button hides during a level
    if (id === "screenTitle") requestAnimationFrame(fitDemo);
    $("#hud").classList.toggle("over", id === "screenEnd");   // no level clock on the end screen
    closePopup();
    window.scrollTo({ top: 0 });
  }
  function renderHUD() {
    renderPips();
    $("#hudScore").textContent = String(state.score);
    renderStreak();
  }
  function renderStreak() {
    $("#hudStreak").textContent = state.streak >= 2 ? `🔥 ${state.streak}` : String(state.streak);
    $("#streakStat").classList.toggle("hot", state.streak >= 2);
  }
  function renderPips() {
    $("#pips").replaceChildren(...state.levels.map((m, i) => {
      const r = state.results[i];
      return el("li", {
        class: (r === true ? "hit" : r === false ? "miss" : i === state.idx ? "current" : "") +
          (r != null && i === state.idx && state.phase === "reveal" ? " fresh" : ""),
        title: `Level ${m.level}` + (r === true ? ": found" : state.outcomes[i] === "timeout" ? ": out of time" : r === false ? ": missed" : ""),
        text: String(m.level),
      });
    }));
  }
  function difficulty(target, level) {
    const bars = Math.ceil(level / 2);
    target.replaceChildren(...[1, 2, 3, 4, 5].map(i => el("span", { class: i <= bars ? "on" : "" })));
    target.setAttribute("aria-label", `Difficulty ${bars} of 5`);
  }

  // ---------------------------------------------------------------- clock
  // Each level counts down from 1 minute. It runs from a start time, so it
  // stays right even if the tab sleeps, and it stops while the popup is open.
  const elapsed = () => Date.now() - state.started;
  const clock = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  function showTime(left, worth, waiting) {
    $("#hudTime").textContent = clock(left);
    $("#timeLabel").textContent = waiting ? "Get ready" : "Time left";
    $("#timeStat").classList.toggle("low", !waiting && left <= LOW_TIME);
    $("#timeStat").classList.toggle("paused", !!waiting);
    $("#hudWorth").textContent = `${worth} pts`;
    $("#worthStat").classList.toggle("full", worth === MAX_POINTS);
    const fill = $("#timeFill");
    fill.style.width = `${(100 * left) / LEVEL_TIME}%`;
    fill.className = left <= LOW_TIME ? "low" : left <= LEVEL_TIME / 2 ? "mid" : "";
  }
  function tick() {
    const t = elapsed(), left = Math.max(0, LEVEL_TIME - t), worth = pointsFor(t);
    if (worth !== state.lastWorth && state.lastWorth != null) FX.pulse($("#worthStat"), "drop");
    state.lastWorth = worth;
    showTime(left, worth, false);
    const sec = Math.ceil(left / 1000);
    if (sec <= 5 && sec > 0 && sec !== state.lastTick) { state.lastTick = sec; Sound.play("tick"); }
    if (state.toolLocked) {
      if (t >= TOOL_LOCK) lockTool(false);
      else $("#lockSecs").textContent = String(Math.ceil((TOOL_LOCK - t) / 1000));
    }
    if (left === 0) timeUp();
  }
  function startClock() {
    stopClock();
    state.started = Date.now(); state.lastWorth = null; state.lastTick = null;
    tick();
    state.timer = setInterval(tick, 200);
  }
  function stopClock() { clearInterval(state.timer); clearTimeout(state.startTimer); state.timer = 0; }

  function newGame() {
    state.results = []; state.outcomes = []; state.times = []; state.points = [];
    state.score = 0; state.streak = 0; state.bestStreak = 0;
    startLevel(0);
  }

  async function startLevel(i) {
    const token = ++state.token;
    stopClock();
    state.idx = i; state.phase = "loading"; state.cur = null;
    const meta = state.levels[i];
    show("screenPlay");
    $("#prompt").hidden = false;
    FX.pulse($(".level-bar"), "enter");
    $("#lbNum").textContent = `Level ${i + 1}`;
    $("#lbTitle").textContent = meta.title;
    const bannerGone = Date.now() + (FX.reduce ? 0 : BANNER_TIME);
    if (!FX.reduce) FX.pulse($("#levelBanner"), "show");
    $("#levelNum").textContent = `Level ${i + 1} of ${state.levels.length}`;
    $("#levelTitle").textContent = meta.title;
    difficulty($("#difficulty"), meta.level);
    $$(".pane").forEach(p => { p.classList.remove("is-secret", "is-original", "picked-ok", "picked-no", "enter"); $(".stamp", p).textContent = ""; });
    $$(".pick").forEach(b => { b.disabled = true; b.hidden = false; });
    // every level starts with plain photos and fresh tool settings
    state.view = "photo"; state.boost = 1; state.bit = 7; state.ch = 0; state.toolUsed = false;
    $("#tryHint").hidden = true;
    lockTool(true);
    $$(".view-seg button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.view === "photo")));
    buildToolbar(meta);
    renderHUD();
    showTime(LEVEL_TIME, MAX_POINTS, true);
    fitPhotos();

    let cur;
    try { cur = await loadLevel(i); } catch (e) { if (token === state.token) fail(e); return; }
    if (token !== state.token) return;     // a newer level was started meanwhile
    state.cur = cur;
    loadLevel(i + 1);
    state.secretSide = Math.random() < 0.5 ? "A" : "B";
    $$(".pane .photo").forEach(c => { c.width = cur.w; c.height = cur.h; });
    paint();
    $$(".pane").forEach(p => FX.pulse(p, "enter"));
    // the clock (and picking) starts once the banner is out of the way
    state.startTimer = setTimeout(() => {
      if (token !== state.token) return;
      $$(".pick").forEach(b => b.disabled = false);
      state.phase = "spot";
      startClock();
    }, Math.max(0, bannerGone - Date.now()));
    $("#levelTitle").focus({ preventScroll: true });
  }

  function pick(side) {
    if (state.phase !== "spot") return;
    const t = elapsed();
    stopClock();
    reveal(side === state.secretSide ? "found" : "wrong", t, side);
  }
  function timeUp() {
    if (state.phase !== "spot") return;
    stopClock();
    reveal("timeout", LEVEL_TIME, null);
  }

  // outcome: "found", "wrong" or "timeout"
  function reveal(outcome, t, side) {
    state.phase = "reveal";
    const ok = outcome === "found", m = state.cur.meta, i = state.idx;
    const pts = ok ? pointsFor(t) : 0;
    state.results[i] = ok; state.outcomes[i] = outcome; state.times[i] = t; state.points[i] = pts;
    const before = state.score;
    state.score += pts;
    state.streak = ok ? state.streak + 1 : 0;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    $("#tryHint").hidden = true;
    showTime(Math.max(0, LEVEL_TIME - t), pts || pointsFor(t), false);
    $$(".pick").forEach(b => b.hidden = true);
    $$(".pane").forEach(p => {
      const secret = p.dataset.side === state.secretSide;
      p.classList.add(secret ? "is-secret" : "is-original");
      if (p.dataset.side === side) p.classList.add(ok ? "picked-ok" : "picked-no");
      $(".stamp", p).textContent = secret ? "Secret" : "Original";
    });
    $("#prompt").hidden = true;
    renderPips();
    renderStreak();
    if (state.streak >= 2) FX.pulse($("#streakStat"), "bump");
    Sound.play(outcome === "found" ? "correct" : outcome === "timeout" ? "timeout" : "wrong");
    setTimeout(() => openPopup(outcome, m, before, pts, t), FX.reduce ? 0 : 650);
  }

  function openPopup(outcome, m, before, pts, t) {
    if (state.phase !== "reveal") return;
    const ok = outcome === "found", secs = (t / 1000).toFixed(1);
    const pop = $("#popup");
    pop.className = "popup-back " + (ok ? "ok" : "no");
    $("#popBadge").textContent = ok ? "✓" : outcome === "timeout" ? "⏰" : "✗";
    $("#popPoints").textContent = `+${pts}`;
    $("#popHead").textContent = ok
      ? (pts === MAX_POINTS ? ["Lightning fast!", "Super speedy!", "Amazing eyes!"][i3()] : ["Correct!", "Nice work!", "You found it!", "Great eyes!"][state.idx % 4])
      : outcome === "timeout" ? "Out of time!" : "Not this time";
    $("#popSub").textContent = ok
      ? `You found it in ${secs} seconds. +${pts} point${pts === 1 ? "" : "s"}!`
      : outcome === "timeout" ? `The minute ran out. The secret was in photo ${state.secretSide}.`
      : `The secret was in photo ${state.secretSide}. Keep going!`;
    $("#popStreak").hidden = state.streak < 2;
    $("#popStreak").textContent = `🔥 ${state.streak} in a row! +${STREAK_BONUS} bonus at the end`;
    $("#popHow").textContent = m.how;
    $("#popPlain").textContent = `In plain words: ${m.plain}`;
    $("#nextBtn").textContent = state.idx + 1 < state.levels.length ? "Next level ▶" : "See your score ▶";
    pop.hidden = false;
    $("#screenPlay").inert = true; $("#hud").inert = true;
    $("#nextBtn").focus({ preventScroll: true });
    if (!ok) return;
    const badge = $("#popBadge").getBoundingClientRect();
    setTimeout(() => FX.confetti(badge.left + badge.width / 2, badge.top + badge.height / 2, pts === MAX_POINTS ? 140 : 80), FX.reduce ? 0 : 250);
    FX.flyText(`+${pts}`, $("#popPoints"), $("#scoreStat")).then(() => {
      FX.pulse($("#scoreStat"), "bump");
      FX.countUp($("#hudScore"), before, state.score, 400);
    });
    if (FX.reduce) $("#hudScore").textContent = String(state.score);
  }
  const i3 = () => state.idx % 3;

  function closePopup() {
    $("#popup").hidden = true;
    $("#screenPlay").inert = false; $("#hud").inert = false;
  }

  function next() {
    if (state.phase !== "reveal") return;
    closePopup();
    if (state.idx + 1 < state.levels.length) startLevel(state.idx + 1);
    else finish();
  }

  // Streak bonus: every correct answer from the 2nd in a row onwards.
  function streakBonus(results) {
    let run = 0, bonus = 0;
    for (const ok of results) { run = ok ? run + 1 : 0; if (run >= 2) bonus += STREAK_BONUS; }
    return bonus;
  }

  function finish() {
    if (state.phase === "end") return;
    stopClock();
    state.token++;                         // drop a level that is still loading
    state.phase = "end";
    state.idx = state.levels.length;
    show("screenEnd");
    renderHUD();
    const r = state.results, n = state.levels.length, found = r.filter(Boolean).length;
    const bonus = streakBonus(r), total = state.score + bonus;
    const foundTimes = state.times.filter((t, i) => r[i]);
    const avg = foundTimes.length ? foundTimes.reduce((a, b) => a + b, 0) / foundTimes.length : 0;
    const rank = RANKS.find(([k]) => total >= k)[1];
    $("#endKicker").textContent = "🎉 All 10 levels done!";
    const stars = STARS.filter(k => total >= k).length;
    $$("#stars span").forEach((st, i) => { st.className = i < stars ? "on" : ""; st.style.animationDelay = `${300 + i * 250}ms`; });
    $("#agentRank").textContent = rank;
    // speed points, then the streak bonus lands on top
    $("#endTitle").textContent = "0 points";
    FX.countUp($("#endTitle"), 0, state.score, 1000, v => `${v} points`).then(() => {
      if (!bonus) return;
      FX.pulse($("#endBonus"), "land");
      FX.pulse($("#scoreStat"), "bump");
      FX.countUp($("#hudScore"), state.score, total, 700);
      FX.countUp($("#endTitle"), state.score, total, 700, v => `${v} points`);
    });
    $("#endBreak").replaceChildren(
      el("span", { class: "eb-part", text: `⚡ Speed points ${state.score}` }),
      el("span", { class: "eb-plus", text: "+" }),
      el("span", { class: "eb-part bonus", id: "endBonus", text: `🔥 Streak bonus ${bonus}` }),
      el("span", { class: "eb-plus", text: "=" }),
      el("span", { class: "eb-part total", text: `${total} points` }));
    $("#endRank").textContent = `You found ${found} of ${n} secrets` +
      (found ? `, in ${(avg / 1000).toFixed(1)} seconds on average.` : ".") +
      (state.bestStreak >= 2 ? ` Best streak: ${state.bestStreak} in a row.` : "");
    // agent card
    $("#agentId").textContent = `#${String(1000 + Math.floor(Math.random() * 9000))}`;
    $("#acRank").textContent = rank;
    FX.countUp($("#acFound"), 0, found, 1000);
    FX.countUp($("#acPoints"), 0, total, 1500);
    $("#acSecrets").textContent = `${found} of ${n}`;
    $("#acAvg").textContent = found ? `${(avg / 1000).toFixed(1)} s` : "–";
    $("#acStreak").textContent = String(state.bestStreak);
    if (stars >= 2) setTimeout(() => FX.confetti(innerWidth / 2, innerHeight * 0.3, 160), 900);
    saveScore(total, found, avg);
    setTimeout(() => Sound.play("fanfare"), FX.reduce ? 0 : 300);
    const g = { found: (...lv) => lv.every(l => r[l - 1] === true), count: found, bestStreak: state.bestStreak,
                fastest: Math.min(Infinity, ...foundTimes) };
    $("#achievements").replaceChildren(...ACHIEVEMENTS.map((a, i) => {
      const got = a.test(g);
      return el("li", { class: "ach" + (got ? " got" : ""), style: `--d: ${900 + i * 120}ms`, title: a.how },
        el("span", { class: "ach-icon", "aria-hidden": "true", text: got ? a.icon : "🔒" }),
        el("span", { class: "ach-text" }, el("b", { text: a.name }), el("span", { text: got ? "Unlocked!" : a.how })));
    }));
    $("#resultRow").replaceChildren(...state.levels.map((m, i) => {
      const o = state.outcomes[i];
      const status = o === "found" ? ["hit", `Found in ${(state.times[i] / 1000).toFixed(1)} s · +${state.points[i]}`]
        : o === "timeout" ? ["miss", "Out of time"] : ["miss", "Missed"];
      return el("li", { class: status[0], style: `--d: ${i * 70}ms` },
        el("span", { class: "rn", text: String(m.level) }), el("span", { class: "rt", text: m.title }),
        el("span", { class: "rs", text: status[1] }));
    }));
  }

  function fail(e) {
    $$("#loadStatus, #titleStatus").forEach(n => n.textContent = location.protocol === "file:"
      ? "The game has to run from a web server, because browsers block reading pixel data from files opened directly. In this folder run: python -m http.server 8000, then open http://localhost:8000"
      : `Something went wrong while loading: ${e.message}`);
  }

  async function boot() {
    $$(".pick").forEach(b => b.addEventListener("click", () => pick(b.dataset.pick)));
    $$(".view-seg button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    $("#nextBtn").addEventListener("click", next);
    // Play again goes back to the landing page; "Play now" starts a fresh game and clock
    $("#againBtn").addEventListener("click", () => { show("screenTitle"); $("#agentName").focus({ preventScroll: true }); });
    const nameIn = $("#agentName"), note = $("#nameNote"), noteText = note.textContent;
    try { nameIn.value = localStorage.getItem(NAME_KEY) || ""; } catch (e) { /* storage blocked */ }
    nameIn.addEventListener("input", () => { note.textContent = noteText; note.classList.remove("bad"); $(".name-box").classList.remove("shake-x"); });
    $("#diceBtn").addEventListener("click", () => { nameIn.value = Board.randomName(); nameIn.dispatchEvent(new Event("input")); FX.pulse($("#diceBtn"), "roll"); });
    $("#nameForm").addEventListener("submit", e => {
      e.preventDefault();
      const problem = Board.nameProblem(nameIn.value);
      if (problem) { note.textContent = problem; note.classList.add("bad"); FX.pulse($(".name-box"), "shake-x"); nameIn.focus(); return; }
      state.name = Board.cleanName(nameIn.value);
      nameIn.value = state.name;
      try { localStorage.setItem(NAME_KEY, state.name); } catch (e) { /* storage blocked */ }
      $("#hudAgent").textContent = `· Agent ${state.name}`;
      newGame();
    });
    renderBoards();
    Board.subscribe((rows, mode) => { state.rows = rows; state.boardMode = mode; renderBoards(); });
    // admin panel: the Admin button (top right), or click "Top agents" 5 times quickly
    Admin.attach($("#boardHeadLanding"), { onReset: () => { state.myId = null; renderBoards(); } });
    $("#adminBtn").addEventListener("click", () => Admin.open());
    Sound.attach($("#soundBtn"));
    addEventListener("resize", fitPhotos);
    addEventListener("resize", fitDemo);
    if (document.fonts) document.fonts.ready.then(() => { fitPhotos(); fitDemo(); });
    // the full leaderboard page keeps the same ?board=
    $$("[data-board-link]").forEach(a => { a.href = `leaderboard.html${location.search}`; });
    document.body.dataset.screen = "screenTitle";
    FX.bitsBackground($("#bitsBg"), 56);
    FX.parallax(document.querySelector(".bg-fx"));
    $$(".frame").forEach(f => FX.tilt(f));
    FX.bounceLetters($("#logo"));
    Demo.start($("#demoCard"), "levels_simple/demo/stego.png", () => !$("#screenTitle").hidden);
    try {
      state.levels = await loadJSON(`${BASE}levels.json`);
      loadLevel(0);                        // so level 1 is ready when they press Play now
      $("#playBtn").disabled = false;
    } catch (e) { fail(e); }
  }

  boot();
})();
