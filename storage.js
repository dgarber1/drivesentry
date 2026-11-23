// Saves settings and calibration in the browser. Falls back to memory if storage is blocked.
import { KEYS, OPTIONS, DEFAULT_SETTINGS } from './config.js';

const memory = new Map();

function readRaw(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch { /* storage blocked */ }
  return memory.has(key) ? memory.get(key) : null;
}

function writeRaw(key, value) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

function readJSON(key) {
  const raw = readRaw(key);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function loadSettings() {
  const saved = readJSON(KEYS.settings) || {};
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(OPTIONS)) {
    if (OPTIONS[key].includes(saved[key])) out[key] = saved[key];
  }
  out.muted = saved.muted === true;
  return out;
}

export function saveSettings(settings) {
  writeRaw(KEYS.settings, JSON.stringify(settings));
}

// Calibration lines are stored as fractions of screen height (0 = top, 1 = bottom).
export function loadCalibration() {
  const c = readJSON(KEYS.calibration);
  if (c && typeof c.horizon === 'number' && typeof c.hood === 'number' &&
      c.horizon >= 0 && c.hood <= 1 && c.horizon < c.hood) {
    return c;
  }
  return null;
}

export function saveCalibration(calibration) {
  writeRaw(KEYS.calibration, JSON.stringify(calibration));
}

export const hasAccepted = () => readJSON(KEYS.accepted) === true;
export const setAccepted = () => writeRaw(KEYS.accepted, 'true');
export const wasCalibrationPrompted = () => readJSON(KEYS.calPrompted) === true;
export const setCalibrationPrompted = () => writeRaw(KEYS.calPrompted, 'true');
