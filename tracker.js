// Follows boxes from one detection to the next. Three jobs:
//  1. Hide one-frame flickers (a box must be seen twice, unless it is very confident).
//  2. Smooth the boxes and learn how fast each one moves.
//  3. Predict where each box is NOW. A detection describes the camera picture from
//     100 to 250 ms ago, so without this the boxes lag behind moving cars.
const DEFAULTS = {
  matchIou: 0.2,        // how much a new box must overlap a track to count as the same object
  maxMisses: 4,         // drop a track after this many detections without a match
  maxAgeMs: 800,        // ...or after this long without any update
  minHits: 2,           // show a track once it was seen this many times
  instantScore: 0.7,    // ...or right away if the detector is this sure
  alpha: 0.6,           // how strongly a new measurement corrects the position
  beta: 0.25,           // how strongly it corrects the speed
  maxExtrapMs: 400,     // never predict further ahead than this
  maxVel: 0.002,        // speed limit (fraction of the picture per millisecond)
};

const groupOf = (label) => (label === 'car' || label === 'truck' || label === 'bus' ? 'vehicle' : label);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function iou(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

export function createTracker(overrides = {}) {
  const p = { ...DEFAULTS, ...overrides };
  let tracks = [];
  let nextId = 1;

  const boxAt = (t, dt) => {
    const cx = t.cx + t.vx * dt;
    const cy = t.cy + t.vy * dt;
    const w = Math.max(0.004, t.w + t.vw * dt);
    const h = Math.max(0.004, t.h + t.vh * dt);
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
  };

  const measure = (box) => ({
    cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2, w: box[2] - box[0], h: box[3] - box[1],
  });

  function create(d, time) {
    const m = measure(d.box);
    return {
      id: nextId++, label: d.label, best: d.score, score: d.score,
      ...m, vx: 0, vy: 0, vw: 0, vh: 0, time, hits: 1, misses: 0,
    };
  }

  function correct(t, d, time) {
    const dt = Math.max(16, Math.min(time - t.time, 1000));
    const m = measure(d.box);
    for (const [k, v] of [['cx', 'vx'], ['cy', 'vy'], ['w', 'vw'], ['h', 'vh']]) {
      const pred = t[k] + t[v] * dt;
      const resid = m[k] - pred;
      t[k] = pred + p.alpha * resid;
      t[v] = Math.max(-p.maxVel, Math.min(p.maxVel, t[v] + (p.beta * resid) / dt));
    }
    t.time = time;
    t.hits += 1;
    t.misses = 0;
    t.score = 0.6 * t.score + 0.4 * d.score;
    if (d.score >= t.best) { t.best = d.score; t.label = d.label; }
  }

  // detections: [{label, score, box:[x1,y1,x2,y2] as 0..1}], time: when the frame was captured (ms).
  function update(detections, time) {
    const preds = tracks.map((t) => boxAt(t, Math.min(time - t.time, 1000)));
    const pairs = [];
    tracks.forEach((t, ti) => {
      detections.forEach((d, di) => {
        if (groupOf(t.label) !== groupOf(d.label)) return;
        const v = iou(preds[ti], d.box);
        if (v >= p.matchIou) pairs.push([v, ti, di]);
      });
    });
    pairs.sort((a, b) => b[0] - a[0]);
    const usedT = new Set();
    const usedD = new Set();
    for (const [, ti, di] of pairs) {
      if (usedT.has(ti) || usedD.has(di)) continue;
      usedT.add(ti);
      usedD.add(di);
      correct(tracks[ti], detections[di], time);
    }
    tracks.forEach((t, i) => { if (!usedT.has(i)) t.misses += 1; });
    detections.forEach((d, di) => { if (!usedD.has(di)) tracks.push(create(d, time)); });
    tracks = tracks.filter((t) => t.misses <= p.maxMisses && time - t.time <= p.maxAgeMs);
  }

  // The boxes to draw at time `now`, moved forward to where they should be by now.
  function snapshot(now) {
    const out = [];
    for (const t of tracks) {
      if (now - t.time > p.maxAgeMs) continue;
      if (t.hits < p.minHits && t.score < p.instantScore) continue;
      const dt = Math.min(Math.max(now - t.time, 0), p.maxExtrapMs);
      const b = boxAt(t, dt);
      out.push({ id: t.id, label: t.label, score: t.score, box: [clamp01(b[0]), clamp01(b[1]), clamp01(b[2]), clamp01(b[3])] });
    }
    return out;
  }

  return { update, snapshot, reset: () => { tracks = []; } };
}
