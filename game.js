/*
 * Spot the Secret: steganography awareness game
 * Developed by Thilina Mendis
 * Date: October 15, 2026
 *
 * game.js: game flow, HUD, scoring, the "under the hood" tools, and the
 * Hiding Lab screen. Expects levels/levels.json and levels/level_XX/ from
 * tools/generate_levels.py.
 */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BASE = "levels/";
  const GOLD = "#FFD23F";

  const state = {
    levels: [], idx: 0, results: [], secretSide: "A",
    cur: null, cache: new Map(),
    magnifier: window.matchMedia("(hover: hover)").matches,
    answered: false, inGame: false, phase: "title",
    score: 0, labReturn: null,
  };

  // ------------------------------------------------------------ loading
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

  function dir(meta) { return `${BASE}level_${String(meta.level).padStart(2, "0")}/`; }

  function loadLevel(i) {
    const meta = state.levels[i];
    if (!meta) return null;
    if (state.cache.has(i)) return state.cache.get(i);
    const d = dir(meta), ext = meta.format;
    const p = (async () => {
      const [cover, stego] = await Promise.all([loadImage(`${d}cover.${ext}`), loadImage(`${d}stego.${ext}`)]);
      const extra = {};
      if (meta.format === "jpg") {
        const jobs = [loadJSON(`${d}dct_changes.json`).then(v => extra.dct = v)];
        if (meta.level >= 8) jobs.push(loadImage(`${d}cost_map.png`).then(v => extra.cost = v));
        await Promise.all(jobs);
      }
      return { meta, cover, stego, extra, w: cover.data.width, h: cover.data.height };
    })();
    state.cache.set(i, p);
    return p;
  }

  // ------------------------------------------------------------ screens + HUD
  function show(id) {
    $$(".screen").forEach(s => s.hidden = s.id !== id);
    $("#hud").hidden = !(state.inGame && id !== "screenTitle");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderHUD() {
    const ol = $("#pips");
    ol.innerHTML = "";
    state.levels.forEach((m, i) => {
      const r = state.results[i];
      const li = document.createElement("li");
      li.className = r === true ? "hit" : r === false ? "miss" : i === state.idx ? "current" : "";
      li.title = `Level ${m.level}` + (r === true ? ": found" : r === false ? ": missed" : "");
      li.textContent = m.level;
      ol.appendChild(li);
    });
    $("#hudScore").textContent = state.score.toLocaleString();
  }

  function difficultyMeter(target, level) {
    target.innerHTML = "";
    const bars = Math.ceil(level / 2);
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement("span");
      if (i <= bars) s.className = "on";
      target.appendChild(s);
    }
    target.setAttribute("aria-label", `Difficulty ${bars} of 5`);
  }

  // ------------------------------------------------------------ play
  function newGame() {
    state.results = []; state.score = 0;
    state.inGame = true;
    startLevel(0);
  }

  async function startLevel(i) {
    state.idx = i; state.answered = false; state.phase = "loading";
    const meta = state.levels[i];
    show("screenPlay");
    $("#reveal").hidden = true;
    $("#levelNum").textContent = `Level ${i + 1} of ${state.levels.length}`;
    $("#levelTitle").textContent = meta.title;
    difficultyMeter($("#difficulty"), meta.level);
    $("#prompt").textContent = "One of these photos hides a secret. Which one?";
    $$(".pane").forEach(p => { p.classList.remove("is-secret", "is-original", "picked"); $(".stamp", p).textContent = ""; });
    $$(".pick").forEach(b => { b.disabled = true; b.hidden = false; });
    renderHUD();

    const loading = loadLevel(i);
    try { state.cur = await loading; }
    catch (e) { return fail(e); }
    loadLevel(i + 1);

    state.secretSide = Math.random() < 0.5 ? "A" : "B";
    paintPanes();
    $$(".pick").forEach(b => b.disabled = false);
    state.phase = "spot";
    $("#levelTitle").focus({ preventScroll: true });
  }

  function sideAsset(side) { return side === state.secretSide ? state.cur.stego : state.cur.cover; }

  function paintPanes() {
    $$(".pane").forEach(p => {
      const c = $(".photo", p), src = sideAsset(p.dataset.side).canvas;
      c.width = src.width; c.height = src.height;
      c.getContext("2d").drawImage(src, 0, 0);
    });
  }

  // Harder levels are worth more.
  function pointsFor(level) { return 100 + 25 * (level - 1); }

  function pick(side) {
    if (state.phase !== "spot" || state.answered) return;
    state.answered = true; state.phase = "reveal";
    hideLoupes();
    const ok = side === state.secretSide;
    const m = state.cur.meta;
    state.results[state.idx] = ok;
    let gained = 0;
    if (ok) { gained = pointsFor(m.level); state.score += gained; }

    $$(".pick").forEach(b => b.hidden = true);
    $$(".pane").forEach(p => {
      const secret = p.dataset.side === state.secretSide;
      p.classList.add(secret ? "is-secret" : "is-original");
      if (p.dataset.side === side) p.classList.add("picked");
      $(".stamp", p).textContent = secret ? "Secret" : "Original";
    });
    $("#prompt").textContent = "";
    const res = $("#result");
    res.className = "result " + (ok ? "ok" : "no");
    $("#resultHead").textContent = ok ? `Correct: +${gained} points` : "Not this time";
    $("#resultSub").textContent = ok
      ? `Photo ${state.secretSide} had the secret. Use the tools below to see how it was hidden.`
      : `The secret was in photo ${state.secretSide}. Use the tools below to see what you missed.`;
    $("#method").textContent = `How it was hidden: ${m.method}`;
    $("#explain").textContent = m.explanation;
    $("#simple").textContent = m.simple ? `In plain words: ${m.simple}` : "";
    $("#nextBtn").textContent = state.idx + 1 < state.levels.length ? "Next level" : "See your results";
    buildTabs();
    $("#reveal").hidden = false;
    renderHUD();
    $("#result").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  // ------------------------------------------------------------ scope (magnifier)
  function setupLoupe() {
    const arena = $("#arena");
    const btn = $("#magnifierBtn");
    const apply = () => {
      btn.setAttribute("aria-pressed", String(state.magnifier));
      btn.textContent = state.magnifier ? "Scope on" : "Scope off";
      arena.classList.toggle("magnify", state.magnifier);
      $("#magHint").textContent = state.magnifier
        ? "Move over a photo to zoom in. Both photos zoom at the same spot. Press A or B to pick."
        : "Turn the scope on to zoom into both photos. Press A or B to pick.";
      if (!state.magnifier) hideLoupes();
    };
    btn.addEventListener("click", () => { state.magnifier = !state.magnifier; apply(); });
    apply();
    $$(".pane .photo").forEach(c => {
      c.addEventListener("pointermove", e => {
        if (!state.magnifier || !state.cur || state.phase === "loading") return;
        const r = c.getBoundingClientRect();
        drawLoupes((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      });
      c.addEventListener("pointerleave", hideLoupes);
      c.addEventListener("pointerup", e => { if (e.pointerType === "touch") hideLoupes(); });
    });
  }

  function drawLoupes(u, v) {
    if (u < 0 || u > 1 || v < 0 || v > 1) return hideLoupes();
    const zoom = 10;
    $$(".pane").forEach(p => {
      const L = $(".loupe", p), frame = $(".frame", p);
      const src = sideAsset(p.dataset.side).canvas;
      const span = L.width / zoom;
      const sx = Math.round(u * src.width - span / 2), sy = Math.round(v * src.height - span / 2);
      const ctx = L.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, L.width, L.height);
      ctx.drawImage(src, sx, sy, span, span, 0, 0, L.width, L.height);
      ctx.strokeStyle = "rgba(255,210,63,0.6)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L.width / 2, L.height / 2 - 18); ctx.lineTo(L.width / 2, L.height / 2 + 18);
      ctx.moveTo(L.width / 2 - 18, L.height / 2); ctx.lineTo(L.width / 2 + 18, L.height / 2); ctx.stroke();
      const fr = frame.getBoundingClientRect();
      const size = L.getBoundingClientRect().width || 180;
      let lx = u * fr.width - size / 2, ly = v * fr.height - size - 18;
      if (ly < 0) ly = v * fr.height + 18;
      lx = Math.max(0, Math.min(fr.width - size, lx));
      L.style.transform = `translate(${lx}px, ${ly}px)`;
      L.classList.add("on");
    });
  }
  function hideLoupes() { $$(".loupe").forEach(l => l.classList.remove("on")); }

  // ------------------------------------------------------------ reveal tools
  const TOOLS = {
    changes: { label: "Changes", build: toolChanges },
    pixels: { label: "Pixel numbers", build: toolPixels },
    planes: { label: "Bit planes", build: toolPlanes },
    decode: { label: "Read the secret", build: toolDecode },
    blocks: { label: "8×8 blocks", build: toolBlocks },
    cost: { label: "Hiding cost", build: toolCost },
  };

  function toolsFor(lv) {
    const t = ["changes", "pixels"];
    if (lv <= 5) t.push("planes");
    if ([3, 4, 5, 6].includes(lv)) t.push("decode");
    if (lv >= 6) t.push("blocks");
    if (lv >= 8) t.push("cost");
    if (lv === 2) t.unshift(t.splice(t.indexOf("planes"), 1)[0]);
    if (lv >= 8) t.unshift(t.splice(t.indexOf("cost"), 1)[0]);
    return t;
  }

  function buildTabs() {
    const tabs = $("#tabs");
    tabs.innerHTML = "";
    const list = toolsFor(state.cur.meta.level);
    list.forEach(key => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.className = "tab";
      b.textContent = TOOLS[key].label; b.dataset.key = key;
      b.setAttribute("aria-selected", "false");
      b.addEventListener("click", () => selectTool(key));
      tabs.appendChild(b);
    });
    selectTool(list[0]);
  }

  function selectTool(key) {
    $$("#tabs .tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.key === key)));
    const tool = $("#tool");
    tool.innerHTML = "";
    TOOLS[key].build(tool, state.cur);
  }

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

  function canvasFor(cur, cls = "photo flat") {
    const c = el("canvas", { class: cls, width: cur.w, height: cur.h });
    return c;
  }

  function segmented(name, options, value, onChange) {
    const wrap = el("div", { class: "seg", role: "radiogroup", "aria-label": name });
    options.forEach(([val, label]) => {
      const b = el("button", { type: "button", role: "radio", "aria-checked": String(val === value), text: label });
      b.addEventListener("click", () => {
        $$("button", wrap).forEach(x => x.setAttribute("aria-checked", "false"));
        b.setAttribute("aria-checked", "true");
        onChange(val);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // Two-column tool layout: the picture on the left, controls and readouts on
  // the right, so selecting and reading the result needs no scrolling.
  function split(root, left, right) {
    root.append(el("div", { class: "tool-split" },
      el("div", { class: "tool-view" }, ...left),
      el("div", { class: "tool-side" }, ...right)));
  }

  // Spotlight: dim everything except a region, with crosshair lines and
  // corner brackets so even an 8-pixel region is easy to find.
  function spotlight(ctx, src, x0, y0, w, h, W, H) {
    ctx.drawImage(src, 0, 0);
    ctx.fillStyle = "rgba(10, 8, 30, 0.62)";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(src, x0, y0, w, h, x0, y0, w, h);
    const cx = x0 + w / 2, cy = y0 + h / 2, pad = 7;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(255, 210, 63, 0.75)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, y0 - pad - 2); ctx.moveTo(cx, y0 + h + pad + 2); ctx.lineTo(cx, H);
    ctx.moveTo(0, cy); ctx.lineTo(x0 - pad - 2, cy); ctx.moveTo(x0 + w + pad + 2, cy); ctx.lineTo(W, cy);
    ctx.stroke();
    ctx.restore();
    const bx = x0 - pad, by = y0 - pad, bw = w + 2 * pad, bh = h + 2 * pad, L = 9;
    const corners = () => {
      ctx.beginPath();
      ctx.moveTo(bx, by + L); ctx.lineTo(bx, by); ctx.lineTo(bx + L, by);
      ctx.moveTo(bx + bw - L, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + L);
      ctx.moveTo(bx + bw, by + bh - L); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - L, by + bh);
      ctx.moveTo(bx + L, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - L);
      ctx.stroke();
    };
    ctx.lineCap = "square";
    ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 5; corners();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; corners();
  }

  function hoverBox(ctx, x0, y0, w, h) {
    ctx.save();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, w + 1, h + 1);
    ctx.restore();
  }

  // Zoomed pixel inset: each pixel drawn as a big square, changed ones outlined.
  function drawInset(canvas, srcData, cmpData, W, x0, y0, n, ch) {
    const cell = canvas.width / n, ctx = canvas.getContext("2d");
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = ((y0 + j) * W + (x0 + i)) * 4;
      ctx.fillStyle = `rgb(${srcData[k]},${srcData[k + 1]},${srcData[k + 2]})`;
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height);
      ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke();
    }
    if (cmpData) {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = ((y0 + j) * W + (x0 + i)) * 4;
        const changed = ch == null
          ? (srcData[k] !== cmpData[k] || srcData[k + 1] !== cmpData[k + 1] || srcData[k + 2] !== cmpData[k + 2])
          : srcData[k + ch] !== cmpData[k + ch];
        if (changed) ctx.strokeRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
      }
    }
  }

  function canvasPoint(c, e, W, H) {
    const r = c.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H)];
  }

  // Changes: amplified difference
  function toolChanges(root, cur) {
    const steps = [1, 2, 5, 10, 25, 50, 100];
    const c = canvasFor(cur);
    const out = new ImageData(cur.w, cur.h);
    const label = el("output", { class: "readout-inline" });
    const note = el("p", { class: "tool-note" });
    const slider = el("input", { type: "range", min: 0, max: steps.length - 1, value: 0, "aria-label": "Amplify the difference" });
    const draw = () => {
      const amp = steps[+slider.value];
      Stego.diffImage(cur.cover.data.data, cur.stego.data.data, amp, out.data);
      c.getContext("2d").putImageData(out, 0, 0);
      label.textContent = `×${amp}`;
      note.textContent = amp === 1
        ? "This is the real difference between the two photos. Black means no change, and at ×1 most changes are too small to see."
        : `Every difference is now ${amp} times brighter. Bright spots show exactly where the secret went.`;
    };
    slider.addEventListener("input", draw);
    split(root, [c], [
      el("div", { class: "controls" }, el("label", { text: "Amplify" }), slider, label),
      note, statLine(cur.meta)]);
    draw();
  }

  function statLine(m) {
    let t = "";
    if (m.pct_pixels_changed != null) t = `${m.pct_pixels_changed}% of pixels changed. The biggest change to any colour value was ${m.max_channel_change} out of 255.`;
    else if (m.changed_coefficients != null) t = `${m.changed_coefficients.toLocaleString()} of the JPEG's frequency numbers changed (${m.pct_coefficients_changed}%), touching ${m.blocks_touched_pct}% of its 8×8 blocks.`;
    return el("p", { class: "tool-stat", text: t });
  }

  // Pixel numbers
  function toolPixels(root, cur) {
    const N = 7, half = 3;
    let ch = 0, px, hover = null;
    const A = cur.cover.data.data, B = cur.stego.data.data, W = cur.w, H = cur.h;
    const c = canvasFor(cur, "photo flat clickable");
    const insetA = el("canvas", { class: "inset", width: 168, height: 168, "aria-label": "Zoomed original pixels" });
    const insetB = el("canvas", { class: "inset", width: 168, height: 168, "aria-label": "Zoomed pixels with the secret" });
    const gridA = el("div", { class: "grid", role: "table", "aria-label": "Original pixel values" });
    const gridB = el("div", { class: "grid", role: "table", "aria-label": "Pixel values with the secret" });
    const note = el("p", { class: "tool-note" });
    px = findChanged(A, B, W, H) || [W >> 1, H >> 1];
    const clampC = p => [Math.min(W - 1 - half, Math.max(half, p[0])), Math.min(H - 1 - half, Math.max(half, p[1]))];
    px = clampC(px);
    const val = (arr, x, y) => arr[(y * W + x) * 4 + ch];
    const cells = () => { const o = []; for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) o.push([px[0] + dx, px[1] + dy]); return o; };

    function fill(grid, arr, mark) {
      grid.innerHTML = "";
      cells().forEach(([x, y]) => {
        const changed = val(A, x, y) !== val(B, x, y);
        grid.appendChild(el("span", { class: "cell" + (changed ? (mark ? " changed" : " was") : ""), role: "cell", text: String(val(arr, x, y)) }));
      });
    }
    const draw = () => {
      const ctx = c.getContext("2d");
      spotlight(ctx, cur.stego.canvas, px[0] - half, px[1] - half, N, N, W, H);
      if (hover) hoverBox(ctx, hover[0] - half, hover[1] - half, N, N);
      drawInset(insetA, A, B, W, px[0] - half, px[1] - half, N, ch);
      drawInset(insetB, B, A, W, px[0] - half, px[1] - half, N, ch);
      fill(gridA, A, false); fill(gridB, B, true);
      const diffs = cells().filter(([x, y]) => val(A, x, y) !== val(B, x, y));
      const f = diffs[0];
      note.textContent = diffs.length
        ? `${diffs.length} of these ${N * N} values changed, each by a tiny amount. Out of 256 shades, nobody can tell ${val(A, f[0], f[1])} and ${val(B, f[0], f[1])} apart.`
        : "None of these values changed. Click somewhere else on the photo, or try another colour.";
    };
    c.addEventListener("click", e => { px = clampC(canvasPoint(c, e, W, H)); draw(); });
    c.addEventListener("pointermove", e => { hover = clampC(canvasPoint(c, e, W, H)); draw(); });
    c.addEventListener("pointerleave", () => { hover = null; draw(); });
    split(root, [c,
      el("p", { class: "tool-stat", text: "Click anywhere on the photo. The bright window is the 7×7 patch you picked; the dashed box shows where you're pointing." })], [
      el("div", { class: "controls" }, el("label", { text: "Colour" }),
        segmented("Colour channel", [[0, "Red"], [1, "Green"], [2, "Blue"]], 0, v => { ch = v; draw(); })),
      el("div", { class: "inspect" },
        el("div", { class: "inspect-col" }, el("p", { class: "grid-label", text: "Original" }), insetA, gridA),
        el("div", { class: "inspect-col" }, el("p", { class: "grid-label", text: "With the secret" }), insetB, gridB)),
      note]);
    draw();
  }

  // Find a 7x7 window with some (not all) changed pixels, away from the edges.
  function findChanged(A, B, W, H) {
    const scan = (y0, y1) => {
      let best = null, bestN = 0;
      for (let y = y0; y < y1; y += 9)
        for (let x = 24; x < W - 24; x += 9) {
          let n = 0;
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            const i = ((y + dy) * W + (x + dx)) * 4;
            if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) n++;
          }
          if (n > bestN && n < 40) { bestN = n; best = [x, y]; }
        }
      return best;
    };
    return scan(Math.floor(H * 0.35), Math.floor(H * 0.75)) || scan(24, H - 24);
  }

  // Bit planes
  function toolPlanes(root, cur) {
    let bit = 0, ch = 0;
    const cA = canvasFor(cur), cB = canvasFor(cur);
    const imA = new ImageData(cur.w, cur.h), imB = new ImageData(cur.w, cur.h);
    const lab = el("output", { class: "readout-inline" });
    const note = el("p", { class: "tool-note" });
    const slider = el("input", { type: "range", min: 0, max: 7, value: 7, "aria-label": "Bit plane" });
    const notes = {
      7: "Bit 7 is the most important bit. On its own it already shows the rough shape of the photo.",
      6: "Bit 6 adds more detail. Changing it would be easy to see.",
      5: "Each lower bit matters half as much as the one above it.",
      4: "By bit 4, the picture is breaking up into texture.",
      3: "Bit 3 is mostly fine grain.",
      2: "Bit 2 looks close to random.",
      1: "Bit 1 is nearly pure static, the camera's natural noise.",
      0: "Bit 0 is the least important bit. It should look like static. If a pattern or a strip appears, something was written here.",
    };
    const draw = () => {
      bit = +slider.value;
      Stego.bitPlane(cur.cover.data.data, bit, ch, imA.data);
      Stego.bitPlane(cur.stego.data.data, bit, ch, imB.data);
      cA.getContext("2d").putImageData(imA, 0, 0);
      cB.getContext("2d").putImageData(imB, 0, 0);
      lab.textContent = `bit ${bit}`;
      note.textContent = notes[bit];
    };
    slider.addEventListener("input", draw);
    split(root, [
      el("div", { class: "plane-pair" },
        el("div", {}, el("p", { class: "grid-label", text: "Original" }), cA),
        el("div", {}, el("p", { class: "grid-label", text: "With the secret" }), cB))], [
      el("div", { class: "controls" }, el("label", { text: "Bit" }), slider, lab),
      el("div", { class: "controls" }, el("label", { text: "Colour" }),
        segmented("Colour channel", [[0, "Red"], [1, "Green"], [2, "Blue"]], 0, v => { ch = v; draw(); })),
      note,
      el("p", { class: "tool-stat", text: "Drag the slider down to bit 0 to see where the secret lives." })]);
    draw();
  }

  // Read the secret
  function typeOut(pre, text) {
    pre.textContent = "";
    if (reduceMotion) { pre.textContent = text; return; }
    let i = 0;
    const id = setInterval(() => {
      i += 3; pre.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(id);
    }, 16);
  }

  function messageView(r, limit = 240) {
    if (!r.valid) return "No message found. The bits read as noise:\n" + r.text.replace(/[^\x20-\x7E]/g, "·").slice(0, 60);
    const more = r.length > limit ? `\n\n…and ${(r.length - limit).toLocaleString()} more characters.` : "";
    return r.text.slice(0, limit) + more;
  }

  function toolDecode(root, cur) {
    const m = cur.meta, lv = m.level;
    const pre = el("pre", { class: "readout", "aria-live": "polite" });
    if (lv === 3) {
      root.append(
        el("p", { class: "tool-note", text: "The first 32 hidden bits give the message length. The bits after that are the letters, 8 bits each." }),
        el("div", { class: "actions" },
          el("button", { class: "btn btn-go btn-small", type: "button", text: "Read the photo with the secret",
            onclick: () => typeOut(pre, messageView(Stego.decodeSequential(cur.stego.data.data, 260))) }),
          el("button", { class: "btn btn-ghost btn-small", type: "button", text: "Read the original",
            onclick: () => typeOut(pre, messageView(Stego.decodeSequential(cur.cover.data.data, 60))) })),
        pre);
    } else if (lv === 4) {
      const key = el("input", { type: "number", value: "", placeholder: "Enter a key", "aria-label": "Secret key", class: "key-input" });
      const hint = el("p", { class: "tool-stat" });
      let tries = 0;
      root.append(
        el("p", { class: "tool-note", text: "This time the bits were scattered. A secret key decides which pixels carry the message, so reading row by row finds nothing." }),
        el("div", { class: "actions" },
          el("button", { class: "btn btn-ghost btn-small", type: "button", text: "Read row by row",
            onclick: () => typeOut(pre, messageView(Stego.decodeSequential(cur.stego.data.data, 60))) }),
          key,
          el("button", { class: "btn btn-go btn-small", type: "button", text: "Read with this key",
            onclick: () => {
              const k = parseInt(key.value, 10);
              if (!Number.isFinite(k)) { hint.textContent = "Type a number as the key first."; return; }
              const r = Stego.decodeKeyed(cur.stego.data.data, k, m.decode.bits, 260);
              typeOut(pre, messageView(r));
              tries++;
              hint.textContent = r.valid ? "That's the right key." : `Wrong key, so the positions are wrong too. The sender used ${m.decode.key}.`;
            } })),
        pre, hint);
    } else if (lv === 5) {
      root.append(
        el("p", { class: "tool-note", text: "A watermark reader looks for a pattern spread across the photo's frequency bands, not in single pixels. The reader in the Python script found this watermark:" }),
        el("pre", { class: "readout", text: m.hidden }),
        el("p", { class: "tool-stat", text: "Watermarks like this are used to label images, for example to mark them as AI-generated." }));
    } else if (lv === 6) {
      root.append(
        el("p", { class: "tool-note", text: "This message is stored in the JPEG's frequency numbers, which the browser never shows us. The Python script read it back from the file:" }),
        el("pre", { class: "readout", text: (m.message || "").replace(/\.\.\.$/, "…") }));
    }
  }

  // 8x8 blocks
  function blockIndex(cur) {
    if (cur.extra.byBlock) return cur.extra.byBlock;
    const map = new Map();
    (cur.extra.dct || []).forEach(d => {
      const k = d.block[0] + "," + d.block[1];
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    });
    cur.extra.byBlock = map;
    return map;
  }

  function toolBlocks(root, cur) {
    const map = blockIndex(cur);
    const W = cur.w, H = cur.h;
    const c = canvasFor(cur, "photo flat clickable");
    const base = document.createElement("canvas"); base.width = W; base.height = H;
    const insetA = el("canvas", { class: "inset", width: 160, height: 160, "aria-label": "Original block pixels" });
    const insetB = el("canvas", { class: "inset", width: 160, height: 160, "aria-label": "Block pixels with the secret" });
    const grid = el("div", { class: "grid dct", role: "table", "aria-label": "Changes in the selected 8 by 8 block" });
    const note = el("p", { class: "tool-note" });
    let sel = null, best = 0, hover = null, overlay = 0.75;
    map.forEach((v, k) => { if (v.length > best) { best = v.length; sel = k.split(",").map(Number); } });
    if (!sel) sel = [0, 0];

    const compose = () => {
      const b = base.getContext("2d");
      b.globalAlpha = 1; b.drawImage(cur.stego.canvas, 0, 0);
      b.fillStyle = `rgba(10, 8, 30, ${0.45 * overlay})`; b.fillRect(0, 0, W, H);
      map.forEach((v, k) => {
        const [r, q] = k.split(",").map(Number);
        b.fillStyle = `rgba(255, 210, 63, ${Math.min(1, 0.35 + v.length / 10) * overlay})`;
        b.fillRect(q * 8, r * 8, 8, 8);
      });
    };
    const draw = () => {
      const ctx = c.getContext("2d");
      spotlight(ctx, base, sel[1] * 8, sel[0] * 8, 8, 8, W, H);
      if (hover) hoverBox(ctx, hover[1] * 8, hover[0] * 8, 8, 8);
      drawInset(insetA, cur.cover.data.data, cur.stego.data.data, W, sel[1] * 8, sel[0] * 8, 8, null);
      drawInset(insetB, cur.stego.data.data, cur.cover.data.data, W, sel[1] * 8, sel[0] * 8, 8, null);
      const list = map.get(sel.join(",")) || [];
      grid.innerHTML = "";
      const at = new Map(list.map(d => [d.coef[0] * 8 + d.coef[1], d]));
      for (let i = 0; i < 64; i++) {
        const d = at.get(i), delta = d ? d.new - d.old : 0;
        grid.appendChild(el("span", {
          class: "cell" + (d ? " changed" : "") + (i === 0 ? " dc" : ""), role: "cell",
          title: d ? `was ${d.old}, now ${d.new}` : i === 0 ? "Average brightness of the block" : "Unchanged",
          text: d ? (delta > 0 ? `+${delta}` : `${delta}`) : "·",
        }));
      }
      note.textContent = list.length
        ? `${list.length} of this block's 64 numbers were nudged by 1. That one nudge spreads a faint change over all 64 pixels of the block, outlined in the zoomed views. Hover a number to see its old and new value.`
        : "Nothing changed in this block. Click one of the yellow blocks instead.";
    };
    const blockAt = e => { const [x, y] = canvasPoint(c, e, W, H); return [Math.min(H / 8 - 1, Math.max(0, Math.floor(y / 8))), Math.min(W / 8 - 1, Math.max(0, Math.floor(x / 8)))]; };
    c.addEventListener("click", e => { sel = blockAt(e); draw(); });
    c.addEventListener("pointermove", e => { hover = blockAt(e); draw(); });
    c.addEventListener("pointerleave", () => { hover = null; draw(); });
    const slider = el("input", { type: "range", min: 0, max: 100, value: 75, "aria-label": "Highlight strength" });
    slider.addEventListener("input", () => { overlay = slider.value / 100; compose(); draw(); });
    split(root, [c,
      el("div", { class: "controls" }, el("label", { text: "Highlight" }), slider),
      el("p", { class: "tool-stat", text: "A JPEG stores each 8×8 block as 64 frequency numbers. Yellow blocks are the ones the secret changed. Click one to open it." })], [
      el("div", { class: "inspect" },
        el("div", { class: "inspect-col" }, el("p", { class: "grid-label", text: "Block pixels, original" }), insetA),
        el("div", { class: "inspect-col" }, el("p", { class: "grid-label", text: "Block pixels, with secret" }), insetB)),
      el("p", { class: "grid-label", text: "Its 64 numbers: what changed" }), grid,
      el("p", { class: "tool-stat", text: "Top-left is the block's average brightness (outlined). Further right and down is finer detail." }),
      note, statLine(cur.meta)]);
    compose(); draw();
  }

  // Cost map
  function toolCost(root, cur) {
    const c = canvasFor(cur);
    let mode = "cost", strength = 0.7;
    const blocks = Array.from(blockIndex(cur).keys()).map(k => k.split(",").map(Number));
    const note = el("p", { class: "tool-note" });
    const draw = () => {
      const ctx = c.getContext("2d");
      ctx.globalAlpha = 1; ctx.drawImage(cur.stego.canvas, 0, 0);
      ctx.globalAlpha = strength; ctx.drawImage(cur.extra.cost.canvas, 0, 0); ctx.globalAlpha = 1;
      if (mode === "both") {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        blocks.forEach(([r, k]) => ctx.fillRect(k * 8 + 2, r * 8 + 2, 4, 4));
      }
      note.textContent = mode === "cost"
        ? "Red areas are busy textures where a change is cheap and hard to notice. Blue areas are smooth, where a change would stand out. The hiding method gives every spot a cost like this."
        : "White dots mark the blocks that actually changed. They land almost entirely in the red, cheap areas, and the smooth blue areas stay clean.";
    };
    const slider = el("input", { type: "range", min: 0, max: 100, value: 70, "aria-label": "Map strength" });
    slider.addEventListener("input", () => { strength = slider.value / 100; draw(); });
    split(root, [c], [
      el("div", { class: "controls" }, el("label", { text: "Show" }),
        segmented("Map mode", [["cost", "Hiding cost"], ["both", "Cost and real changes"]], "cost", v => { mode = v; draw(); })),
      el("div", { class: "controls" }, el("label", { text: "Strength" }), slider),
      el("div", { class: "legend" }, el("span", { class: "sw blue" }), "Smooth: changes would show",
        el("span", { class: "sw red" }), "Busy texture: cheap to hide in"),
      note]);
    draw();
  }

  // ------------------------------------------------------------ end
  const RANKS = [[10, "Master detective"], [8, "Senior agent"], [6, "Field agent"], [4, "Junior agent"], [0, "Rookie"]];

  function finish() {
    state.phase = "end";
    show("screenEnd");
    renderHUD();
    const r = state.results, n = state.levels.length;
    const found = r.filter(Boolean).length;
    const easy = r.slice(0, 5).filter(Boolean).length, hard = r.slice(5).filter(Boolean).length;
    let streak = 0; while (streak < n && r[streak]) streak++;
    $("#endTitle").textContent = `${state.score.toLocaleString()} points`;
    $("#endRank").textContent = `Rank: ${RANKS.find(([k]) => found >= k)[1]}. You found ${found} of ${n} secrets.`;
    const row = $("#resultRow"); row.innerHTML = "";
    state.levels.forEach((m, i) => row.appendChild(el("li", { class: r[i] ? "hit" : "miss" },
      el("span", { class: "rn", text: String(m.level) }), el("span", { class: "rt", text: m.title }),
      el("span", { class: "rs", text: r[i] ? "Found" : "Missed" }))));
    $("#endText").textContent =
      (streak === n ? "You caught every single one. " : streak > 0 ? `Your eyes kept up through level ${streak}. ` : "The very first one got past you. ") +
      `You found ${easy} of 5 in the pixel levels and ${hard} of 5 in the JPEG levels. ` +
      "Picking at random gets about half right, so from level 6 on, most players are mostly guessing.";
    $("#endNote").textContent =
      "Detection software keeps going where eyes stop. Trained steganalysis models catch levels 6 to 9 far better than chance by spotting statistical patterns across thousands of pixels. Level 10 sits close to their limit too.";
  }

  // ------------------------------------------------------------ Hiding Lab
  const lab = { ch: 0, step: 0 };

  function openLab(levelIdx, fromGame) {
    state.labReturn = fromGame ? "screenPlay" : (state.phase === "end" ? "screenEnd" : "screenTitle");
    lab.ch = Math.max(0, Math.min(Lab.CHAPTERS.length - 1, levelIdx || 0));
    lab.step = 0;
    $("#labBack").textContent = fromGame ? `Back to level ${state.idx + 1}` : "Back";
    show("screenLab");
    renderLabNav(); renderLabCard();
  }

  function renderLabNav() {
    const nav = $("#labNav"); nav.innerHTML = "";
    Lab.CHAPTERS.forEach((c, i) => {
      const b = el("button", { type: "button", class: "lab-item", "aria-current": String(i === lab.ch) },
        el("span", { class: "lab-n", text: String(c.level) }),
        el("span", { class: "lab-t" }, el("b", { text: c.name }), el("span", { text: c.method })));
      b.addEventListener("click", () => { lab.ch = i; lab.step = 0; renderLabNav(); renderLabCard(); });
      nav.appendChild(b);
    });
  }

  function renderLabCard() {
    const ch = Lab.CHAPTERS[lab.ch], st = ch.steps[lab.step];
    const card = $("#labCard");
    if (card._vis && card._vis._stop) card._vis._stop();
    card.innerHTML = "";
    const dots = el("div", { class: "lab-dots", "aria-hidden": "true" });
    ch.steps.forEach((_, i) => dots.appendChild(el("span", { class: i === lab.step ? "on" : i < lab.step ? "done" : "" })));
    const vis = Lab.renderVisual(ch, st, BASE, reduceMotion);
    card._vis = vis;
    const prev = el("button", { class: "btn btn-ghost btn-small", type: "button", text: "Previous step" });
    const next = el("button", { class: "btn btn-go btn-small", type: "button",
      text: lab.step + 1 < ch.steps.length ? "Next step" : lab.ch + 1 < Lab.CHAPTERS.length ? `Next method: ${Lab.CHAPTERS[lab.ch + 1].name}` : "Done" });
    prev.disabled = lab.step === 0;
    prev.addEventListener("click", () => { lab.step--; renderLabCard(); });
    next.addEventListener("click", () => {
      if (lab.step + 1 < ch.steps.length) lab.step++;
      else if (lab.ch + 1 < Lab.CHAPTERS.length) { lab.ch++; lab.step = 0; renderLabNav(); }
      else return labBack();
      renderLabCard();
    });
    card.append(
      el("p", { class: "lab-kicker", text: `Level ${ch.level}: ${ch.method}` }),
      dots,
      el("h3", { class: "lab-step-title", text: `Step ${lab.step + 1}. ${st.t}` }),
      el("p", { class: "lab-step-text", text: st.d }),
      el("div", { class: "lab-visual" }, vis),
      el("div", { class: "actions lab-actions" }, prev, next));
  }

  function labBack() {
    const to = state.labReturn || "screenTitle";
    show(to);
    if (to === "screenPlay") $("#reveal").scrollIntoView({ block: "start" });
  }

  /* ------------------------------------------------------------ hider (disabled)
     "Hide your own message" is switched off for now. The original code is kept
     here, commented out, so it can be restored together with its HTML section.

       // ------------------------------------------------------------ hider
       const hider = { idx: 0, img: null, out: null, bits: 0, key: 0, mode: "seq" };

       async function openHider() {
         show("screenHider"); renderProgress();
         const thumbs = $("#thumbs");
         if (!thumbs.childElementCount) {
           state.levels.filter(m => m.format === "png").forEach((m, i) => {
             const b = el("button", { class: "thumb", type: "button", "aria-pressed": String(i === 0), "aria-label": `Photo ${i + 1}` },
               el("img", { src: `${dir(m)}cover.png`, alt: "" }));
             b.addEventListener("click", () => {
               $$(".thumb").forEach(t => t.setAttribute("aria-pressed", "false"));
               b.setAttribute("aria-pressed", "true"); hider.idx = i;
             });
             thumbs.appendChild(b);
           });
         }
       }

       async function doHide() {
         const status = $("#hStatus");
         const metas = state.levels.filter(m => m.format === "png");
         const m = metas[hider.idx];
         const text = $("#secretText").value;
         if (!text.trim()) { status.textContent = "Write a message first."; return; }
         hider.mode = $("input[name=hmethod]:checked").value;
         hider.key = parseInt($("#hKey").value, 10) || 1;
         try {
           status.textContent = "Hiding…";
           const img = await loadImage(`${dir(m)}cover.png`);
           const res = hider.mode === "seq"
             ? Stego.embedSequential(img.data.data, text)
             : Stego.embedKeyed(img.data.data, text, hider.key);
           hider.bits = res.bits;
           const out = new ImageData(res.data, img.data.width, img.data.height);
           hider.out = out;
           const c = $("#hOut"); c.width = out.width; c.height = out.height;
           c.getContext("2d").putImageData(out, 0, 0);
           const p = $("#hPlane"); p.width = out.width; p.height = out.height;
           p.getContext("2d").putImageData(new ImageData(Stego.bitPlane(out.data, 0, 0, new Uint8ClampedArray(out.data.length)), out.width, out.height), 0, 0);
           c.toBlob(b => { $("#hDownload").href = URL.createObjectURL(b); }, "image/png");
           $("#hResult").hidden = false; $("#hReadout").textContent = "";
           const pct = (100 * res.bits / ((out.data.length / 4) * 3)).toFixed(2);
           status.textContent = `Hidden. Your message used ${res.bits.toLocaleString()} bits, ${pct}% of the photo's capacity.` +
             (hider.mode === "key" ? ` Your partner needs key ${hider.key} to read it.` : "");
         } catch (e) { status.textContent = e.message; }
       }

       function doRead() {
         if (!hider.out) return;
         const r = hider.mode === "seq"
           ? Stego.decodeSequential(hider.out.data, 2000)
           : Stego.decodeKeyed(hider.out.data, hider.key, hider.bits, 2000);
         typeOut($("#hReadout"), messageView(r, 2000));
       }

  ------------------------------------------------------------------------- */

  // ------------------------------------------------------------ boot
  function fail(e) {
    const msg = location.protocol === "file:"
      ? "The game has to run from a web server, because browsers block reading pixel data from files opened directly. In this folder run: python -m http.server 8000, then open http://localhost:8000"
      : `Something went wrong while loading: ${e.message}`;
    state.inGame = false;
    show("screenTitle");
    $("#loadStatus").textContent = msg;
  }

  function goHome() { state.inGame = false; state.phase = "title"; show("screenTitle"); }

  async function boot() {
    $("#startBtn").addEventListener("click", newGame);
    $("#againBtn").addEventListener("click", newGame);
    $("#nextBtn").addEventListener("click", () => state.idx + 1 < state.levels.length ? startLevel(state.idx + 1) : finish());
    $$(".pick").forEach(b => b.addEventListener("click", () => pick(b.dataset.pick)));
    $("#homeBtn").addEventListener("click", goHome);
    $("#labBtn").addEventListener("click", () => openLab(0, false));
    $("#labBtn2").addEventListener("click", () => openLab(0, false));
    $("#toLabBtn").addEventListener("click", () => openLab(state.idx, true));
    $("#labBack").addEventListener("click", labBack);
    window.addEventListener("keydown", e => {
      if (e.target.closest && e.target.closest("input, textarea")) return;
      if ($("#screenPlay").hidden) return;
      const k = e.key.toLowerCase();
      if (state.phase === "spot" && (k === "a" || k === "b")) { e.preventDefault(); pick(k.toUpperCase()); }
    });
    setupLoupe();
    $("#startBtn").disabled = true;
    try {
      state.levels = await loadJSON(`${BASE}levels.json`);
      $("#startBtn").disabled = false;
      loadLevel(0);
    } catch (e) { fail(e); }
  }

  boot();
})();
