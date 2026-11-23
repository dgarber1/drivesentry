// Calibration: a live tilt check and two draggable lines (horizon and hood).
// Line positions are saved as fractions of screen height.
import { DEFAULT_CALIBRATION, MIN_LINE_GAP } from './config.js';

const $ = (selector) => document.querySelector(selector);

export function initCalibration({ getSaved, onSave, onClose, toast }) {
  const field = $('#cal-field');
  const lines = { horizon: $('#line-horizon'), hood: $('#line-hood') };
  const closeBtn = $('#btn-cal-close');
  const sideRow = $('#tilt-side');
  const aimRow = $('#tilt-aim');
  const hint = $('#tilt-hint');

  let pos = { ...DEFAULT_CALIBRATION };
  let motionHandler = null;
  let unavailableTimer = null;
  let smooth = null;

  function place() {
    lines.horizon.style.top = `${pos.horizon * 100}%`;
    lines.hood.style.top = `${pos.hood * 100}%`;
  }

  function attachDrag(el, kind) {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      el.dataset.drag = '1';
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (el.dataset.drag !== '1') return;
      const rect = field.getBoundingClientRect();
      let f = (e.clientY - rect.top) / rect.height;
      f = Math.min(0.97, Math.max(0.03, f));
      if (kind === 'horizon') f = Math.min(f, pos.hood - MIN_LINE_GAP);
      else f = Math.max(f, pos.horizon + MIN_LINE_GAP);
      pos[kind] = f;
      place();
    });
    const end = () => { el.dataset.drag = '0'; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  attachDrag(lines.horizon, 'horizon');
  attachDrag(lines.hood, 'hood');

  function setRow(row, text, ok) {
    row.querySelector('b').textContent = text;
    row.dataset.ok = ok === null ? '' : String(ok);
  }

  // Android reports gravity as an "up" pointer: a phone lying face up reads +9.8 on z.
  // The rear camera looks along -z, so aim = asin(-z / g).
  function renderTilt() {
    const { x, y, z } = smooth;
    const g = Math.hypot(x, y, z) || 1;
    const landscape = window.innerWidth >= window.innerHeight;
    const side = (landscape ? Math.atan2(Math.abs(y), Math.abs(x))
                            : Math.atan2(Math.abs(x), Math.abs(y))) * 180 / Math.PI;
    const aim = Math.asin(Math.max(-1, Math.min(1, -z / g))) * 180 / Math.PI;

    const sideOk = side <= 3;
    const aimOk = aim >= -8 && aim <= 8;
    setRow(sideRow, `${side.toFixed(0)}°`, sideOk);
    setRow(aimRow, `${Math.abs(aim).toFixed(0)}° ${aim >= 0 ? 'up' : 'down'}`, aimOk);

    if (!sideOk) hint.textContent = 'Straighten the phone so it sits level.';
    else if (aim > 8) hint.textContent = 'Aimed too high. Tilt the top of the phone toward you.';
    else if (aim < -8) hint.textContent = 'Aimed too low. Tilt the top of the phone away from you.';
    else hint.textContent = 'Phone looks level. Now set the two lines.';
  }

  function startTilt() {
    smooth = null;
    setRow(sideRow, '…', null);
    setRow(aimRow, '…', null);
    hint.textContent = 'Reading the tilt sensor…';
    motionHandler = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      clearTimeout(unavailableTimer);
      smooth = smooth
        ? { x: smooth.x + (a.x - smooth.x) * 0.15, y: smooth.y + (a.y - smooth.y) * 0.15, z: smooth.z + (a.z - smooth.z) * 0.15 }
        : { x: a.x, y: a.y, z: a.z };
      renderTilt();
    };
    window.addEventListener('devicemotion', motionHandler);
    unavailableTimer = setTimeout(() => {
      setRow(sideRow, 'n/a', null);
      setRow(aimRow, 'n/a', null);
      hint.textContent = 'Tilt sensor not available here. You can still set the lines.';
    }, 2000);
  }

  function stopTilt() {
    clearTimeout(unavailableTimer);
    if (motionHandler) window.removeEventListener('devicemotion', motionHandler);
    motionHandler = null;
  }

  $('#btn-cal-save').addEventListener('click', () => {
    onSave({ horizon: pos.horizon, hood: pos.hood, savedAt: Date.now() });
    toast('Calibration saved');
    stopTilt();
    onClose();
  });
  closeBtn.addEventListener('click', () => { stopTilt(); onClose(); });

  return {
    open() {
      const saved = getSaved();
      pos = saved ? { horizon: saved.horizon, hood: saved.hood } : { ...DEFAULT_CALIBRATION };
      closeBtn.textContent = saved ? 'Close' : 'Do this later';
      place();
      startTilt();
    },
  };
}
