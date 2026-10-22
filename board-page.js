/*
 * Spot the Secret: steganography game for the classroom
 * Developed by Thilina Mendis
 * Date: October 22, 2026
 *
 * board-page.js: the full leaderboard page (leaderboard.html). Shows every
 * agent's best game, or every game played, with search, and updates live.
 */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const NAME_KEY = "spot-the-secret-name";   // the last agent who played on this computer
  const MEDALS = ["🥇", "🥈", "🥉"];
  const state = { best: [], all: [], view: "best", query: "", mode: "" };
  let lastName = "";
  try { lastName = (localStorage.getItem(NAME_KEY) || "").toLowerCase(); } catch (e) { /* storage blocked */ }

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
    }
    kids.forEach(k => k != null && n.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
    return n;
  }
  const secs = ms => `${(ms / 1000).toFixed(1)} s`;
  function when(at) {
    const d = new Date(at), now = new Date();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? `Today ${time}` : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  }

  function render() {
    const rows = state.view === "best" ? state.best : state.all;
    const q = state.query.trim().toLowerCase();
    // stats
    $("#stAgents").textContent = String(state.best.length);
    $("#stGames").textContent = String(state.all.length);
    $("#stTop").textContent = state.all.length ? String(state.all[0].score) : "–";
    $("#stAvg").textContent = state.all.length ? String(Math.round(state.all.reduce((a, r) => a + r.score, 0) / state.all.length)) : "–";
    const label = state.mode === "online" ? "● Live" : state.mode === "error" ? "Offline" : "This computer";
    document.querySelectorAll("[data-board-mode]").forEach(n => { n.textContent = label; n.dataset.mode = state.mode; });
    // podium: always the best three agents
    $("#podium").replaceChildren(...state.best.slice(0, 3).map((r, i) => el("li", { class: `pod p${i + 1}` },
      el("span", { class: "pod-medal", text: MEDALS[i] }),
      el("span", { class: "pod-name", text: r.name }),
      el("span", { class: "pod-score", text: `${r.score} pts` }),
      el("span", { class: "pod-meta", text: `${r.found}/10 found · ${secs(r.avgMs)} avg` }))));
    // table
    const shown = rows.map((r, i) => [r, i]).filter(([r]) => !q || r.name.toLowerCase().includes(q));
    if (!shown.length) {
      $("#lbBody").replaceChildren(el("tr", {}, el("td", { colspan: "7", class: "lb-empty",
        text: rows.length ? `No agent matches "${state.query}".` : "No scores yet. Be the first agent on the board!" })));
      return;
    }
    $("#lbBody").replaceChildren(...shown.map(([r, i]) => el("tr", { class: (i < 3 ? `top${i + 1}` : "") + (r.name.toLowerCase() === lastName ? " mine" : "") },
      el("td", { class: "lb-rank", text: MEDALS[i] || String(i + 1) }),
      el("td", { class: "lb-name", text: r.name }),
      el("td", { class: "lb-score", text: String(r.score) }),
      el("td", { text: `${r.found} of 10` }),
      el("td", { text: r.found ? secs(r.avgMs) : "–" }),
      el("td", { text: r.bestStreak ? `🔥 ${r.bestStreak}` : "0" }),
      el("td", { class: "lb-when", text: when(r.at) }))));
  }

  // view switch and search
  document.querySelectorAll("#viewSeg button").forEach(b => b.addEventListener("click", () => {
    state.view = b.dataset.view;
    document.querySelectorAll("#viewSeg button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
    render();
  }));
  $("#search").addEventListener("input", e => { state.query = e.target.value; render(); });

  // keep ?board= when going back to the game
  $("#backLink").href = `index.html${location.search}`;
  $("#lbBoard").textContent = `Board: ${Board.board}`;

  Board.subscribe((rows, mode) => { state.best = rows; state.mode = mode; render(); });
  Board.subscribe((rows, mode) => { state.all = rows; state.mode = mode; render(); }, { all: true });

  Admin.attach($("#lbTitle"));
  $("#adminBtn").addEventListener("click", () => Admin.open());
  FX.bitsBackground($("#bitsBg"), 40);
  FX.parallax(document.querySelector(".bg-fx"));
})();
