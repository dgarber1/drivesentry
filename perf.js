// Speed, timing, heat, and battery numbers for the Detection test.
const STAGES = ['grab', 'prep', 'infer', 'post'];

export function createPerf() {
  let pausedAt = 0;
  let pausedTotal = 0;
  let startT = 0;
  let total = 0;
  let sumMs = 0;
  let sumBoxes = 0;
  let sumStage = zero();
  let buckets = new Map();
  let recent = [];
  let heatState = 'unavailable';
  let battery = null;

  function zero() { return { grab: 0, prep: 0, infer: 0, post: 0 }; }

  // Time that does not count the moments detection was paused.
  const clock = () => performance.now() - pausedTotal - (pausedAt ? performance.now() - pausedAt : 0);
  const newWin = () => ({ start: clock(), count: 0, sumMs: 0, sumBoxes: 0, stage: zero(), buckets: new Map() });
  let win = newWin();

  function reset() {
    startT = clock();
    total = 0; sumMs = 0; sumBoxes = 0; sumStage = zero();
    buckets = new Map();
    recent = [];
    win = newWin();
  }

  function pause() { if (!pausedAt) pausedAt = performance.now(); }
  function resume() {
    if (pausedAt) { pausedTotal += performance.now() - pausedAt; pausedAt = 0; }
  }

  // ms: whole round trip for one detection. t: { grab, prep, infer, post } in ms.
  function record(ms, t, boxes) {
    const now = clock();
    total += 1; sumMs += ms; sumBoxes += boxes;
    win.count += 1; win.sumMs += ms; win.sumBoxes += boxes;
    for (const s of STAGES) { sumStage[s] += t[s] || 0; win.stage[s] += t[s] || 0; }
    recent.push(now);
    const k = Math.floor((now - startT) / 1000);
    buckets.set(k, (buckets.get(k) || 0) + 1);
    const wk = Math.floor((now - win.start) / 1000);
    win.buckets.set(wk, (win.buckets.get(wk) || 0) + 1);
  }

  function minPerSecond(map, elapsedSec) {
    let min = null;
    for (const [k, n] of map) {
      if (k >= 1 && k < Math.floor(elapsedSec)) min = min === null ? n : Math.min(min, n); // whole seconds only, skip the first
    }
    return min;
  }

  const avgStages = (sums, n) => Object.fromEntries(STAGES.map((s) => [s, n ? sums[s] / n : 0]));

  function snapshot() {
    const now = clock();
    while (recent.length && now - recent[0] > 2000) recent.shift();
    const elapsed = (now - startT) / 1000;
    return {
      fpsNow: recent.length / Math.max(0.5, Math.min(2, elapsed)),
      fpsAvg: elapsed > 0.5 ? total / elapsed : 0,
      fpsMin: minPerSecond(buckets, elapsed),
      msAvg: total ? sumMs / total : 0,
      stage: avgStages(sumStage, total),
      boxesAvg: total ? sumBoxes / total : 0,
      total,
    };
  }

  // Numbers since the last call. Used for each line of the 20-minute test log.
  function takeWindow() {
    const secs = Math.max(0.001, (clock() - win.start) / 1000);
    const out = {
      secs,
      fps: win.count / secs,
      min: minPerSecond(win.buckets, secs),
      msAvg: win.count ? win.sumMs / win.count : 0,
      stage: avgStages(win.stage, win.count),
      boxesAvg: win.count ? win.sumBoxes / win.count : 0,
    };
    win = newWin();
    return out;
  }

  // Phone heat, where Chrome offers the Compute Pressure API.
  try {
    if ('PressureObserver' in window) {
      heatState = 'waiting';
      const obs = new PressureObserver((records) => {
        const r = records[records.length - 1];
        if (r) heatState = r.state;
      });
      obs.observe('cpu', { sampleInterval: 2000 }).catch(() => { heatState = 'unavailable'; });
    }
  } catch { heatState = 'unavailable'; }

  try {
    if (navigator.getBattery) {
      navigator.getBattery().then((b) => { battery = b; }).catch(() => {});
    }
  } catch { /* no battery info */ }

  return {
    reset, pause, resume, record, snapshot, takeWindow,
    heat: () => heatState,
    batteryText: () => (battery ? `${Math.round(battery.level * 100)}%${battery.charging ? ' charging' : ' on battery'}` : 'not available'),
  };
}
