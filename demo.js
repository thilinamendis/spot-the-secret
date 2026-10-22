/*
 * Spot the Secret: steganography game for the classroom
 * Developed by Thilina Mendis
 * Date: October 22, 2026
 *
 * demo.js: the landing page's animation. It shows a normal photo, then
 * X-rays it from bit 7 down to bit 0, where a hidden word appears, and
 * loops. Picture only, no text. The photo (levels_simple/demo/stego.png, made by
 * tools/generate_simple.py) is not used in any level.
 */
(function (root) {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STEPS = [
    { bit: null, ms: 2600 },
    { bit: 7, ms: 900 }, { bit: 6, ms: 700 }, { bit: 5, ms: 700 }, { bit: 4, ms: 700 },
    { bit: 3, ms: 700 }, { bit: 2, ms: 700 }, { bit: 1, ms: 800 },
    { bit: 0, ms: 3200, reveal: true },
  ];

  async function loadData(url) {
    const blob = await (await fetch(url)).blob();
    let bmp;
    try { bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" }); }
    catch (e) { bmp = await createImageBitmap(blob); }
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
    return { canvas: c, data: x.getImageData(0, 0, c.width, c.height) };
  }

  // card: the .demo-card element; isVisible(): only animate while the landing page shows
  async function start(card, src, isVisible) {
    const canvas = card.querySelector("canvas");
    let img;
    try { img = await loadData(src); } catch (e) { card.hidden = true; return; }
    canvas.width = img.data.width; canvas.height = img.data.height;
    const ctx = canvas.getContext("2d"), plane = new ImageData(canvas.width, canvas.height);

    function draw(step) {
      if (step.bit == null) ctx.drawImage(img.canvas, 0, 0);
      else { root.Stego.bitPlane(img.data.data, step.bit, 0, plane.data); ctx.putImageData(plane, 0, 0); }
      card.classList.toggle("reveal", !!step.reveal);
    }
    if (reduce) { draw(STEPS[STEPS.length - 1]); return; }   // a still picture of the reveal

    let i = 0;
    const next = () => {
      if (isVisible()) { draw(STEPS[i]); i = (i + 1) % STEPS.length; }
      setTimeout(next, isVisible() ? STEPS[(i + STEPS.length - 1) % STEPS.length].ms : 500);
    };
    next();
  }

  root.Demo = { start };
})(window);
