// Drive Sentry: shared constants. Bump VERSION and BUILD_LABEL on every upload
// so you can tell on the phone which build you are looking at.
export const VERSION = '0.1.1';
export const BUILD_LABEL = 'Phase 1, build 2';

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
