/*
 * Spot the Secret: steganography game for the classroom
 * Developed by Thilina Mendis
 * Date: October 21, 2026
 *
 * fx.js: the game's animations (confetti, count-up numbers, flying points,
 * drifting bits on the landing page, the bouncing title). Every effect is
 * skipped or shortened when the viewer prefers reduced motion.
 */
(function (root) {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLOURS = ["#FFD23F", "#5CC8E6", "#4ADE80", "#FF8FA3", "#FFFFFF"];

  // ---------------------------------------------------------------- confetti
  // A burst of paper bits from a point (x, y in viewport pixels).
  let parts = [], raf = 0;
  function confetti(x, y, count = 90) {
    if (reduce) return;
    const c = document.getElementById("confetti");
    const ctx = c.getContext("2d");
    c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 8;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4,
        color: COLOURS[i % COLOURS.length], life: 1 });
    }
    if (raf) return;
    const step = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.009;
        ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
        ctx.restore();
      }
      raf = parts.length ? requestAnimationFrame(step) : 0;
      if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- numbers
  // Counts a number up (or down) inside an element.
  function countUp(node, from, to, ms = 700, fmt = String) {
    if (reduce || from === to) { node.textContent = fmt(to); return Promise.resolve(); }
    return new Promise(done => {
      const t0 = performance.now();
      const step = t => {
        const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        node.textContent = fmt(Math.round(from + (to - from) * e));
        k < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  }

  // Replays a CSS animation class on an element.
  function pulse(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  // Flies a short text (e.g. "+10") from one element to another.
  function flyText(text, fromEl, toEl) {
    if (reduce) return Promise.resolve();
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const n = document.createElement("div");
    n.className = "fly-points"; n.textContent = text;
    document.body.appendChild(n);
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const anim = n.animate([
      { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 80}px) translate(-50%, -50%) scale(1.4)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(0.5)`, opacity: 0.2 },
    ], { duration: 900, easing: "cubic-bezier(.5,0,.3,1)" });
    return anim.finished.then(() => n.remove());
  }

  // ---------------------------------------------------------------- landing
  // Zeros and ones drifting up behind the landing page.
  function bitsBackground(box, count = 34) {
    box.replaceChildren();
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      s.textContent = Array.from({ length: 1 + (i % 4) }, () => (Math.random() < 0.5 ? "0" : "1")).join("");
      s.style.left = `${Math.random() * 100}%`;
      s.style.fontSize = `${0.8 + Math.random() * 1.4}rem`;
      s.style.setProperty("--dur", `${14 + Math.random() * 18}s`);
      s.style.setProperty("--delay", `${-Math.random() * 30}s`);
      box.appendChild(s);
    }
  }

  // Splits a heading into letters that bounce in one after another.
  function bounceLetters(node) {
    const text = node.textContent;
    node.setAttribute("aria-label", text);
    node.replaceChildren(...Array.from(text).map((ch, i) => {
      const s = document.createElement("span");
      s.className = "letter"; s.setAttribute("aria-hidden", "true");
      s.textContent = ch === " " ? " " : ch;
      s.style.animationDelay = `${i * 45}ms`;
      return s;
    }));
  }

  // ---------------------------------------------------------------- pointer
  // The background drifts a little against the mouse, for depth.
  function parallax(layer) {
    if (reduce || !matchMedia("(hover: hover)").matches) return;
    let x = 0, y = 0, queued = false;
    addEventListener("pointermove", e => {
      x = e.clientX / innerWidth - 0.5; y = e.clientY / innerHeight - 0.5;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { layer.style.setProperty("--px", x); layer.style.setProperty("--py", y); queued = false; });
    });
  }

  // A card tilts toward the pointer while it's over it.
  function tilt(node, max = 5) {
    if (reduce || !matchMedia("(hover: hover)").matches) return;
    node.addEventListener("pointermove", e => {
      const r = node.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      node.style.transform = `perspective(900px) rotateY(${x * max}deg) rotateX(${-y * max}deg)`;
      node.style.setProperty("--gx", `${(x + 0.5) * 100}%`); node.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
    });
    node.addEventListener("pointerleave", () => { node.style.transform = ""; });
  }

  root.FX = { confetti, countUp, pulse, flyText, bitsBackground, bounceLetters, parallax, tilt, reduce };
})(window);
