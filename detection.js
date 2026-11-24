// The detection loop: grab a frame, send it to the worker, draw the boxes, repeat.
// States: off | loading | running | slow | failed
import { DETECT } from './config.js';
import { createDetector } from './detector.js';

export function createDetection({ video, overlay, perf, shouldRun, onState }) {
  let detector = null;
  let ready = null;           // { backend, loadMs } once the model is loaded
  let phase = 'off';
  let reason = '';
  let running = false;
  let runId = 0;
  let timer = null;
  let slowSince = 0;
  let lastBoxes = 0;

  const state = () => ({
    phase, reason,
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

  function fail(id, err) {
    if (id !== runId) return;
    running = false;
    clearTimeout(timer);
    overlay.clear();
    perf.pause();
    setPhase('failed', err && err.message ? err.message : String(err));
  }

  async function loop(id) {
    if (id !== runId || !running) return;

    const ok = shouldRun() && !document.hidden && video.readyState >= 2 && video.videoWidth > 0 && !video.paused;
    if (!ok) {
      overlay.clear();
      perf.pause();
      timer = setTimeout(() => loop(id), 250);
      return;
    }
    perf.resume();

    const t0 = performance.now();
    let bitmap = null;
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const r = Math.min(DETECT.inputSize / vw, DETECT.inputSize / vh);
      bitmap = await createImageBitmap(video, {
        resizeWidth: Math.max(1, Math.round(vw * r)),
        resizeHeight: Math.max(1, Math.round(vh * r)),
        resizeQuality: 'low',
      });
    } catch {
      timer = setTimeout(() => loop(id), 100); // picture not ready yet; try again
      return;
    }

    let res;
    try {
      res = await detector.detect(bitmap, DETECT.minScore);
    } catch (err) {
      fail(id, err);
      return;
    }
    if (id !== runId || !running) return;

    const now = performance.now();
    lastBoxes = overlay.draw(res.detections, video);
    perf.record(now - t0, res.timing.total, lastBoxes);

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
      try {
        detector = createDetector();
        ready = await detector.init({
          modelUrl: DETECT.modelUrl,
          modelName: DETECT.modelName,
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
    loop(id);
  }

  function stop() {
    running = false;
    runId += 1;
    clearTimeout(timer);
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

  return { start, stop, retry, getState: state };
}
