/*
 * Spot the Secret: steganography game for the classroom
 * Developed by Thilina Mendis
 * Date: October 17, 2026
 *
 * simple.js: ten levels, two photos each, one tool per level that works on
 * both photos at once, a 5-minute clock that pauses while the result popup
 * is open. Animations live in fx.js. Expects levels_simple/levels.json and
 * levels_simple/level_XX/{cover,stego}.png from tools/generate_simple.py.
 */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BASE = "levels_simple/";
  const POINTS = 10;
  const BLUR = 4;            // Booster: radius of the blurred copy
  const MAX_BOOST = 30;
  const GAME_TIME = 5 * 60 * 1000;   // the whole game must be done in 5 minutes
  const LOW_TIME = 30 * 1000;        // the clock turns red for the last 30 seconds

  const state = {
    levels: [], idx: 0, results: [], score: 0,
    secretSide: "A", cur: null, cache: new Map(), phase: "loading", token: 0,
    view: "photo",           // "photo" or "tool"
    boost: 1, bit: 7, ch: 0, // tool settings
    deadline: 0, timer: 0,   // the game clock
    remaining: GAME_TIME,    // time left while the clock is paused
    streak: 0, bestStreak: 0, toolUsed: false, hintTimer: 0,
  };
  const HINT_AFTER = 5000;   // show "Try the tool!" if the tool is untouched this long
  // Unlocked on the end screen. found(levels) = all those levels were found.
  const ACHIEVEMENTS = [
    { icon: "👁️", name: "Sharp Eyes", how: "Find all three faint-text secrets (levels 1-3)", test: g => g.found(1, 2, 3) },
    { icon: "🔬", name: "X-ray Vision", how: "Find every bit-plane secret (levels 4-7)", test: g => g.found(4, 5, 6, 7) },
    { icon: "🎨", name: "Colour Detective", how: "Find the single-colour secrets (levels 8 and 10)", test: g => g.found(8, 10) },
    { icon: "🔥", name: "On Fire", how: "Get 5 right in a row", test: g => g.bestStreak >= 5 },
    { icon: "⚡", name: "Speed Agent", how: "Finish all 10 levels with 2 minutes to spare", test: g => !g.timedOut && g.left >= 120000 },
    { icon: "🏆", name: "Perfect Agent", how: "Find all 10 secrets", test: g => g.count === 10 },
  ];
  const RANKS = [[10, "Master Spy Catcher"], [8, "Senior Agent"], [5, "Field Agent"], [2, "Junior Agent"], [0, "Agent in Training"]];
  const STARS = [8, 5, 2];   // secrets found for 3, 2 and 1 stars

  const TOOLS = {
    booster: {
      name: "Contrast Booster", view: "Booster",
      help: "The booster makes tiny differences in brightness much bigger. Faint marks your eyes can't see start to stand out. Slide it up.",
    },
    xray: {
      name: "X-ray", view: "X-ray",
      help: "Each colour is a number from 0 to 255 stored as 8 bits. The X-ray shows just one of those bits: white where it is 1, black where it is 0. Bit 7 is the biggest part of the number, bit 0 (the last bit) the smallest.",
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

  function toolTouched() {
    state.toolUsed = true;
    clearTimeout(state.hintTimer);
    $("#tryHint").hidden = true;
  }
  function armHint() {
    clearTimeout(state.hintTimer);
    $("#tryHint").hidden = true;
    state.hintTimer = setTimeout(() => { if (!state.toolUsed && state.phase === "spot") $("#tryHint").hidden = false; }, HINT_AFTER);
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
          segmented("Colour", [[0, "Red"], [1, "Green"], [2, "Blue"]], state.ch, v => { state.ch = v; changed(); })));
      }
    }
  }

  // ---------------------------------------------------------------- flow
  function show(id) {
    $$(".screen").forEach(s => s.hidden = s.id !== id);
    $("#hud").hidden = id === "screenTitle";
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
        title: `Level ${m.level}` + (r === true ? ": found" : r === false ? ": missed" : ""),
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
  // Counts down to a fixed deadline, so it stays right even if the tab sleeps.
  const timeLeft = () => Math.max(0, state.deadline - Date.now());
  const clock = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  function showTime(left, paused) {
    $("#hudTime").textContent = clock(left);
    $("#timeLabel").textContent = paused ? "Paused" : "Time left";
    $("#timeStat").classList.toggle("low", left <= LOW_TIME);
    $("#timeStat").classList.toggle("paused", paused);
    const fill = $("#timeFill");
    fill.style.width = `${(100 * left) / GAME_TIME}%`;
    fill.className = left <= LOW_TIME ? "low" : left <= GAME_TIME / 2 ? "mid" : "";
  }
  function tick() {
    const left = timeLeft();
    showTime(left, false);
    if (left === 0) finish(true);
  }
  function runClock(ms) {
    stopClock();
    state.deadline = Date.now() + ms;
    tick();
    state.timer = setInterval(tick, 250);
  }
  function startClock() { runClock(GAME_TIME); }
  function stopClock() { clearInterval(state.timer); state.timer = 0; }
  // freeze the countdown while the result popup is open
  function pauseClock() { state.remaining = timeLeft(); stopClock(); showTime(state.remaining, true); }
  function resumeClock() { runClock(state.remaining); }

  function newGame() {
    state.results = []; state.score = 0; state.streak = 0; state.bestStreak = 0;
    startClock();
    startLevel(0);
  }

  async function startLevel(i) {
    const token = ++state.token;
    state.idx = i; state.phase = "loading"; state.cur = null;
    const meta = state.levels[i];
    show("screenPlay");
    $("#prompt").hidden = false;
    FX.pulse($(".level-bar"), "enter");
    $("#lbNum").textContent = `Level ${i + 1}`;
    $("#lbTitle").textContent = meta.title;
    if (!FX.reduce) FX.pulse($("#levelBanner"), "show");
    $("#levelNum").textContent = `Level ${i + 1} of ${state.levels.length}`;
    $("#levelTitle").textContent = meta.title;
    difficulty($("#difficulty"), meta.level);
    $$(".pane").forEach(p => { p.classList.remove("is-secret", "is-original", "picked-ok", "picked-no", "enter"); $(".stamp", p).textContent = ""; });
    $$(".pick").forEach(b => { b.disabled = true; b.hidden = false; });
    // every level starts with plain photos and fresh tool settings
    state.view = "photo"; state.boost = 1; state.bit = 7; state.ch = 0; state.toolUsed = false;
    clearTimeout(state.hintTimer); $("#tryHint").hidden = true;
    $$(".view-seg button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.view === "photo")));
    buildToolbar(meta);
    renderHUD();

    let cur;
    try { cur = await loadLevel(i); } catch (e) { if (token === state.token) fail(e); return; }
    if (token !== state.token) return;     // a newer level was started meanwhile
    state.cur = cur;
    loadLevel(i + 1);
    state.secretSide = Math.random() < 0.5 ? "A" : "B";
    $$(".pane .photo").forEach(c => { c.width = cur.w; c.height = cur.h; });
    paint();
    $$(".pane").forEach(p => FX.pulse(p, "enter"));
    $$(".pick").forEach(b => b.disabled = false);
    state.phase = "spot";
    armHint();
    $("#levelTitle").focus({ preventScroll: true });
  }

  function pick(side) {
    if (state.phase !== "spot") return;
    state.phase = "reveal";
    pauseClock();
    const ok = side === state.secretSide, m = state.cur.meta;
    state.results[state.idx] = ok;
    const before = state.score;
    if (ok) state.score += POINTS;
    state.streak = ok ? state.streak + 1 : 0;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    clearTimeout(state.hintTimer); $("#tryHint").hidden = true;
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
    setTimeout(() => openPopup(ok, m, before), FX.reduce ? 0 : 650);
  }

  function openPopup(ok, m, before) {
    if (state.phase !== "reveal") return;
    const pop = $("#popup");
    pop.className = "popup-back " + (ok ? "ok" : "no");
    $("#popBadge").textContent = ok ? "✓" : "✗";
    $("#popPoints").textContent = ok ? `+${POINTS}` : "+0";
    $("#popHead").textContent = ok ? ["Correct!", "Nice work!", "You found it!", "Great eyes!"][state.idx % 4] : "Not this time";
    $("#popSub").textContent = ok
      ? `Photo ${state.secretSide} had the secret. +${POINTS} points!`
      : `The secret was in photo ${state.secretSide}. Keep going!`;
    $("#popStreak").hidden = state.streak < 2;
    $("#popStreak").textContent = `🔥 ${state.streak} in a row!`;
    $("#popHow").textContent = m.how;
    $("#popPlain").textContent = `In plain words: ${m.plain}`;
    $("#nextBtn").textContent = state.idx + 1 < state.levels.length ? "Next level ▶" : "See your score ▶";
    pop.hidden = false;
    $("#screenPlay").inert = true; $("#hud").inert = true;
    $("#nextBtn").focus({ preventScroll: true });
    if (!ok) return;
    const badge = $("#popBadge").getBoundingClientRect();
    setTimeout(() => FX.confetti(badge.left + badge.width / 2, badge.top + badge.height / 2), FX.reduce ? 0 : 250);
    FX.flyText(`+${POINTS}`, $("#popPoints"), $("#scoreStat")).then(() => {
      FX.pulse($("#scoreStat"), "bump");
      FX.countUp($("#hudScore"), before, state.score, 400);
    });
    if (FX.reduce) $("#hudScore").textContent = String(state.score);
  }

  function closePopup() {
    $("#popup").hidden = true;
    $("#screenPlay").inert = false; $("#hud").inert = false;
  }

  function next() {
    if (state.phase !== "reveal") return;
    closePopup();
    if (state.idx + 1 < state.levels.length) { resumeClock(); startLevel(state.idx + 1); }
    else finish();
  }

  function finish(timedOut = false) {
    if (state.phase === "end") return;
    const left = state.timer ? timeLeft() : state.remaining;
    stopClock();
    showTime(timedOut ? 0 : left, false);
    state.token++;                         // drop a level that is still loading
    state.phase = "end";
    state.idx = state.levels.length;
    show("screenEnd");
    renderHUD();
    const r = state.results, n = state.levels.length, found = r.filter(Boolean).length;
    const played = r.filter(v => v != null).length;
    $("#endKicker").textContent = timedOut ? "⏰ Time's up!" : "🎉 All 10 levels done!";
    const stars = STARS.filter(k => found >= k).length;
    $$("#stars span").forEach((st, i) => { st.className = i < stars ? "on" : ""; st.style.animationDelay = `${300 + i * 250}ms`; });
    $("#agentRank").textContent = RANKS.find(([k]) => found >= k)[1];
    FX.countUp($("#endTitle"), 0, state.score, 1200, v => `${v} of ${n * POINTS} points`);
    // agent card
    $("#agentId").textContent = `#${String(1000 + Math.floor(Math.random() * 9000))}`;
    $("#acRank").textContent = RANKS.find(([k]) => found >= k)[1];
    $("#acTimeLabel").textContent = timedOut ? "Levels played" : "Time left";
    $("#acTime").textContent = timedOut ? `${played} of ${n}` : clock(left);
    FX.countUp($("#acFound"), 0, found, 1000);
    FX.countUp($("#acPoints"), 0, state.score, 1200);
    $("#acSecrets").textContent = `${found} of ${n}`;
    FX.countUp($("#acAccuracy"), 0, played ? Math.round((100 * found) / played) : 0, 1200, v => `${v}%`);
    if (stars >= 2) setTimeout(() => FX.confetti(innerWidth / 2, innerHeight * 0.3, 160), 900);
    $("#endRank").textContent = `You found ${found} of ${n} secrets` + (timedOut
      ? `. The clock ran out after ${played} of ${n} levels.`
      : `, with ${clock(left)} to spare.`);
    const g = { found: (...lv) => lv.every(l => r[l - 1] === true), count: found, bestStreak: state.bestStreak, timedOut, left };
    $("#achievements").replaceChildren(...ACHIEVEMENTS.map((a, i) => {
      const got = a.test(g);
      return el("li", { class: "ach" + (got ? " got" : ""), style: `--d: ${900 + i * 120}ms`, title: a.how },
        el("span", { class: "ach-icon", "aria-hidden": "true", text: got ? a.icon : "🔒" }),
        el("span", { class: "ach-text" }, el("b", { text: a.name }), el("span", { text: got ? "Unlocked!" : a.how })));
    }));
    $("#resultRow").replaceChildren(...state.levels.map((m, i) => {
      const status = r[i] === true ? ["hit", "Found"] : r[i] === false ? ["miss", "Missed"] : ["skip", "Not reached"];
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
    $("#againBtn").addEventListener("click", () => show("screenTitle"));
    $("#playBtn").addEventListener("click", newGame);
    FX.bitsBackground($("#bitsBg"), 56);
    FX.parallax(document.querySelector(".bg-fx"));
    $$(".frame").forEach(f => FX.tilt(f));
    FX.bounceLetters($("#logo"));
    try {
      state.levels = await loadJSON(`${BASE}levels.json`);
      loadLevel(0);                        // so level 1 is ready when they press Play now
      $("#playBtn").disabled = false;
    } catch (e) { fail(e); }
  }

  boot();
})();
