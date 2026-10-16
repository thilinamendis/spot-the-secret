/*
 * Spot the Secret: Investigation mode
 * Developed by Thilina Mendis
 * Date: October 16, 2026
 *
 * investigate.js: a forensic workbench. Students choose which photo to
 * examine (A or B), run tools on it, switch photos with the tool settings
 * kept, and collect readings in an evidence log. No tool ever uses the
 * answer. JPEG-coefficient and watermark readings come from
 * levels/investigate.json (made by tools/investigate_data.py) for both photos.
 */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BASE = "levels/";
  const GOLD = "#FFD23F", CYAN = "#5CC8E6";

  const state = {
    levels: [], readings: {}, idx: 0, results: [], score: 0,
    secretSide: "A", cur: null, cache: new Map(), phase: "title", inGame: false, caseToken: 0,
    sel: "A",          // the photo being examined
    tool: null,        // the active tool
    ts: {},            // per-tool settings, kept when switching photos
    log: {},           // evidence log: log[tool] = { label, A, B }
  };

  const CASES = {
    1: { note: "A tipster says white text was blended into one photo at very low strength.",
         tools: ["look", "compare", "pixels"],
         evidence: "Where the photos differ, the secret copy is brighter, because white text was blended into it." },
    2: { note: "The suspect's notes mention 'the lowest bit of every pixel'.",
         tools: ["look", "compare", "planes", "pixels"],
         evidence: "Bit 0 of the secret copy shows a picture instead of random static." },
    3: { note: "This sender always writes from the top-left, row by row, into the last bits.",
         tools: ["look", "compare", "planes", "decode", "pixels"],
         evidence: "Reading the last bits row by row gives a readable message in one copy only." },
    4: { note: "Intercepted on a sticky note: “key 2026”. The sender scatters bits using a key.",
         tools: ["look", "compare", "decode", "noise", "planes", "pixels"],
         evidence: "Reading with key 2026 gives a readable message in one copy only. The noise meter leans the same way, but only slightly." },
    5: { note: "This may be an invisible watermark in the standard DWT-DCT format. The lab has a reader for it.",
         tools: ["look", "compare", "watermark", "noise", "pixels"],
         evidence: "The watermark reader finds “AUBURN” in one copy only." },
    6: { note: "JSteg was found on the suspect's laptop. It hides bits inside the JPEG's numbers.",
         tools: ["look", "compare", "jsteg", "calibration", "noise"],
         evidence: "The JSteg extractor reads a message from one copy, and calibration estimates far more changed numbers in it." },
    7: { note: "Suspected tool: nsF5. It only ever shrinks JPEG numbers toward zero, so it creates extra zeros.",
         tools: ["look", "compare", "calibration", "zeros"],
         evidence: "The secret copy has fewer non-zero numbers, because nsF5 shrinks some of them to zero, and calibration estimates more changes in it." },
    8: { note: "An adaptive tool is suspected. It adds or subtracts 1 from JPEG numbers in busy areas. Expect weak evidence: hidden data adds a little noise and turns a few zeros into ±1.",
         tools: ["look", "compare", "noise", "zeros"],
         evidence: "Weak but consistent clues: the secret copy is slightly noisier and has slightly more non-zero numbers. Real investigators use trained AI detectors for cases like this." },
    9: { note: "The most advanced adaptive tool is suspected. Expect very weak evidence: a little extra noise and a few more non-zero numbers.",
         tools: ["look", "compare", "noise", "zeros"],
         evidence: "Very weak clues: the secret copy is slightly noisier and has a few more non-zero numbers. Trained AI detectors are needed for confidence." },
    10: { note: "Same advanced tool, but with a tiny message. The evidence may be too weak to call.",
          tools: ["look", "compare", "noise", "zeros"],
          evidence: "No reliable clue. The differences are below what these tools can measure, so this one really is a coin toss without a trained detector. That is the point: small messages hidden adaptively are very hard to catch." },
  };

  // ---------------------------------------------------------------- loading
  async function loadImage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`);
    const blob = await res.blob();
    let bmp;
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
  const dir = m => `${BASE}level_${String(m.level).padStart(2, "0")}/`;
  function loadLevel(i) {
    const meta = state.levels[i];
    if (!meta) return null;
    if (state.cache.has(i)) return state.cache.get(i);
    const p = Promise.all([loadImage(`${dir(meta)}cover.${meta.format}`), loadImage(`${dir(meta)}stego.${meta.format}`)])
      .then(([cover, stego]) => ({ meta, cover, stego, w: cover.data.width, h: cover.data.height, memo: {} }));
    state.cache.set(i, p);
    return p;
  }

  // The photos as the student sees them. Tools only ever use these.
  const img = side => side === state.secretSide ? state.cur.stego : state.cur.cover;
  const other = side => side === "A" ? "B" : "A";
  const reading = side => {
    const r = state.readings[String(state.cur.meta.level)] || {};
    return (side === state.secretSide ? r.stego : r.cover) || {};
  };

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
  const tag = s => el("span", { class: "side-tag" + (s === state.sel ? " on" : ""), text: s });
  const note = text => el("p", { class: "tool-note", text });
  const stat = text => el("p", { class: "tool-stat", text });
  const finding = (text, strength) => el("p", { class: "finding " + strength, text });
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
  function viewCanvas(cls = "") {
    const c = el("canvas", { class: "view-canvas " + cls, width: state.cur.w, height: state.cur.h });
    $("#view").replaceChildren(c);
    return c;
  }
  const canvasPoint = (c, e) => { const r = c.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * c.width), Math.floor((e.clientY - r.top) / r.height * c.height)]; };
  function meter(vals, fmt) {
    const max = Math.max(...Object.values(vals).filter(v => v != null)) || 1;
    return el("div", { class: "meter" }, ...["A", "B"].map(s => {
      const v = vals[s];
      const fill = el("div", { class: "meter-fill" + (s === state.sel ? " on" : "") });
      fill.style.width = v == null ? "0" : (100 * v / max) + "%";
      return el("div", { class: "meter-row" }, tag(s), el("div", { class: "meter-track" }, fill),
        el("span", { class: "meter-v", text: v == null ? "not run" : fmt(v) }));
    }));
  }

  // ---------------------------------------------------------------- evidence log
  function logResult(tool, side, text, label = TOOLS[tool].label) {
    if (!state.log[tool]) state.log[tool] = { label, A: null, B: null };
    state.log[tool][side] = text;
    renderLog();
  }
  function renderLog() {
    const body = $("#evBody");
    const rows = Object.values(state.log);
    if (!rows.length) {
      body.replaceChildren(el("tr", { class: "ev-empty" }, el("td", { colspan: "3", text: "Run a reading tool on each photo and the results appear here." })));
      return;
    }
    body.replaceChildren(...rows.map(r => el("tr", {},
      el("th", { scope: "row", text: r.label }),
      el("td", { class: r.A ? "" : "ev-todo", text: r.A || "not run yet" }),
      el("td", { class: r.B ? "" : "ev-todo", text: r.B || "not run yet" }))));
  }

  // Which pixels differ between A and B (says where, never which).
  function differMask() {
    const m = state.cur.memo;
    if (m.mask) return m;
    const a = img("A").data.data, b = img("B").data.data, W = state.cur.w, H = state.cur.h;
    const px = new Uint8Array(W * H);
    let n = 0, lumA = 0, lumB = 0;
    for (let i = 0, p = 0; i < a.length; i += 4, p++) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
        px[p] = 1; n++;
        lumA += 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
        lumB += 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
      }
    }
    const BW = W >> 3, BH = H >> 3, blocks = new Uint8Array(BW * BH);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y * W + x]) blocks[(y >> 3) * BW + (x >> 3)] = 1;
    Object.assign(m, { mask: px, blocks, n, lum: { A: n ? lumA / n : 0, B: n ? lumB / n : 0 } });
    return m;
  }

  // ---------------------------------------------------------------- tools
  // Each tool draws its picture of the examined photo into #view and its
  // controls and readings into #panel. Settings live in state.ts[tool].
  const TOOLS = {
    look: { label: "Magnifier", build: toolLook },
    compare: { label: "Compare A and B", build: toolCompare },
    pixels: { label: "Pixel numbers", build: toolPixels },
    planes: { label: "Bit planes", build: toolPlanes },
    decode: { label: "Message reader", build: toolDecode },
    noise: { label: "Noise meter", build: toolNoise },
    watermark: { label: "Watermark reader", build: toolWatermark },
    jsteg: { label: "JSteg extractor", build: toolJsteg },
    calibration: { label: "Calibration test", build: toolCalibration },
    zeros: { label: "Zero counter", build: toolZeros },
  };
  const ts = (tool, defaults) => (state.ts[tool] = state.ts[tool] || { ...defaults });

  function toolLook(panel) {
    const t = ts("look", { zoom: 8 });
    const c = viewCanvas("zoomable");
    const ctx = c.getContext("2d");
    let at = null;
    const draw = () => {
      ctx.drawImage(img(state.sel).canvas, 0, 0);
      if (!at) return;
      const R = 70, span = (2 * R) / t.zoom;
      ctx.save();
      ctx.beginPath(); ctx.arc(at[0], at[1], R, 0, Math.PI * 2); ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img(state.sel).canvas, at[0] - span / 2, at[1] - span / 2, span, span, at[0] - R, at[1] - R, 2 * R, 2 * R);
      ctx.restore();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(at[0], at[1], R, 0, Math.PI * 2); ctx.stroke();
    };
    c.addEventListener("pointermove", e => { at = canvasPoint(c, e); t.at = at; draw(); });
    c.addEventListener("pointerleave", () => { at = null; draw(); });
    if (t.at) at = t.at;
    const z = el("input", { type: "range", min: 2, max: 16, value: t.zoom, "aria-label": "Zoom" });
    const zl = el("output", { class: "readout-inline", text: `×${t.zoom}` });
    z.addEventListener("input", () => { t.zoom = +z.value; zl.textContent = `×${t.zoom}`; draw(); });
    panel.append(
      el("div", { class: "controls" }, el("label", { text: "Zoom" }), z, zl),
      note("Move over the photo to look closely. Keep the pointer still and press A or B: the lens stays in place, so you can flip between the photos at exactly the same spot."),
      stat("Most hiding methods change values by only 1 out of 255, so expect to see nothing here. That's why the other tools exist."));
    draw();
  }

  function toolCompare(panel) {
    const t = ts("compare", { amp: 2 });
    const cur = state.cur, m = differMask();
    const c = viewCanvas();
    const out = new ImageData(cur.w, cur.h);
    const steps = [1, 5, 25, 100];
    const slider = el("input", { type: "range", min: 0, max: steps.length - 1, step: 1, value: t.amp, "aria-label": "Amplify" });
    const lab = el("output", { class: "readout-inline" });
    // one clickable mark per level under the slider
    const ticks = el("div", { class: "ticks", style: `--n: ${steps.length - 1}` }, ...steps.map((v, i) =>
      el("button", { type: "button", class: "tick", style: `--i: ${i}`, text: `×${v}`, "aria-label": `Amplify ×${v}`,
        onclick: () => { slider.value = i; t.amp = i; draw(); } })));
    const draw = () => {
      Stego.diffImage(img("A").data.data, img("B").data.data, steps[t.amp], out.data);
      c.getContext("2d").putImageData(out, 0, 0);
      lab.textContent = `×${steps[t.amp]}`;
      slider.setAttribute("aria-valuetext", `×${steps[t.amp]}, level ${t.amp + 1} of ${steps.length}`);
      Array.from(ticks.children).forEach((b, i) => b.classList.toggle("on", i === t.amp));
    };
    slider.addEventListener("input", () => { t.amp = +slider.value; draw(); });
    const pct = 100 * m.n / (cur.w * cur.h);
    logResult("compare", "A", `Differing pixels avg. brightness ${m.lum.A.toFixed(1)}`);
    logResult("compare", "B", `Differing pixels avg. brightness ${m.lum.B.toFixed(1)}`);
    $("#viewTitle").replaceChildren("Comparing ", el("b", { text: "A and B" }), ": bright spots are where they differ");
    panel.append(
      el("div", { class: "controls" }, el("label", { text: "Amplify" }),
        el("div", { class: "stepped" }, slider, ticks), lab),
      stat(`${steps.length} levels: each one makes the differences brighter.`),
      note(`The photos differ in ${pct.toFixed(pct < 1 ? 2 : 1)}% of pixels. This shows where, not which photo was changed: the difference looks the same from either side.`),
      note("Average brightness of the differing pixels in each photo:"),
      meter(m.lum, v => v.toFixed(1)),
      stat("Use this to know where to look, then examine each photo with the other tools."));
    draw();
  }

  // dimmed photo with a bright window, crosshair lines and corner brackets
  function spotlight(ctx, src, x0, y0, w, h, W, H) {
    ctx.drawImage(src, 0, 0);
    ctx.fillStyle = "rgba(10, 8, 30, 0.62)"; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(src, x0, y0, w, h, x0, y0, w, h);
    const cx = x0 + w / 2, cy = y0 + h / 2, pad = 7;
    ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255, 210, 63, 0.75)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, y0 - pad - 2); ctx.moveTo(cx, y0 + h + pad + 2); ctx.lineTo(cx, H);
    ctx.moveTo(0, cy); ctx.lineTo(x0 - pad - 2, cy); ctx.moveTo(x0 + w + pad + 2, cy); ctx.lineTo(W, cy);
    ctx.stroke(); ctx.restore();
    const bx = x0 - pad, by = y0 - pad, bw = w + 2 * pad, bh = h + 2 * pad, L = 9;
    const corners = () => { ctx.beginPath();
      ctx.moveTo(bx, by + L); ctx.lineTo(bx, by); ctx.lineTo(bx + L, by);
      ctx.moveTo(bx + bw - L, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + L);
      ctx.moveTo(bx + bw, by + bh - L); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - L, by + bh);
      ctx.moveTo(bx + L, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - L); ctx.stroke(); };
    ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 5; corners();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; corners();
  }

  function toolPixels(panel) {
    const cur = state.cur, W = cur.w, H = cur.h, N = 7, half = 3;
    const m = differMask();
    const clampC = p => [Math.min(W - 1 - half, Math.max(half, p[0])), Math.min(H - 1 - half, Math.max(half, p[1]))];
    const t = ts("pixels", { ch: 0, px: null });
    if (!t.px) {
      // start where the photos differ, so there is something to compare
      let found = null;
      for (let y = Math.floor(H * 0.3); y < H - 8 && !found; y += 5)
        for (let x = 24; x < W - 24; x += 5) if (img("A").data.data[(y * W + x) * 4] !== img("B").data.data[(y * W + x) * 4]) { found = [x, y]; break; }
      if (!found) for (let i = 0; i < m.mask.length; i++) if (m.mask[i]) { found = [i % W, Math.floor(i / W)]; break; }
      t.px = clampC(found || [W >> 1, H >> 1]);
    }
    const c = viewCanvas("clickable");
    let hover = null;
    const grids = { A: el("div", { class: "grid" }), B: el("div", { class: "grid" }), D: el("div", { class: "grid diff" }) };
    const msg = note("");
    const val = (side, x, y) => img(side).data.data[(y * W + x) * 4 + t.ch];
    const draw = () => {
      const ctx = c.getContext("2d");
      spotlight(ctx, img(state.sel).canvas, t.px[0] - half, t.px[1] - half, N, N, W, H);
      if (hover) { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.strokeRect(hover[0] - half - 0.5, hover[1] - half - 0.5, N + 1, N + 1); ctx.restore(); }
      let up = 0, down = 0;
      for (const k of ["A", "B", "D"]) grids[k].replaceChildren();
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        const x = t.px[0] + dx, y = t.px[1] + dy, a = val("A", x, y), b = val("B", x, y), d = b - a;
        const cls = d ? " differ" : "";
        grids.A.appendChild(el("span", { class: "cell" + cls, text: String(a) }));
        grids.B.appendChild(el("span", { class: "cell" + cls, text: String(b) }));
        grids.D.appendChild(el("span", { class: "cell" + (d ? " delta" : " zero"), text: d > 0 ? `+${d}` : d < 0 ? String(d) : "0" }));
        if (d > 0) up++; if (d < 0) down++;
      }
      msg.textContent = up + down
        ? `${up + down} of 49 values differ (blue). B is higher in ${up} of them and lower in ${down}. Changes that always go one way are a clue; random +1 and −1 are typical of hidden bits.`
        : "A and B are identical here. Try another spot: the Compare tool shows where they differ.";
    };
    c.addEventListener("click", e => { t.px = clampC(canvasPoint(c, e)); draw(); });
    c.addEventListener("pointermove", e => { hover = clampC(canvasPoint(c, e)); draw(); });
    c.addEventListener("pointerleave", () => { hover = null; draw(); });
    const col = (title, g, on) => el("div", { class: "grid-col" + (on ? " on" : "") }, el("p", { class: "grid-label", text: title }), g);
    panel.append(
      el("div", { class: "controls" }, el("label", { text: "Colour" }),
        segmented("Colour channel", [[0, "Red"], [1, "Green"], [2, "Blue"]], t.ch, v => { t.ch = v; draw(); })),
      note("Click the photo to pick a 7×7 patch. You'll see the same patch's numbers in both photos and the difference between them."),
      el("div", { class: "grid-trio" },
        col("Photo A", grids.A, state.sel === "A"), col("Photo B", grids.B, state.sel === "B"), col("B − A", grids.D, false)),
      msg);
    draw();
  }

  function toolPlanes(panel) {
    const t = ts("planes", { bit: 7, ch: 0 });
    const cur = state.cur;
    const c = viewCanvas();
    const im = new ImageData(cur.w, cur.h);
    const slider = el("input", { type: "range", min: 0, max: 7, value: t.bit, "aria-label": "Bit plane" });
    const lab = el("output", { class: "readout-inline" });
    const msg = note("");
    const draw = () => {
      Stego.bitPlane(img(state.sel).data.data, t.bit, t.ch, im.data);
      c.getContext("2d").putImageData(im, 0, 0);
      lab.textContent = `bit ${t.bit}`;
      $("#viewTitle").replaceChildren("Examining ", el("b", { text: `Photo ${state.sel}` }), `: bit ${t.bit} of the ${["red", "green", "blue"][t.ch]} values`);
      msg.textContent = t.bit === 0
        ? "Bit 0 of a normal photo looks like random static. A shape, text, or a strip that looks different from the rest means something was written there. Now switch photos and compare."
        : `Bit ${t.bit} is worth ${1 << t.bit} out of 255. Higher bits still show the photo; drag down toward bit 0.`;
    };
    slider.addEventListener("input", () => { t.bit = +slider.value; draw(); });
    panel.append(
      el("div", { class: "controls" }, el("label", { text: "Bit" }), slider, lab),
      el("div", { class: "controls" }, el("label", { text: "Colour" }),
        segmented("Colour channel", [[0, "Red"], [1, "Green"], [2, "Blue"]], t.ch, v => { t.ch = v; draw(); })),
      msg);
    draw();
  }

  function plainView(caption) {
    const c = viewCanvas();
    c.getContext("2d").drawImage(img(state.sel).canvas, 0, 0);
    $("#viewTitle").replaceChildren("Examining ", el("b", { text: `Photo ${state.sel}` }), caption ? `: ${caption}` : "");
    return c;
  }
  function readout(text, ok) { return el("pre", { class: "readout small" + (ok ? "" : " dim"), text }); }
  // A random length header can pass as valid now and then, so also ask for mostly printable text.
  const readable = r => r.valid && (r.text.match(/[\x20-\x7E\n]/g) || []).length >= 0.9 * r.text.length;
  function msgView(r) {
    if (!readable(r)) return "No message. The bits read as noise:\n" + r.text.replace(/[^\x20-\x7E]/g, "·").slice(0, 48);
    return r.text.slice(0, 200) + (r.length > 200 ? `… (${r.length.toLocaleString()} characters)` : "");
  }

  function toolDecode(panel) {
    const t = ts("decode", { key: "" });
    plainView("reading its last bits");
    const out = el("div", {});
    const key = el("input", { type: "number", placeholder: "Key", "aria-label": "Key", class: "key-input", value: t.key });
    key.addEventListener("input", () => { t.key = key.value; });
    const run = mode => {
      const side = state.sel, d = img(side).data.data;
      let r, how;
      if (mode === "seq") { r = Stego.decodeSequential(d, 220); how = "row by row"; }
      else {
        const k = parseInt(key.value, 10);
        if (!Number.isFinite(k)) { out.replaceChildren(finding("Type a key number first.", "none")); return; }
        r = Stego.decodeKeyed(d, k, null, 220); how = `key ${k}`;
      }
      out.replaceChildren(el("p", { class: "grid-label", text: `Photo ${side}, read ${how}:` }), readout(msgView(r), readable(r)));
      // row-by-row and keyed reads get their own rows, so one doesn't overwrite the other
      logResult(`decode-${mode}`, side, readable(r) ? `Readable message (${how})` : `Noise only (${how})`,
        mode === "seq" ? "Message reader, row by row" : "Message reader, with key");
    };
    panel.append(
      note("The reader takes the last bit of every colour value, treats the first 32 bits as the message length, and turns the rest into letters. Only a photo with a real hidden message gives readable text."),
      el("div", { class: "actions" },
        el("button", { class: "btn btn-go btn-small", type: "button", text: "Read row by row", onclick: () => run("seq") }),
        key,
        el("button", { class: "btn btn-ghost btn-small", type: "button", text: "Read with this key", onclick: () => run("key") })),
      out,
      stat("Run it on this photo, then switch to the other photo and run it again."));
  }

  // fine-grained noise (KV filter) in the 8x8 blocks where A and B differ
  function noiseEnergy(data, m, W, H) {
    const K = [[-1, 2, -2, 2, -1], [2, -6, 8, -6, 2], [-2, 8, -12, 8, -2], [2, -6, 8, -6, 2], [-1, 2, -2, 2, -1]];
    const BW = W >> 3;
    let sum = 0, cnt = 0;
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      if (!m.blocks[(y >> 3) * BW + (x >> 3)]) continue;
      for (let ch = 0; ch < 3; ch++) {
        let r = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) r += K[j + 2][i + 2] * data[((y + j) * W + (x + i)) * 4 + ch];
        r /= 12; sum += r * r; cnt++;
      }
    }
    return cnt ? sum / cnt : 0;
  }
  function toolNoise(panel) {
    const cur = state.cur, m = differMask(), memo = cur.memo;
    memo.noise = memo.noise || {};
    const c = plainView("noise is measured inside the tinted blocks");
    const ctx = c.getContext("2d"), BW = cur.w >> 3;
    ctx.fillStyle = "rgba(92, 200, 230, 0.35)";
    for (let i = 0; i < m.blocks.length; i++) if (m.blocks[i]) ctx.fillRect((i % BW) * 8, Math.floor(i / BW) * 8, 8, 8);
    const box = el("div", {});
    const render = () => {
      const v = memo.noise;
      const parts = [meter({ A: v.A, B: v.B }, x => x.toFixed(2))];
      if (v.A != null && v.B != null) {
        const rel = Math.abs(v.A - v.B) / Math.min(v.A, v.B) * 100, hi = v.A > v.B ? "A" : "B";
        parts.push(rel < 0.3 ? finding(`Too close to call: only ${rel.toFixed(2)}% apart.`, "none")
          : rel < 3 ? finding(`Photo ${hi} is slightly noisier, by ${rel.toFixed(1)}%. Weak evidence.`, "weak")
          : finding(`Photo ${hi} is clearly noisier, by ${rel.toFixed(0)}%.`, "strong"));
      } else parts.push(stat(`Now switch to photo ${other(state.sel)} and measure it too.`));
      box.replaceChildren(...parts);
    };
    const measure = () => {
      const s = state.sel;
      if (memo.noise[s] == null) memo.noise[s] = noiseEnergy(img(s).data.data, m, cur.w, cur.h);
      logResult("noise", s, `Noise level ${memo.noise[s].toFixed(2)}`);
      render();
    };
    panel.append(
      note("Hiding data by nudging numbers up or down usually adds a little random noise. The meter measures fine-grained noise only in the blocks where the two photos differ (tinted blue), so the rest of the photo can't drown out the signal."),
      el("div", { class: "actions" }, el("button", { class: "btn btn-go btn-small", type: "button", text: `Measure photo ${state.sel}`, onclick: measure })),
      box,
      stat("Careful: a few hiding methods remove noise instead, and a tiny message may not change it at all."));
    render();
  }

  // readings precomputed for both photos (the browser can't see JPEG numbers)
  function readingTool(panel, key, intro, caption, runLabel, show, after) {
    plainView(caption);
    const box = el("div", {});
    const run = () => {
      const s = state.sel, r = reading(s)[key];
      const [text, ok, logText] = show(r);
      box.replaceChildren(el("p", { class: "grid-label", text: `Photo ${s}:` }), readout(text, ok));
      logResult(key === "nonzero_ac" ? "zeros" : key, s, logText);
      if (after) box.append(after());
    };
    panel.append(note(intro),
      el("div", { class: "actions" }, el("button", { class: "btn btn-go btn-small", type: "button", text: `${runLabel} photo ${state.sel}`, onclick: run })),
      box, stat("Run it on this photo, then switch photos and run it again."));
  }
  function toolWatermark(panel) {
    readingTool(panel, "watermark",
      "The reader looks for a watermark in the standard DWT-DCT format, spread through the photo's colour layers in small blocks, and reports the 6 characters it reads. A photo without a watermark gives random characters (shown as dots).",
      "running the watermark reader", "Read",
      r => { const ok = /[A-Za-z]{4,}/.test(r || ""); return [r || "", ok, ok ? `Reads "${r}"` : "Random characters"]; });
  }
  function toolJsteg(panel) {
    readingTool(panel, "jsteg",
      "JSteg hides bits in the last bit of the JPEG's frequency numbers, skipping 0s and 1s. This extractor reads them back in the order JSteg writes them.",
      "extracting JSteg bits", "Extract from",
      r => r.valid ? [r.text + (r.length ? `\n(${r.length.toLocaleString()} characters)` : ""), true, "Readable message"]
                   : ["No message. The bits read as noise:\n" + r.text.slice(0, 48), false, "Noise only"]);
  }
  function toolCalibration(panel) {
    const both = () => {
      const lg = state.log.calibration;
      if (!lg || !lg.A || !lg.B) return stat(`Now switch to photo ${other(state.sel)} and test it too.`);
      const a = reading("A").calibration, b = reading("B").calibration;
      return meter({ A: a, B: b }, v => (100 * v).toFixed(1) + "%");
    };
    readingTool(panel, "calibration",
      "Calibration estimates what the JPEG looked like before anything was hidden: it crops 4 pixels off and compresses the photo again, which mostly erases hidden changes. Comparing the photo with that estimate gives the share of numbers that seem to have been changed. Natural photos never score exactly 0%, so compare the two photos.",
      "running the calibration test", "Test",
      r => [`Estimated change rate: ${(100 * r).toFixed(1)}%`, true, `${(100 * r).toFixed(1)}% estimated changes`], both);
  }
  function toolZeros(panel) {
    readingTool(panel, "nonzero_ac",
      "A JPEG stores each 8×8 block as 64 frequency numbers, and most of them are 0. This counts the non-zero detail numbers. Think about the case notes: does the suspected tool create zeros, or turn zeros into ±1?",
      "counting non-zero JPEG numbers", "Count",
      r => [`Non-zero detail numbers: ${r.toLocaleString()}`, true, `${r.toLocaleString()} non-zero`]);
  }

  // ---------------------------------------------------------------- workbench
  function selectPhoto(side) {
    state.sel = side;
    $$(".pp").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.side === side)));
    $("#switchBtn").textContent = `Switch to photo ${other(side)}`;
    renderTool();
  }
  function selectTool(key) {
    state.tool = key;
    $$("#toolbox .tool-btn").forEach(b => b.setAttribute("aria-selected", String(b.dataset.key === key)));
    renderTool();
  }
  function renderTool() {
    if (!state.cur || !state.tool) return;
    $("#viewTitle").replaceChildren("Examining ", el("b", { text: `Photo ${state.sel}` }));
    const panel = $("#panel");
    panel.replaceChildren(el("p", { class: "panel-sub" }, el("b", { text: TOOLS[state.tool].label }),
      state.tool === "compare" ? " (uses both photos)" : ` on photo ${state.sel}`));
    TOOLS[state.tool].build(panel);
  }
  function buildToolbox(list) {
    $("#toolbox").replaceChildren(...list.map(key => {
      const b = el("button", { type: "button", role: "tab", class: "tool-btn", "aria-selected": "false", text: TOOLS[key].label });
      b.dataset.key = key;
      b.addEventListener("click", () => selectTool(key));
      return b;
    }));
  }

  // ---------------------------------------------------------------- flow
  function showScreen(id) {
    $$(".screen").forEach(s => s.hidden = s.id !== id);
    $("#hud").hidden = !(state.inGame && id !== "screenTitle");
    window.scrollTo({ top: 0 });
  }
  function renderHUD() {
    $("#pips").replaceChildren(...state.levels.map((m, i) => {
      const r = state.results[i];
      return el("li", { class: r === true ? "hit" : r === false ? "miss" : i === state.idx ? "current" : "", text: String(m.level) });
    }));
    $("#hudScore").textContent = state.score.toLocaleString();
  }
  function difficulty(target, level) {
    const bars = Math.ceil(level / 2);
    target.replaceChildren(...[1, 2, 3, 4, 5].map(i => el("span", { class: i <= bars ? "on" : "" })));
    target.setAttribute("aria-label", `Difficulty ${bars} of 5`);
  }

  function newGame() { state.results = []; state.score = 0; state.inGame = true; startCase(0); }

  async function startCase(i) {
    const token = ++state.caseToken;
    state.idx = i; state.phase = "loading"; state.cur = null;
    const meta = state.levels[i], cs = CASES[meta.level];
    showScreen("screenPlay");
    $("#reveal").hidden = true; $("#verdictBar").hidden = false;
    $("#levelNum").textContent = `Case ${i + 1} of ${state.levels.length}`;
    $("#levelTitle").textContent = meta.title;
    difficulty($("#difficulty"), meta.level);
    $("#caseNote").replaceChildren(el("b", { text: "Case notes" }), el("p", { text: cs.note }));
    $$(".pp").forEach(p => { p.classList.remove("is-secret", "is-original"); $(".stamp", p).textContent = ""; });
    $$(".pick").forEach(b => b.disabled = true);
    $("#view").replaceChildren(); $("#panel").replaceChildren();
    state.ts = {}; state.log = {}; renderLog();
    renderHUD();
    let cur;
    try { cur = await loadLevel(i); } catch (e) { if (token === state.caseToken) fail(e); return; }
    if (token !== state.caseToken) return;    // a newer case was started meanwhile
    // readings are cached per photo letter, and the letters are reshuffled below
    state.cur = cur; cur.memo = {};
    loadLevel(i + 1);
    state.secretSide = Math.random() < 0.5 ? "A" : "B";
    $$(".pp").forEach(p => {
      const c = $(".pp-img", p), src = img(p.dataset.side).canvas;
      c.width = src.width; c.height = src.height; c.getContext("2d").drawImage(src, 0, 0);
    });
    buildToolbox(cs.tools);
    state.tool = cs.tools[0];
    $$("#toolbox .tool-btn").forEach(b => b.setAttribute("aria-selected", String(b.dataset.key === state.tool)));
    selectPhoto("A");
    $$(".pick").forEach(b => b.disabled = false);
    state.phase = "investigate";
  }

  function verdict(side) {
    if (state.phase !== "investigate") return;
    state.phase = "reveal";
    const ok = side === state.secretSide, m = state.cur.meta, cs = CASES[m.level];
    state.results[state.idx] = ok;
    const pts = ok ? 100 + 25 * (m.level - 1) : 0;
    state.score += pts;
    $$(".pp").forEach(p => {
      const secret = p.dataset.side === state.secretSide;
      p.classList.add(secret ? "is-secret" : "is-original");
      $(".stamp", p).textContent = secret ? "Secret" : "Original";
    });
    $("#verdictBar").hidden = true;
    $("#result").className = "result " + (ok ? "ok" : "no");
    $("#resultHead").textContent = ok ? `Correct verdict: +${pts} points` : "Wrong verdict";
    $("#resultSub").textContent = `You chose photo ${side}. The secret was in photo ${state.secretSide}.`;
    $("#method").textContent = `How it was hidden: ${m.method}`;
    $("#evidence").textContent = `What the evidence showed: ${cs.evidence}`;
    $("#explain").textContent = m.explanation;
    $("#simple").textContent = m.simple ? `In plain words: ${m.simple}` : "";
    $("#toLab").href = `lab.html?lab=${m.level}`;
    $("#nextBtn").textContent = state.idx + 1 < state.levels.length ? "Next case" : "See your results";
    $("#reveal").hidden = false;
    renderHUD();
    $("#reveal").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function finish() {
    state.phase = "end";
    showScreen("screenEnd"); renderHUD();
    const r = state.results, found = r.filter(Boolean).length;
    $("#endTitle").textContent = `${state.score.toLocaleString()} points`;
    $("#endRank").textContent = `You solved ${found} of ${state.levels.length} cases.`;
    $("#resultRow").replaceChildren(...state.levels.map((m, i) => el("li", { class: r[i] ? "hit" : "miss" },
      el("span", { class: "rn", text: String(m.level) }), el("span", { class: "rt", text: m.title }),
      el("span", { class: "rs", text: r[i] ? "Solved" : "Missed" }))));
    const first7 = r.slice(0, 7).filter(Boolean).length, last3 = r.slice(7).filter(Boolean).length;
    $("#endText").textContent =
      `With the right tool, cases 1 to 7 each have a clear clue, and you solved ${first7} of them. ` +
      `Cases 8 to 10 only leave very weak traces, and you solved ${last3} of 3. ` +
      "Those adaptive methods are why real investigators train AI detectors on thousands of examples.";
  }

  function fail(e) {
    state.inGame = false;
    showScreen("screenTitle");
    $("#loadStatus").textContent = location.protocol === "file:"
      ? "Open this page through a web server (for example: python -m http.server 8000, then http://localhost:8000)."
      : `Something went wrong while loading: ${e.message}`;
  }

  async function boot() {
    $("#startBtn").addEventListener("click", newGame);
    $("#againBtn").addEventListener("click", newGame);
    $("#nextBtn").addEventListener("click", () => state.idx + 1 < state.levels.length ? startCase(state.idx + 1) : finish());
    $$(".pick").forEach(b => b.addEventListener("click", () => verdict(b.dataset.pick)));
    $$(".pp").forEach(b => b.addEventListener("click", () => { if (state.phase !== "loading") selectPhoto(b.dataset.side); }));
    $("#switchBtn").addEventListener("click", () => { if (state.phase !== "loading") selectPhoto(other(state.sel)); });
    $("#homeBtn").addEventListener("click", () => { state.inGame = false; showScreen("screenTitle"); });
    // A / B switch the examined photo (verdicts only by clicking, never by key)
    window.addEventListener("keydown", e => {
      if (e.target.closest && e.target.closest("input, textarea, select")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ($("#screenPlay").hidden || state.phase === "loading" || !state.cur) return;
      const k = e.key.toLowerCase();
      if (k === "a" || k === "b") { e.preventDefault(); selectPhoto(k.toUpperCase()); }
    });
    $("#startBtn").disabled = true;
    try {
      [state.levels, state.readings] = await Promise.all([loadJSON(`${BASE}levels.json`), loadJSON(`${BASE}investigate.json`)]);
      $("#startBtn").disabled = false;
      loadLevel(0);
    } catch (e) { fail(e); }
  }
  boot();
})();
