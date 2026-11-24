// Talks to the worker. Swappable: Phase 3 can add a lane detector with the same shape.
const INIT_TIMEOUT_MS = 120000;
const DETECT_TIMEOUT_MS = 8000;

export function createDetector() {
  const worker = new Worker('detect-worker.js');
  const pending = new Map();
  let nextId = 1;
  let initWait = null;
  let dead = null;

  function failAll(err) {
    dead = dead || err;
    if (initWait) { clearTimeout(initWait.timer); initWait.reject(err); initWait = null; }
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(err); }
    pending.clear();
  }

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready' && initWait) {
      clearTimeout(initWait.timer);
      initWait.resolve({ backend: m.backend, loadMs: m.loadMs });
      initWait = null;
    } else if (m.type === 'result') {
      const p = pending.get(m.id);
      if (p) { clearTimeout(p.timer); pending.delete(m.id); p.resolve({ detections: m.detections, timing: m.timing }); }
    } else if (m.type === 'error') {
      failAll(new Error(m.message));
    }
  };
  worker.onerror = (e) => {
    if (e.preventDefault) e.preventDefault();
    failAll(new Error(e.message || 'The detection worker crashed.'));
  };

  return {
    // Resolves to { backend, loadMs }.
    init(options) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => failAll(new Error('The model took too long to load.')), INIT_TIMEOUT_MS);
        initWait = { resolve, reject, timer };
        worker.postMessage({ type: 'init', ...options });
      });
    },
    // bitmap is handed to the worker. Resolves to { detections, timing }.
    detect(bitmap, minScore) {
      if (dead) { bitmap.close(); return Promise.reject(dead); }
      return new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => failAll(new Error('Detection stopped responding.')), DETECT_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ type: 'detect', id, bitmap, minScore }, [bitmap]);
      });
    },
    dispose() {
      failAll(new Error('Detector stopped.'));
      worker.terminate();
    },
  };
}
