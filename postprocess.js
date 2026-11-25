// Turns the raw YOLOX output into boxes. Plain script (no imports) so the worker can
// load it with importScripts, and so it can be unit-tested in Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Postprocess = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // COCO class numbers we care about.
  const KEEP = [[0, 'person'], [1, 'bicycle'], [2, 'car'], [3, 'motorcycle'], [5, 'bus'], [7, 'truck']];
  const STRIDES = [8, 16, 32];
  const FIELDS = 85;            // x, y, w, h, objectness, then 80 class scores
  const NMS_IOU = 0.45;
  const MAX_CANDIDATES = 300;
  const MAX_OUT = 50;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // minScore can be one number, or { default: 0.45, person: 0.6, ... } for per-kind limits.
  function thresholdsFor(minScore) {
    if (typeof minScore === 'number') return KEEP.map(() => minScore);
    const d = typeof minScore.default === 'number' ? minScore.default : 0.45;
    return KEEP.map((k) => (typeof minScore[k[1]] === 'number' ? minScore[k[1]] : d));
  }

  // Rejects shapes that cannot be what the model says: a pole is not a person.
  // h/w limits are in picture pixels. Sizes are in model-input pixels.
  const MAX_H_OVER_W = { person: 4.2, bicycle: 2.5, motorcycle: 2.5, car: 1.9, truck: 1.9, bus: 1.9 };
  const MIN_H_OVER_W = { person: 1.0 };
  function plausible(label, w, h) {
    if (h < 10 || w < 8) return false;
    const r = h / w;
    if (r > (MAX_H_OVER_W[label] || 3)) return false;
    if (MIN_H_OVER_W[label] && r < MIN_H_OVER_W[label]) return false;
    return true;
  }

  function expectedRows(size) {
    return STRIDES.reduce((n, s) => n + (size / s) * (size / s), 0);
  }

  // The official YOLOX ONNX files give raw grid-relative numbers. If a file already
  // has them decoded, the width column holds pixel sizes (big numbers) instead of logs.
  function looksDecoded(data, size) {
    const n8 = (size / 8) * (size / 8);
    let max = -Infinity;
    for (let i = 0; i < n8; i++) {
      const w = data[i * FIELDS + 2];
      if (w > max) max = w;
    }
    return max > 12;
  }

  function candidates(data, size, thr) {
    const lowest = Math.min.apply(null, thr);
    const decoded = looksDecoded(data, size);
    const out = [];
    let row = 0;
    for (const s of STRIDES) {
      const g = size / s;
      for (let gy = 0; gy < g; gy++) {
        for (let gx = 0; gx < g; gx++, row++) {
          const b = row * FIELDS;
          const obj = data[b + 4];
          if (!(obj >= lowest)) continue;             // score can't beat objectness
          let best = 0;
          let bestK = -1;
          for (let k = 0; k < KEEP.length; k++) {
            const sc = obj * data[b + 5 + KEEP[k][0]];
            if (sc >= thr[k] && sc > best) { best = sc; bestK = k; }
          }
          if (bestK < 0) continue;
          let cx, cy, w, h;
          if (decoded) {
            cx = data[b]; cy = data[b + 1]; w = data[b + 2]; h = data[b + 3];
          } else {
            cx = (data[b] + gx) * s;
            cy = (data[b + 1] + gy) * s;
            w = Math.exp(data[b + 2]) * s;
            h = Math.exp(data[b + 3]) * s;
          }
          out.push({ k: bestK, score: best, x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 });
        }
      }
    }
    out.sort((a, b) => b.score - a.score);
    return out.length > MAX_CANDIDATES ? out.slice(0, MAX_CANDIDATES) : out;
  }

  function iou(a, b) {
    const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    const inter = ix * iy;
    const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return union > 0 ? inter / union : 0;
  }

  // Keeps the best box and drops overlapping boxes of the same kind.
  function nms(sorted) {
    const keep = [];
    for (const c of sorted) {
      let ok = true;
      for (const k of keep) {
        if (k.k === c.k && iou(k, c) > NMS_IOU) { ok = false; break; }
      }
      if (ok) {
        keep.push(c);
        if (keep.length >= MAX_OUT) break;
      }
    }
    return keep;
  }

  // contentW/contentH: the size of the picture inside the square model input (it is
  // placed at the top-left, the rest is gray padding). Boxes come back as 0..1 of the picture.
  function process(data, dims, size, contentW, contentH, minScore) {
    const rows = dims && dims.length >= 2 ? dims[dims.length - 2] : data.length / FIELDS;
    if (rows !== expectedRows(size) || data.length !== rows * FIELDS) {
      throw new Error('Unexpected model output shape (' + (dims ? dims.join('x') : data.length) +
        '). Expected ' + expectedRows(size) + ' rows of ' + FIELDS + ' numbers. Is this the YOLOX-Tiny file?');
    }
    return nms(candidates(data, size, thresholdsFor(minScore)))
      .filter((c) => plausible(KEEP[c.k][1], c.x2 - c.x1, c.y2 - c.y1))
      .map((c) => ({
        label: KEEP[c.k][1],
        score: c.score,
        box: [clamp01(c.x1 / contentW), clamp01(c.y1 / contentH), clamp01(c.x2 / contentW), clamp01(c.y2 / contentH)],
      }))
      .filter((d) => d.box[2] - d.box[0] > 0.003 && d.box[3] - d.box[1] > 0.003);
  }

  return { process, expectedRows, looksDecoded, nms, iou, plausible, thresholdsFor, KEEP, FIELDS, STRIDES };
});
