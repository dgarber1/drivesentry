// The detection loop: grab a frame, send it to the worker, track the boxes, repeat.
// A separate draw loop moves the boxes forward to "now" every screen refresh.
// States: off | loading | running | slow | failed
import { DETECT } from './config.js';
import { createDetector } from './detector.js';
import { createTracker } from './tracker.js';

export function createDetection({ video, overlay, perf, shouldRun, onState, getModel }) {
  const tracker = createTracker();
  let detector = null;
  let ready = null;           // { backend, loadMs } once the model is loaded
  let modelKey = getModel();
  let phase = 'off';
  let reason = '';
  let running = false;
  let runId = 0;
  let timer = null;
  let raf = 0;
  let slowSince = 0;
  let lastBoxes = 0;

  const state = () => ({
    phase, reason,
    model: modelKey,
    backend: ready ? ready.backend : '',
    loadMs: ready ? ready.loadMs : 0,
    boxes: lastBoxes,
    fps: perf.snapshot().fpsNow,
  });

  function setPhase(p, r = '') {
    if (p === phase && r === reason) return;
    phase = p;
    reason = r;
    onState(state());
  }

  const active = () => shouldRun() && !document.hidden;

  function drawFrame() {
    raf = 0;
    if (!running) return;
    if (active()) overlay.draw(tracker.snapshot(performance.now()), video);
    raf = requestAnimationFrame(drawFrame);
  }
  const startDraw = () => { if (!raf) raf = requestAnimationFrame(drawFrame); };
  const stopDraw = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  function fail(id, err) {
    if (id !== runId) return;
    running = false;
    clearTimeout(timer);
    stopDraw();
    tracker.reset();
    overlay.clear();
    perf.pause();
    setPhase('failed', err && err.message ? err.message : String(err));
  }

  async function loop(id) {
    if (id !== runId || !running) return;

    const ok = active() && video.readyState >= 2 && video.videoWidth > 0 && !video.paused;
    if (!ok) {
      tracker.reset();
      overlay.clear();
      perf.pause();
      timer = setTimeout(() => loop(id), 250);
      return;
    }
    perf.resume();

    const t0 = performance.now(); // the moment this frame is captured
    let bitmap = null;
    let grab = 0;
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const r = Math.min(DETECT.inputSize / vw, DETECT.inputSize / vh);
      bitmap = await createImageBitmap(video, {
        resizeWidth: Math.max(1, Math.round(vw * r)),
        resizeHeight: Math.max(1, Math.round(vh * r)),
        resizeQuality: 'low',
      });
      grab = performance.now() - t0;
    } catch {
      timer = setTimeout(() => loop(id), 100); // picture not ready yet; try again
      return;
    }

    let res;
    try {
      res = await detector.detect(bitmap, DETECT.classMinScore);
    } catch (err) {
      fail(id, err);
      return;
    }
    if (id !== runId || !running) return;

    const now = performance.now();
    tracker.update(res.detections, t0);
    lastBoxes = tracker.snapshot(now).length;
    perf.record(now - t0, { grab, ...res.timing }, lastBoxes);

    // Running, or running slowly?
    const fps = perf.snapshot().fpsNow;
    if (phase === 'loading') {
      setPhase('running');
    } else if (phase === 'running') {
      if (fps < DETECT.slowFps) {
        slowSince = slowSince || now;
        if (now - slowSince >= DETECT.slowAfterMs) setPhase('slow');
      } else {
        slowSince = 0;
      }
    } else if (phase === 'slow' && fps >= DETECT.slowFps + 2) {
      slowSince = 0;
      setPhase('running');
    }

    // Cool down when the phone says it is getting hot.
    const heat = perf.heat();
    const interval = heat === 'critical' ? 250 : heat === 'serious' ? 120 : 1000 / DETECT.maxFps;
    timer = setTimeout(() => loop(id), Math.max(0, interval - (performance.now() - t0)));
  }

  async function start() {
    if (running) return;
    running = true;
    const id = ++runId;
    slowSince = 0;
    perf.resume();
    if (!detector) {
      setPhase('loading');
      const model = DETECT.models[modelKey];
      try {
        detector = createDetector();
        ready = await detector.init({
          modelUrl: model.url,
          modelName: model.file,
          inputSize: DETECT.inputSize,
          ortBase: DETECT.ortBase,
        });
      } catch (err) {
        if (detector) detector.dispose();
        detector = null;
        ready = null;
        fail(id, err);
        return;
      }
      if (id !== runId || !running) return; // switched off while loading
    }
    setPhase('loading');
    startDraw();
    loop(id);
  }

  function stop() {
    running = false;
    runId += 1;
    clearTimeout(timer);
    stopDraw();
    tracker.reset();
    overlay.clear();
    perf.pause();
    lastBoxes = 0;
    setPhase('off');
  }

  function retry() {
    if (detector) { detector.dispose(); detector = null; ready = null; }
    stop();
    start();
  }

  // Switch between the Tiny and Nano models. Reloads the model if detection is on.
  function setModel(key) {
    if (key === modelKey) return;
    modelKey = key;
    if (detector) { detector.dispose(); detector = null; ready = null; }
    if (running) { stop(); start(); }
  }

  return { start, stop, retry, setModel, getState: state };
}
