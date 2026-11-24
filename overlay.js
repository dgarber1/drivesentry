// Draws thin boxes over the live picture.
import { DETECT } from './config.js';

// The video fills the screen with object-fit: cover, which scales the picture up
// until it covers the screen and trims the overflow equally on both sides.
// Boxes are 0..1 of the full camera picture; this returns screen pixels.
export function mapBox(box, vw, vh, W, H) {
  const s = Math.max(W / vw, H / vh);
  const ox = (W - vw * s) / 2;
  const oy = (H - vh * s) / 2;
  return {
    x: ox + box[0] * vw * s,
    y: oy + box[1] * vh * s,
    w: (box[2] - box[0]) * vw * s,
    h: (box[3] - box[1]) * vh * s,
  };
}

const COLORS = { person: '#7cc8ff' };
const VEHICLE = '#ffb020';

export function createOverlay(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;

  function fit() {
    const r = canvas.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (!w || !h) return false;
    if (w !== W || h !== H || d !== dpr) {
      W = w; H = h; dpr = d;
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function clear() {
    if (!W) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Returns how many boxes were drawn.
  function draw(detections, video) {
    if (!fit()) return 0;
    ctx.clearRect(0, 0, W, H);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return 0;
    const shown = detections.slice().sort((a, b) => b.score - a.score).slice(0, DETECT.maxBoxes);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const d of shown) {
      const m = mapBox(d.box, vw, vh, W, H);
      const color = COLORS[d.label] || VEHICLE;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeRect(m.x, m.y, m.w, m.h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.strokeRect(m.x, m.y, m.w, m.h);

      const text = `${d.label} ${Math.round(d.score * 100)}`;
      const tw = ctx.measureText(text).width + 10;
      const ty = m.y >= 18 ? m.y - 16 : m.y + 2;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(m.x, ty, tw, 16);
      ctx.fillStyle = color;
      ctx.fillText(text, m.x + 5, ty + 8.5);
    }
    return shown.length;
  }

  window.addEventListener('resize', clear);
  return { draw, clear };
}
