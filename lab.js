/*
 * Spot the Secret: steganography awareness game
 * Developed by Thilina Mendis
 * Date: October 15, 2026
 *
 * lab.js: the Hiding Lab (lab.html). One chapter per level, each a short
 * step-by-step walkthrough of how that hiding method works, with small
 * visuals. lab.html?lab=N opens level N.
 */
(function (root) {
  "use strict";

  // A classic quantized JPEG luminance block (zig-zag-free 8x8 layout).
  const SAMPLE_BLOCK = [
    [-26, -3, -6, 2, 2, -1, 0, 0],
    [0, -2, -4, 1, 1, 0, 0, 0],
    [-3, 1, 5, -1, -1, 0, 0, 0],
    [-4, 1, 2, -1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  const CHAPTERS = [
    { level: 1, name: "Ghost writing", method: "Faint text overlay", steps: [
      { t: "Start with a normal photo", d: "Every photo is a grid of pixels. Each pixel has three numbers, red, green and blue, from 0 to 255.",
        v: { type: "image", file: "cover", ext: "png", cap: "The original photo" } },
      { t: "Draw text on a see-through layer", d: "The words TOP SECRET are drawn in white on a layer that is only about 5% visible.",
        v: { type: "image", file: "diff", ext: "png", cap: "Where the text layer changed the photo" } },
      { t: "Blend the layer into the photo", d: "Under the letters, each pixel gets a little brighter. A change of a few steps out of 256 is very hard to see.",
        v: { type: "change", before: 182, after: 186 } },
      { t: "Why you can still find it", d: "The change is the same shape everywhere it goes, so in smooth areas like sky a sharp eye can spot the edges of the letters.",
        v: { type: "image", file: "stego", ext: "png", cap: "The photo with the overlay" } },
    ]},
    { level: 2, name: "The hidden picture", method: "LSB replacement of a picture", steps: [
      { t: "Pixels are stored as 8 bits", d: "A computer stores each colour number as 8 bits, ones and zeros. The left bit is worth 128 and the right bit is worth just 1.",
        v: { type: "bits", value: 156 } },
      { t: "The last bit barely matters", d: "The last bit, bit 0, is the least significant bit (LSB). Flipping it changes 156 into 157, a difference nobody can see.",
        v: { type: "bits", value: 156, set: 1 } },
      { t: "Make a black-and-white picture", d: "The secret is a picture made of only white and black pixels. White means 1 and black means 0.",
        v: { type: "image", file: "lsb_stego", ext: "png", cap: "The secret picture" } },
      { t: "Copy it into the last bits", d: "For every pixel, the last bit of the photo is replaced with the matching bit of the secret picture. The other 7 bits are left alone.",
        v: { type: "bits", value: 203, set: 0 } },
      { t: "Same look, hidden picture", d: "The photo looks unchanged, but showing only its last bits reveals the picture straight away.",
        v: { type: "compare", files: ["lsb_cover", "lsb_stego"], ext: "png", caps: ["Last bits of the original", "Last bits with the secret"] } },
    ]},
    { level: 3, name: "Message in the attic", method: "Sequential LSB replacement", steps: [
      { t: "Turn letters into bits", d: "Each letter has a number code. H is 72 and i is 105. Written in 8 bits, every letter becomes a row of ones and zeros.",
        v: { type: "message", text: "Hi" } },
      { t: "Say how long the message is", d: "The first 32 bits store the message length, so the reader knows when to stop reading.",
        v: { type: "message", text: "Hi", header: true } },
      { t: "Write the bits row by row", d: "Starting at the top-left pixel, each colour value takes one bit in its last place: red, green, blue, then the next pixel.",
        v: { type: "path", mode: "seq", n: 48 } },
      { t: "Only change what needs changing", d: "If a last bit already matches the message bit, nothing changes. Otherwise it flips, so 154 becomes 155.",
        v: { type: "bits", value: 154, set: 1 } },
      { t: "The tell: a strip at the top", d: "Because the message fills the photo from the top, all the changes sit in one strip, which is easy to notice in the last bits.",
        v: { type: "image", file: "diff", ext: "png", cap: "Every changed pixel lights up" } },
    ]},
    { level: 4, name: "Scattered secrets", method: "LSB matching with a secret key", steps: [
      { t: "The problem with rows", d: "Writing from the top leaves a strip, and anyone can read it by starting at the top-left too.",
        v: { type: "path", mode: "seq", n: 48 } },
      { t: "A key picks the spots", d: "A secret key, here the number 2026, feeds a random number generator that chooses which pixels carry the bits. Same key, same spots.",
        v: { type: "path", mode: "key", n: 48, key: 2026 } },
      { t: "Add or subtract 1", d: "Instead of flipping the last bit, LSB matching randomly adds or subtracts 1. Both fix the last bit, but the change looks more like natural noise.",
        v: { type: "match", value: 156, want: 1 } },
      { t: "No key, no message", d: "Without the key, a reader doesn't know which pixels to read, and the changes are spread too thinly to see.",
        v: { type: "image", file: "diff", ext: "png", cap: "Changes are scattered across the whole photo" } },
    ]},
    { level: 5, name: "Invisible signature", method: "DWT-DCT watermark", steps: [
      { t: "Separate brightness from colour", d: "The photo is converted from red-green-blue into one brightness layer and two colour layers. This method hides in the colour layers.",
        v: { type: "image", file: "cover", ext: "png", cap: "The original photo" } },
      { t: "Split into frequency bands", d: "A wavelet transform splits a layer into a small blurry version plus three layers of detail: across, up-down and diagonal edges.",
        v: { type: "wavelet" } },
      { t: "Nudge one number per block", d: "The blurry layer is cut into 4×4 blocks. Each block is turned into frequency numbers, and its biggest number is pushed up or down to mean 1 or 0.",
        v: { type: "text", big: "1 block → 1 bit" } },
      { t: "Repeat everywhere", d: "The watermark AUBURN is repeated across the whole photo, so it can still be read after small edits or re-saving.",
        v: { type: "image", file: "diff", ext: "png", cap: "The watermark spreads over the photo's colours" } },
    ]},
    { level: 6, name: "JPEG smuggler", method: "JSteg", steps: [
      { t: "JPEG cuts the photo into blocks", d: "A JPEG splits the photo into 8×8 squares. Each square is stored as 64 frequency numbers instead of 64 pixels.",
        v: { type: "dct" } },
      { t: "Most numbers are tiny", d: "The top-left number is the block's average brightness. The rest describe detail, and after rounding most of them are 0.",
        v: { type: "dct", mark: "usable" } },
      { t: "Hide in the usable numbers", d: "JSteg skips the top-left number and every 0 and 1. In the rest, it writes one message bit into the last bit.",
        v: { type: "dct", mark: "jsteg", text: "K" } },
      { t: "The tell: pairs even out", d: "Swapping last bits makes values like 2 and 3 appear about equally often. Real photos don't do that, and a detector can count it.",
        v: { type: "hist" } },
    ]},
    { level: 7, name: "Shrinking numbers", method: "nsF5", steps: [
      { t: "Shrink instead of swap", d: "nsF5 never swaps last bits. To change a number it moves it one step toward zero, so 5 becomes 4 and -3 becomes -2.",
        v: { type: "dct", mark: "shrink" } },
      { t: "Carry more bits per change", d: "A coding trick lets it fit several message bits into a group of numbers while changing at most one of them. Fewer changes, fewer clues.",
        v: { type: "text", big: "3 bits, 1 change" } },
      { t: "Handle numbers that hit zero", d: "If a number shrinks to 0, the reader would skip it. nsF5 uses wet paper coding so the message still reads correctly.",
        v: { type: "text", big: "1 → 0 is fine" } },
      { t: "No even pairs left", d: "Because values only shrink, JSteg's even-pairs tell disappears. The changes are spread thinly across many blocks.",
        v: { type: "image", file: "diff", ext: "png", cap: "Where nsF5 made changes" } },
    ]},
    { level: 8, name: "Hide in the grass", method: "UERD (content-adaptive)", steps: [
      { t: "Every change has a cost", d: "Content-adaptive methods give every frequency number a cost: how noticeable would changing it be?",
        v: { type: "text", big: "cost = how noticeable" } },
      { t: "Busy blocks are cheap", d: "UERD looks at how much energy each block has. Busy textures like grass are cheap to change, and smooth sky is expensive.",
        v: { type: "image", file: "cost_map", ext: "png", cap: "Red is cheap, blue is expensive" } },
      { t: "Pick the cheapest changes", d: "A coding method called syndrome-trellis coding chooses which numbers to change so the message fits at the lowest total cost.",
        v: { type: "text", big: "message fits, cost stays low" } },
      { t: "Changes hide in texture", d: "Almost all the changes land in the grass and trees, where they blend into what's already there.",
        v: { type: "image", file: "diff", ext: "png", cap: "Where UERD made changes" } },
    ]},
    { level: 9, name: "Master of disguise", method: "J-UNIWARD (content-adaptive)", steps: [
      { t: "Judge cost in the picture itself", d: "J-UNIWARD imagines each change and checks how it would disturb the photo's edges and textures in the pixel domain.",
        v: { type: "wavelet" } },
      { t: "Check every direction", d: "It uses three wavelet filters, for across, up-down and diagonal detail. A change that disturbs smooth areas in any direction costs a lot.",
        v: { type: "image", file: "cost_map", ext: "png", cap: "Rock is cheap, sky is expensive" } },
      { t: "Embed at the lowest cost", d: "Syndrome-trellis coding again picks the changes that carry the message with the smallest total cost.",
        v: { type: "text", big: "cheapest path wins" } },
      { t: "Hidden where texture lives", d: "The changes sit on the rocky hill and cloud edges, and the plain sky stays untouched.",
        v: { type: "image", file: "diff", ext: "png", cap: "Where J-UNIWARD made changes" } },
    ]},
    { level: 10, name: "Needle in a haystack", method: "J-UNIWARD at a tiny payload", steps: [
      { t: "Same method, smaller message", d: "This level uses J-UNIWARD again, but the message is six times smaller than in level 9.",
        v: { type: "text", big: "0.30 → 0.05 bits per number" } },
      { t: "Fewer and cheaper changes", d: "With less to hide, only the very cheapest spots get used, deep inside the busiest textures.",
        v: { type: "image", file: "cost_map", ext: "png", cap: "Only the reddest spots are used" } },
      { t: "The square root law", d: "To stay equally hidden, a message can only grow with the square root of the image size. Small messages in big photos are the hardest to catch.",
        v: { type: "text", big: "4× the photo → 2× the message" } },
      { t: "Near the edge of detection", d: "There are so few changes that even trained detection software is not far from guessing.",
        v: { type: "image", file: "diff", ext: "png", cap: "Every change, lit up" } },
    ]},
  ];

  // ------------------------------------------------------------ visuals
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const pad8 = v => (v >>> 0).toString(2).padStart(8, "0").slice(-8);

  function bitsRow(value, highlight) {
    const row = h("div", "bitrow");
    const s = pad8(value);
    for (let i = 0; i < 8; i++) {
      const b = h("div", "bit" + (i === 7 && highlight ? " lsb" : ""));
      b.append(h("span", "bit-v", s[i]), h("span", "bit-w", String(128 >> i)));
      row.appendChild(b);
    }
    return row;
  }

  function swatch(v) {
    const s = h("div", "swatch");
    s.style.background = `rgb(${v},${v},${v})`;
    s.append(h("span", "", String(v)));
    return s;
  }

  function visBits(v) {
    const wrap = h("div", "vis-bits");
    const top = h("div", "bits-line");
    top.append(swatch(v.value), bitsRow(v.value, true));
    wrap.append(top);
    if (v.set != null) {
      const nv = (v.value & 0xFE) | v.set;
      const bot = h("div", "bits-line");
      bot.append(swatch(nv), bitsRow(nv, true));
      wrap.append(h("p", "vis-cap", nv === v.value
        ? `The message bit is ${v.set} and the last bit is already ${v.set}, so nothing changes.`
        : `Message bit ${v.set}: the last bit flips, and ${v.value} becomes ${nv}.`), bot);
    } else {
      wrap.append(h("p", "vis-cap", `${v.value} = ` + pad8(v.value).split("").map((b, i) => b === "1" ? 128 >> i : null).filter(Boolean).join(" + ")));
    }
    return wrap;
  }

  function visChange(v) {
    const w = h("div", "vis-change");
    w.append(swatch(v.before), h("div", "arrow", "→"), swatch(v.after));
    w.append(h("p", "vis-cap", `A change of ${v.after - v.before} steps out of 256.`));
    return w;
  }

  function visMatch(v) {
    const w = h("div", "vis-bits");
    w.append(h("p", "vis-cap", `Message bit ${v.want}, but ${v.value} ends in ${v.value & 1}. Two ways to fix it:`));
    [v.value - 1, v.value + 1].forEach(n => {
      const line = h("div", "bits-line");
      line.append(swatch(n), bitsRow(n, true));
      w.append(line);
    });
    return w;
  }

  function visMessage(v) {
    const w = h("div", "vis-msg");
    const bytes = new TextEncoder().encode(v.text);
    if (v.header) {
      const hd = h("div", "msg-row header");
      const n = bytes.length;
      hd.append(h("span", "msg-ch", "len"), h("span", "msg-code", String(n)),
        h("span", "msg-bits", [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].map(pad8).join(" ")));
      w.append(hd);
    }
    bytes.forEach(b => {
      const r = h("div", "msg-row");
      r.append(h("span", "msg-ch", String.fromCharCode(b)), h("span", "msg-code", String(b)), h("span", "msg-bits", pad8(b)));
      w.append(r);
    });
    return w;
  }

  function visPath(v, reduce) {
    const COLS = 16, ROWS = 10, total = COLS * ROWS;
    const w = h("div", "vis-path");
    const grid = h("div", "pgrid");
    const cells = [];
    for (let i = 0; i < total; i++) { const c = h("span", "pcell"); cells.push(c); grid.appendChild(c); }
    const order = v.mode === "seq" ? Array.from({ length: v.n }, (_, i) => i)
      : Array.from(Stego.keyedPositions(total, v.n, v.key));
    let i = 0;
    const tick = () => { if (i < order.length) { cells[order[i]].classList.add("on"); i++; } };
    if (reduce) order.forEach(() => tick());
    else { const id = setInterval(() => { tick(); if (i >= order.length) clearInterval(id); }, 35); w._stop = () => clearInterval(id); }
    w.append(grid, h("p", "vis-cap", v.mode === "seq" ? "Row by row from the top-left" : `Scattered by key ${v.key}`));
    return w;
  }

  function visDCT(v) {
    const w = h("div", "vis-dct");
    const grid = h("div", "dgrid");
    const flat = SAMPLE_BLOCK.flat();
    let after = flat.slice(), changed = new Set(), usable = new Set();
    flat.forEach((x, i) => { if (i !== 0 && x !== 0 && x !== 1) usable.add(i); });
    let cap = "";
    if (v.mark === "jsteg") {
      const bits = []; new TextEncoder().encode(v.text).forEach(b => { for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1); });
      let k = 0;
      usable.forEach(i => { if (k < bits.length) { const n = (flat[i] & ~1) | bits[k++]; if (n !== flat[i]) changed.add(i); after[i] = n; } });
      cap = `The letter "${v.text}" is 8 bits. Highlighted numbers changed by 1.`;
    } else if (v.mark === "shrink") {
      [2, 10, 18, 24].forEach(i => { after[i] = flat[i] - Math.sign(flat[i]); changed.add(i); });
      cap = "Highlighted numbers moved one step toward zero.";
    } else if (v.mark === "usable") {
      cap = `${usable.size} of 64 numbers are usable. The rest are 0, 1, or the brightness.`;
    } else cap = "One 8×8 block as frequency numbers.";
    after.forEach((x, i) => {
      const c = h("span", "dcell" + (i === 0 ? " dc" : "") + (changed.has(i) ? " changed" : v.mark === "usable" && usable.has(i) ? " usable" : "") + (x === 0 ? " zero" : ""));
      if (changed.has(i)) {
        c.append(h("span", "dnew", String(x)), h("span", "dold", `was ${flat[i]}`));
        c.title = `was ${flat[i]}, now ${x}`;
      } else c.textContent = String(x);
      grid.appendChild(c);
    });
    w.append(grid, h("p", "vis-cap", cap));
    return w;
  }

  function visHist() {
    const vals = [2, 3, 4, 5, 6, 7];
    const before = [60, 38, 25, 16, 10, 6], after = [49, 49, 20.5, 20.5, 8, 8];
    const w = h("div", "vis-hist");
    [["Real photo", before], ["After JSteg", after]].forEach(([label, arr]) => {
      const col = h("div", "hist-col");
      const bars = h("div", "hist-bars");
      arr.forEach((n, i) => {
        const b = h("div", "hbar" + (i % 2 ? " odd" : ""));
        b.style.height = (n / 60 * 100) + "%";
        b.append(h("span", "hlab", String(vals[i])));
        bars.appendChild(b);
      });
      col.append(bars, h("p", "vis-cap", label));
      w.appendChild(col);
    });
    return w;
  }

  function visText(v) { return h("div", "vis-text", v.big); }

  function visImage(level, v, base) {
    const fig = h("figure", "vis-img");
    const img = h("img"); img.alt = v.cap || ""; img.src = `${base}level_${String(level).padStart(2, "0")}/${v.file}.${v.file === "cover" || v.file === "stego" ? v.ext : "png"}`;
    fig.append(img, h("figcaption", "", v.cap || ""));
    return fig;
  }

  function visCompare(level, v, base) {
    const w = h("div", "vis-compare");
    v.files.forEach((f, i) => w.append(visImage(level, { file: f, ext: "png", cap: v.caps[i] }, base)));
    return w;
  }

  // crude Haar-style split of the level's cover: blurry quarter + 3 detail bands
  function visWavelet(level, base) {
    const w = h("div", "vis-wavelet");
    const c = h("canvas", "wcanvas"); c.width = 384; c.height = 256;
    const img = new Image();
    img.onload = () => {
      const S = 192, T = 128;
      const tmp = document.createElement("canvas"); tmp.width = S * 2; tmp.height = T * 2;
      const tc = tmp.getContext("2d", { willReadFrequently: true });
      tc.drawImage(img, 0, 0, S * 2, T * 2);
      const d = tc.getImageData(0, 0, S * 2, T * 2).data;
      const g = (x, y) => { const i = (y * S * 2 + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
      const ctx = c.getContext("2d");
      const out = ctx.createImageData(384, 256);
      const put = (x, y, v) => { const i = (y * 384 + x) * 4; out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255; };
      for (let y = 0; y < T; y++) for (let x = 0; x < S; x++) {
        const a = g(2 * x, 2 * y), b = g(2 * x + 1, 2 * y), cc = g(2 * x, 2 * y + 1), dd = g(2 * x + 1, 2 * y + 1);
        put(x, y, (a + b + cc + dd) / 4);
        put(x + S, y, Math.min(255, Math.abs(a - b + cc - dd) * 3));
        put(x, y + T, Math.min(255, Math.abs(a + b - cc - dd) * 3));
        put(x + S, y + T, Math.min(255, Math.abs(a - b - cc + dd) * 5));
      }
      ctx.putImageData(out, 0, 0);
      ctx.strokeStyle = "#FFD23F"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(S, 0); ctx.lineTo(S, 256); ctx.moveTo(0, T); ctx.lineTo(384, T); ctx.stroke();
    };
    img.src = `${base}level_${String(level).padStart(2, "0")}/cover.${level <= 5 ? "png" : "jpg"}`;
    w.append(c, h("p", "vis-cap", "Top-left: the blurry layer. The other three: edges in each direction."));
    return w;
  }

  function renderVisual(ch, step, base, reduce) {
    const v = step.v;
    switch (v.type) {
      case "bits": return visBits(v);
      case "change": return visChange(v);
      case "match": return visMatch(v);
      case "message": return visMessage(v);
      case "path": return visPath(v, reduce);
      case "dct": return visDCT(v);
      case "hist": return visHist();
      case "image": return visImage(ch.level, v, base);
      case "compare": return visCompare(ch.level, v, base);
      case "wavelet": return visWavelet(ch.level, base);
      default: return visText(v);
    }
  }

  // ------------------------------------------------------------ page
  const BASE = "levels/";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lab = { ch: 0, step: 0 };
  const $ = s => document.querySelector(s);
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    kids.forEach(k => k != null && n.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
    return n;
  }

  function renderNav() {
    const nav = $("#labNav"); nav.innerHTML = "";
    CHAPTERS.forEach((c, i) => {
      const b = el("button", { type: "button", class: "lab-item", "aria-current": String(i === lab.ch) },
        el("span", { class: "lab-n", text: String(c.level) }),
        el("span", { class: "lab-t" }, el("b", { text: c.name }), el("span", { text: c.method })));
      b.addEventListener("click", () => { lab.ch = i; lab.step = 0; renderNav(); renderCard(); });
      nav.appendChild(b);
    });
  }

  function renderCard() {
    const ch = CHAPTERS[lab.ch], st = ch.steps[lab.step];
    const card = $("#labCard");
    if (card._vis && card._vis._stop) card._vis._stop();
    card.innerHTML = "";
    const dots = el("div", { class: "lab-dots", "aria-hidden": "true" });
    ch.steps.forEach((_, i) => dots.appendChild(el("span", { class: i === lab.step ? "on" : i < lab.step ? "done" : "" })));
    const vis = renderVisual(ch, st, BASE, reduceMotion);
    card._vis = vis;
    const prev = el("button", { class: "btn btn-ghost btn-small", type: "button", text: "Previous step" });
    const next = el("button", { class: "btn btn-go btn-small", type: "button",
      text: lab.step + 1 < ch.steps.length ? "Next step" : lab.ch + 1 < CHAPTERS.length ? `Next method: ${CHAPTERS[lab.ch + 1].name}` : "Done" });
    prev.disabled = lab.step === 0;
    prev.addEventListener("click", () => { lab.step--; renderCard(); });
    next.addEventListener("click", () => {
      if (lab.step + 1 < ch.steps.length) lab.step++;
      else if (lab.ch + 1 < CHAPTERS.length) { lab.ch++; lab.step = 0; renderNav(); }
      else { location.href = "investigate.html"; return; }
      renderCard();
    });
    card.append(
      el("p", { class: "lab-kicker", text: `Level ${ch.level}: ${ch.method}` }),
      dots,
      el("h3", { class: "lab-step-title", text: `Step ${lab.step + 1}. ${st.t}` }),
      el("p", { class: "lab-step-text", text: st.d }),
      el("div", { class: "lab-visual" }, vis),
      el("div", { class: "actions lab-actions" }, prev, next));
  }

  if (document.getElementById("labCard")) {
    const n = parseInt(new URLSearchParams(location.search).get("lab"), 10);
    if (Number.isFinite(n)) lab.ch = Math.max(0, Math.min(CHAPTERS.length - 1, n - 1));
    renderNav(); renderCard();
  }

  root.Lab = { CHAPTERS, renderVisual };
})(window);
