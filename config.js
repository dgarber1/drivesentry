// Drive Sentry: shared constants. Bump VERSION and BUILD_LABEL on every upload
// so you can tell on the phone which build you are looking at.
export const VERSION = '0.2.0';
export const BUILD_LABEL = 'Phase 2, build 1';

export const KEYS = {
  settings: 'ds.settings',
  calibration: 'ds.calibration',
  accepted: 'ds.accepted',
  calPrompted: 'ds.calPrompted',
};

export const OPTIONS = {
  sound: ['voice', 'tones', 'both'],
  sensitivity: ['low', 'medium', 'high'],
  units: ['mph', 'kmh'],
};

export const DEFAULT_SETTINGS = { sound: 'both', sensitivity: 'low', units: 'mph', muted: false };
export const DEFAULT_CALIBRATION = { horizon: 0.45, hood: 0.85 };

export const STRIP_HIDE_MS = 5000;   // control strip fades after this long
export const MIN_LINE_GAP = 0.08;    // horizon must sit above the hood line by this fraction of screen height

// ---------- Phase 2: vehicle detection ----------
export const DETECT = {
  modelName: 'yolox_tiny.onnx',
  modelUrl: 'yolox_tiny.onnx?v=1',   // change ?v=1 to ?v=2 if you ever replace the model file
  inputSize: 416,                    // YOLOX-Tiny is built for 416 x 416
  ortBase: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/',
  minScore: 0.45,                    // spec: only show detections at 45% confidence or higher
  maxFps: 30,                        // never run faster than this (saves heat)
  slowFps: 12,                       // below this, the status light turns amber
  slowAfterMs: 3000,                 // ...after it has been this slow for this long
  maxBoxes: 12,                      // never draw more boxes than this
};

// Tests can shorten the 20-minute test by setting window.__DS_TEST before the app loads.
const T = (typeof window !== 'undefined' && window.__DS_TEST) || {};
export const TEST_RUN = { totalMs: T.testMs ?? 20 * 60 * 1000, logEveryMs: T.logMs ?? 30000 };
