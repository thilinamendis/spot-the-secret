/*
 * Spot the Secret: steganography awareness game
 * Developed by Thilina Mendis
 * Date: October 15, 2026
 *
 * stego.js: pixel-level helpers (decoding, bit planes, change maps).
 * The embed functions are kept for the "Hide your own message" feature,
 * which is currently switched off.
 */
/* Pixel-level helpers. Works in the browser (window.Stego) and in Node (require). 
   All functions take RGBA byte arrays as returned by canvas getImageData(). */
(function (root) {
  "use strict";

  // Same PRNG as mulberry32() in generate_levels.py, so keyed positions match.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // RGBA index of the n-th colour byte when alpha is skipped (R,G,B,R,G,B,...)
  function rgbIndex(n) { return Math.floor(n / 3) * 4 + (n % 3); }

  function keyedPositions(total, k, key) {
    const rnd = mulberry32(key);
    const arr = new Uint32Array(total);
    for (let i = 0; i < total; i++) arr[i] = i;
    const out = new Uint32Array(k);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rnd() * (total - i));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      out[i] = arr[i];
    }
    return out;
  }

  function bitsToBytes(bits) {
    const out = new Uint8Array(bits.length >> 3);
    for (let i = 0; i < out.length; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
      out[i] = v;
    }
    return out;
  }

  function utf8(bytes) {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
    catch (e) { return String.fromCharCode.apply(null, bytes); }
  }

  // Reads a 32-bit length header followed by that many bytes.
  // getBit(n) returns the LSB of the n-th carrier value.
  function readMessage(getBit, capacityBits, maxChars) {
    let len = 0;
    for (let i = 0; i < 32; i++) len = (len * 2) + getBit(i);
    const valid = len > 0 && 32 + len * 8 <= capacityBits;
    const n = Math.min(valid ? len : 64, maxChars || 100000);
    const bits = new Uint8Array(n * 8);
    for (let i = 0; i < bits.length; i++) bits[i] = getBit(32 + i);
    return { valid, length: len, text: utf8(bitsToBytes(bits)) };
  }

  function decodeSequential(rgba, maxChars) {
    const cap = (rgba.length / 4) * 3;
    return readMessage(n => rgba[rgbIndex(n)] & 1, cap, maxChars);
  }

  function decodeKeyed(rgba, key, totalBits, maxChars) {
    const cap = (rgba.length / 4) * 3;
    // Positions depend only on the key and how many we draw. We draw the real
    // count when known; with a wrong key the result is noise either way.
    const k = Math.min(totalBits || cap, cap);
    const pos = keyedPositions(cap, k, key >>> 0);
    return readMessage(n => (n < k ? rgba[rgbIndex(pos[n])] & 1 : 0), k, maxChars);
  }

  function messageBits(text) {
    const data = new TextEncoder().encode(text);
    const bytes = new Uint8Array(4 + data.length);
    const n = data.length;
    bytes[0] = (n >>> 24) & 255; bytes[1] = (n >>> 16) & 255;
    bytes[2] = (n >>> 8) & 255; bytes[3] = n & 255;
    bytes.set(data, 4);
    const bits = new Uint8Array(bytes.length * 8);
    for (let i = 0; i < bytes.length; i++)
      for (let b = 0; b < 8; b++) bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
    return bits;
  }

  function embedSequential(rgba, text) {
    const out = new Uint8ClampedArray(rgba);
    const bits = messageBits(text);
    if (bits.length > (rgba.length / 4) * 3) throw new Error("Message is too long for this photo.");
    for (let n = 0; n < bits.length; n++) {
      const i = rgbIndex(n);
      out[i] = (out[i] & 0xFE) | bits[n];
    }
    return { data: out, bits: bits.length };
  }

  function embedKeyed(rgba, text, key) {
    const out = new Uint8ClampedArray(rgba);
    const bits = messageBits(text);
    const cap = (rgba.length / 4) * 3;
    if (bits.length > cap) throw new Error("Message is too long for this photo.");
    const pos = keyedPositions(cap, bits.length, key >>> 0);
    for (let n = 0; n < bits.length; n++) {
      const i = rgbIndex(pos[n]);
      if ((out[i] & 1) !== bits[n]) {
        let step = Math.random() < 0.5 ? -1 : 1;
        if (out[i] === 0) step = 1;
        if (out[i] === 255) step = -1;
        out[i] = out[i] + step;
      }
    }
    return { data: out, bits: bits.length };
  }

  // Renders one bit plane (bit 0..7) of one channel (0,1,2) as black/white.
  function bitPlane(rgba, bit, channel, out) {
    for (let i = 0; i < rgba.length; i += 4) {
      const v = ((rgba[i + channel] >> bit) & 1) ? 255 : 0;
      out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
    }
    return out;
  }

  // Amplified difference: |b - a| summed over channels, times amp, on a
  // dark-to-highlighter ramp.
  function diffImage(a, b, amp, out) {
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      const v = Math.min(255, d * amp);
      const t = v / 255;
      out[i] = 255 * Math.min(1, t * 1.6);
      out[i + 1] = 255 * Math.min(1, t * t * 1.3 + t * 0.35);
      out[i + 2] = 255 * Math.max(0, t * t * 0.55 - 0.05);
      out[i + 3] = 255;
    }
    return out;
  }

  const api = { mulberry32, keyedPositions, decodeSequential, decodeKeyed,
                embedSequential, embedKeyed, bitPlane, diffImage, messageBits };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Stego = api;
})(typeof window !== "undefined" ? window : globalThis);
