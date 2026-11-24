// Speed, timing, heat, and battery numbers for the Detection test.
export function createPerf() {
  let pausedAt = 0;
  let pausedTotal = 0;
  let startT = 0;
  let total = 0;
  let sumMs = 0;
  let sumModel = 0;
  let sumBoxes = 0;
  let buckets = new Map();
  let recent = [];
  // Time that does not count the moments detection was paused.
  const clock = () => performance.now() - pausedTotal - (pausedAt ? performance.now() - pausedAt : 0);

  function newWin() { return { start: clock(), count: 0, sumMs: 0, sumBoxes: 0, buckets: new Map() }; }
  let win = newWin();
  let heatState = 'unavailable';
  let battery = null;

  function reset() {
    startT = clock();
    total = 0; sumMs = 0; sumModel = 0; sumBoxes = 0;
    buckets = new Map();
    recent = [];
    win = newWin();
  }

  function pause() { if (!pausedAt) pausedAt = performance.now(); }
  function resume() {
    if (pausedAt) { pausedTotal += performance.now() - pausedAt; pausedAt = 0; }
  }

  // ms: whole round trip for one detection. modelMs: time inside the worker.
  function record(ms, modelMs, boxes) {
    const t = clock();
    total += 1; sumMs += ms; sumModel += modelMs; sumBoxes += boxes;
    recent.push(t);
    const k = Math.floor((t - startT) / 1000);
    buckets.set(k, (buckets.get(k) || 0) + 1);
    win.count += 1; win.sumMs += ms; win.sumBoxes += boxes;
    const wk = Math.floor((t - win.start) / 1000);
    win.buckets.set(wk, (win.buckets.get(wk) || 0) + 1);
  }

  function minPerSecond(map, elapsedSec) {
    let min = null;
    for (const [k, n] of map) {
      if (k >= 1 && k < Math.floor(elapsedSec)) min = min === null ? n : Math.min(min, n); // whole seconds only, skip the first
    }
    return min;
  }

  function snapshot() {
    const t = clock();
    while (recent.length && t - recent[0] > 2000) recent.shift();
    const elapsed = (t - startT) / 1000;
    return {
      fpsNow: recent.length / Math.max(0.5, Math.min(2, elapsed)),
      fpsAvg: elapsed > 0.5 ? total / elapsed : 0,
      fpsMin: minPerSecond(buckets, elapsed),
      msAvg: total ? sumMs / total : 0,
      modelMsAvg: total ? sumModel / total : 0,
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
