/*
 * Spot the Secret: steganography game for the classroom
 * Developed by Thilina Mendis
 * Date: October 22, 2026
 *
 * sound.js: background music and sound effects, made in the browser with
 * the Web Audio API (no audio files). The music is a soft, spy-style loop:
 * a pulsing bass, a plucked arpeggio and a quiet pad over Am-F-C-G.
 *
 * Browsers don't let a page play sound until someone clicks on it, so the
 * game always opens muted. Clicking the Sound button turns the music and
 * effects on (that click is what browsers ask for), and they stay on for the
 * session until it is clicked again.
 */
(function (root) {
  "use strict";
  const BPM = 96, STEP = 60 / BPM / 2;          // eighth notes
  const MUSIC_VOL = 0.11, SFX_VOL = 0.32;
  // Am, F, C, G: bass note, arpeggio and pad chord for each bar (MIDI numbers)
  const BARS = [
    { bass: 45, arp: [57, 60, 64, 69, 64, 60, 64, 60], pad: [69, 72, 76] },
    { bass: 41, arp: [57, 60, 65, 69, 65, 60, 65, 60], pad: [65, 69, 72] },
    { bass: 48, arp: [55, 60, 64, 67, 64, 60, 64, 60], pad: [64, 67, 72] },
    { bass: 43, arp: [55, 59, 62, 67, 62, 59, 62, 59], pad: [62, 67, 71] },
  ];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  let ctx = null, music = null, sfx = null, timer = 0, nextTime = 0, step = 0, playing = false;
  let enabled = false;   // muted until the Sound button is clicked

  function setup() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    const warm = ctx.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 2400; warm.connect(master);
    music = ctx.createGain(); music.gain.value = 0; music.connect(warm);
    sfx = ctx.createGain(); sfx.gain.value = SFX_VOL; sfx.connect(master);
    return true;
  }

  // one note: oscillator through a quick attack / decay envelope
  function note(dest, type, freq, t, dur, vol, glideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- music
  function scheduleStep(t) {
    const bar = BARS[Math.floor(step / 8) % BARS.length], i = step % 8;
    note(music, "triangle", hz(bar.arp[i] + 12), t, STEP * 0.9, 0.22);                 // pluck
    if (i % 2 === 0) note(music, "sine", hz(bar.bass), t, STEP * 1.8, i === 0 ? 0.55 : 0.32);  // pulsing bass
    if (i === 0) {                                                                       // soft pad, once a bar
      bar.pad.forEach(m => note(music, "sine", hz(m), t, STEP * 7.5, 0.05));
    }
    if (i === 4) note(music, "square", 1800, t, 0.03, 0.03);                             // tiny hi-hat tick
    step++;
  }
  function pump() {
    while (nextTime < ctx.currentTime + 0.15) { scheduleStep(nextTime); nextTime += STEP; }
  }
  function startMusic() {
    if (!enabled || playing || !setup()) return;
    ctx.resume();
    playing = true;
    nextTime = ctx.currentTime + 0.05;
    music.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.setTargetAtTime(MUSIC_VOL, ctx.currentTime, 0.6);
    timer = setInterval(pump, 40);
    pump();
  }
  function stopMusic() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    music.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => { if (!enabled && ctx) ctx.suspend(); }, 600);   // rest the audio engine once it has faded out
  }

  // ---------------------------------------------------------------- effects
  const EFFECTS = {
    correct: t => { note(sfx, "triangle", hz(76), t, 0.18, 0.5); note(sfx, "triangle", hz(81), t + 0.11, 0.35, 0.5); note(sfx, "sine", hz(88), t + 0.22, 0.45, 0.25); },
    wrong: t => { note(sfx, "sawtooth", 220, t, 0.35, 0.22, 110); note(sfx, "square", 160, t + 0.05, 0.3, 0.08, 90); },
    timeout: t => { note(sfx, "square", 330, t, 0.16, 0.18); note(sfx, "square", 262, t + 0.2, 0.16, 0.18); note(sfx, "square", 196, t + 0.4, 0.4, 0.2); },
    unlock: t => { note(sfx, "triangle", 400, t, 0.25, 0.35, 1200); note(sfx, "sine", hz(84), t + 0.18, 0.3, 0.25); },
    tick: t => note(sfx, "square", 1400, t, 0.04, 0.12),
    click: t => note(sfx, "triangle", 900, t, 0.06, 0.2),
    fanfare: t => [72, 76, 79, 84].forEach((m, i) => note(sfx, "triangle", hz(m), t + i * 0.13, i === 3 ? 0.7 : 0.2, 0.45)),
  };
  function play(name) {
    if (!enabled || !setup() || !EFFECTS[name]) return;
    ctx.resume();
    EFFECTS[name](ctx.currentTime + 0.01);
  }

  // ---------------------------------------------------------------- controls
  function setEnabled(on) {
    enabled = on;
    if (on) { setup(); ctx.resume(); startMusic(); } else stopMusic();
    label();
  }
  function label() {
    if (!button) return;
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "🔊 Sound on" : "🔇 Sound off";
    button.title = enabled ? "Turn the music and sounds off" : "Turn the music and sounds on";
  }
  let button = null;
  function attach(btn) {
    button = btn;
    label();
    btn.addEventListener("click", e => { e.stopPropagation(); setEnabled(!enabled); });
    // pause while the tab is hidden
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else if (enabled) ctx.resume();
    });
  }

  root.Sound = { attach, play, start: startMusic, stop: stopMusic, get enabled() { return enabled; }, get state() { return ctx ? ctx.state : "off"; } };
})(window);
