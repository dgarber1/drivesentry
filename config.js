// Drive Sentry: shared constants. Bump VERSION and BUILD_LABEL on every upload
// so you can tell on the phone which build you are looking at.
export const VERSION = '0.2.2';
export const BUILD_LABEL = 'Phase 2, build 3';

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
  model: ['tiny', 'nano'],
  camera: ['480p', '720p', '1080p'],
};

export const DEFAULT_SETTINGS = { sound: 'both', sensitivity: 'low', units: 'mph', model: 'tiny', camera: '720p', muted: false };
export const DEFAULT_CALIBRATION = { horizon: 0.45, hood: 0.85 };

export const STRIP_HIDE_MS = 5000;   // control strip fades after this long
export const MIN_LINE_GAP = 0.08;    // horizon must sit above the hood line by this fraction of screen height

// ---------- Phase 2: vehicle detection ----------
export const DETECT = {
  // Both models are Apache-2.0 YOLOX, same 416 px input and same output format.
  // Change ?v=1 to ?v=2 if you ever replace a model file, so phones fetch the new one.
  models: {
    tiny: { label: 'Tiny', file: 'yolox_tiny.onnx', url: 'yolox_tiny.onnx?v=1' },
    nano: { label: 'Nano', file: 'yolox_nano.onnx', url: 'yolox_nano.onnx?v=1' },
  },
  inputSize: 416,
  ortBase: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/',
  // Minimum confidence per kind. People and bikes get a higher bar because the small
  // model sometimes mistakes poles and trees for them.
  classMinScore: { default: 0.45, person: 0.6, bicycle: 0.55, motorcycle: 0.55 },
  maxFps: 20,                        // never run faster than this (saves heat)
  slowFps: 12,                       // below this, the status light turns amber
  slowAfterMs: 3000,                 // ...after it has been this slow for this long
  maxBoxes: 12,                      // never draw more boxes than this
};

// Tests can shorten the 20-minute test by setting window.__DS_TEST before the app loads.
const T = (typeof window !== 'undefined' && window.__DS_TEST) || {};
export const TEST_RUN = { totalMs: T.testMs ?? 20 * 60 * 1000, logEveryMs: T.logMs ?? 30000 };
