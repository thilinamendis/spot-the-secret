/*
 * Spot the Secret: steganography game for the classroom
 * Developed by Thilina Mendis
 * Date: October 21, 2026
 *
 * admin.js: a hidden admin panel for resetting the leaderboard.
 *
 * Open it with the small Admin button at the top right (or by clicking the
 * "Top agents" heading 5 times quickly). The PIN is never in the code: the first time the panel opens on a
 * computer, the admin creates a PIN, and only a salted SHA-256 hash of it is
 * kept in that browser's storage. Forgotten PIN: clear this site's data in
 * the browser settings (which also clears the leaderboard).
 */
(function (root) {
  "use strict";
  const KEY = "spot-the-secret-admin";
  const CLICKS = 5, CLICK_WINDOW = 3000;      // 5 clicks within 3 seconds opens the panel
  const MAX_TRIES = 5, LOCK_TIME = 30000;     // 5 wrong PINs locks the panel for 30 seconds
  const MIN_PIN = 4;
  const $ = s => document.querySelector(s);

  // ---------------------------------------------------------------- PIN storage
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
  async function hash(pin, salt) {
    return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`)));
  }
  const stored = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  async function setPin(pin) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(KEY, JSON.stringify({ salt, hash: await hash(pin, salt) }));
  }
  async function checkPin(pin) {
    const s = stored();
    return !!s && (await hash(pin, s.salt)) === s.hash;
  }

  // ---------------------------------------------------------------- panel
  let tries = 0, lockedUntil = 0, onReset = null, armed = false;

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    kids.forEach(k => k != null && n.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
    return n;
  }
  const pinInput = (id, label) => el("label", { class: "admin-field" }, el("span", { text: label }),
    el("input", { id, type: "password", inputmode: "numeric", autocomplete: "off", minlength: String(MIN_PIN), maxlength: "32" }));

  function open() {
    const back = $("#adminPop");
    back.hidden = false;
    document.querySelectorAll("main > .screen, .hud").forEach(n => n.inert = true);
    stored() ? viewUnlock() : viewCreate();
  }
  function close() {
    $("#adminPop").hidden = true;
    document.querySelectorAll("main > .screen, .hud").forEach(n => n.inert = false);
  }
  function render(title, sub, body, focusId) {
    $("#adminBody").replaceChildren(
      el("p", { class: "admin-kicker", text: "🔒 Admin" }),
      el("h2", { class: "pop-head", id: "adminHead", text: title }),
      el("p", { class: "pop-sub", text: sub }),
      body);
    if (focusId) document.getElementById(focusId).focus();
  }
  const msg = () => el("p", { class: "admin-msg", id: "adminMsg", role: "alert" });
  const say = (t, ok) => { const m = $("#adminMsg"); m.textContent = t; m.classList.toggle("ok", !!ok); };

  function viewCreate() {
    const form = el("form", { class: "admin-form" },
      pinInput("pinNew", "New PIN"), pinInput("pinAgain", "Type it again"), msg(),
      el("div", { class: "admin-actions" },
        el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: close }),
        el("button", { class: "btn btn-go", type: "submit", text: "Save PIN" })));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const a = $("#pinNew").value, b = $("#pinAgain").value;
      if (a.length < MIN_PIN) return say(`Use at least ${MIN_PIN} characters.`);
      if (a !== b) return say("The two PINs don't match.");
      await setPin(a);
      viewTools("PIN saved on this computer.");
    });
    render("Create an admin PIN", "This computer has no admin PIN yet. It's saved only on this computer, never online. Don't let players see you type it.", form, "pinNew");
  }

  function viewUnlock() {
    const form = el("form", { class: "admin-form" }, pinInput("pin", "Admin PIN"), msg(),
      el("div", { class: "admin-actions" },
        el("button", { class: "btn btn-ghost", type: "button", text: "Cancel", onclick: close }),
        el("button", { class: "btn btn-go", type: "submit", text: "Unlock" })));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const wait = lockedUntil - Date.now();
      if (wait > 0) return say(`Too many wrong PINs. Try again in ${Math.ceil(wait / 1000)} seconds.`);
      if (await checkPin($("#pin").value)) { tries = 0; return viewTools(); }
      tries++;
      $("#pin").value = "";
      if (tries >= MAX_TRIES) { tries = 0; lockedUntil = Date.now() + LOCK_TIME; return say(`Too many wrong PINs. Locked for ${LOCK_TIME / 1000} seconds.`); }
      say(`Wrong PIN. ${MAX_TRIES - tries} tries left.`);
    });
    render("Admin login", "Enter this computer's admin PIN.", form, "pin");
  }

  function viewTools(note) {
    armed = false;
    const count = root.Board ? root.Board.count() : 0;
    const resetBtn = el("button", { class: "btn btn-danger", type: "button", text: `Reset leaderboard (${count} agent${count === 1 ? "" : "s"})` });
    resetBtn.addEventListener("click", async () => {
      if (!armed) { armed = true; resetBtn.textContent = "Yes, delete every score"; return say("Click again to confirm. This can't be undone."); }
      const r = await root.Board.reset();
      armed = false;
      if (!r.ok) return say(r.reason);
      resetBtn.textContent = "Reset leaderboard (0 agents)";
      say("Leaderboard cleared.", true);
      if (onReset) onReset();
    });
    const body = el("div", { class: "admin-form" },
      el("p", { class: "admin-board", text: `Board: "${root.Board ? root.Board.board : "main"}"` }),
      resetBtn, msg(),
      el("div", { class: "admin-actions" },
        el("button", { class: "btn btn-ghost", type: "button", text: "Change PIN", onclick: viewCreate }),
        el("button", { class: "btn btn-go", type: "button", text: "Done", onclick: close })));
    render("Admin tools", "Clear the scores before a new session.", body);
    if (note) say(note, true);
  }

  // ---------------------------------------------------------------- hidden trigger
  function attach(trigger, opts = {}) {
    onReset = opts.onReset || null;
    let clicks = [];
    trigger.addEventListener("click", () => {
      const now = Date.now();
      clicks = clicks.filter(t => now - t < CLICK_WINDOW).concat(now);
      if (clicks.length >= CLICKS) { clicks = []; open(); }
    });
    addEventListener("keydown", e => { if (e.key === "Escape" && !$("#adminPop").hidden) close(); });
  }

  root.Admin = { attach, open, close };
})(window);
