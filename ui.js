// Screens, the control strip, the status light, and the blocked-camera message.
import { STRIP_HIDE_MS } from './config.js';

const $ = (selector) => document.querySelector(selector);

export function showScreen(name) {
  document.body.dataset.screen = name;
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.dataset.screen !== name;
  });
}

export function setVersionText(text) {
  document.querySelectorAll('.version').forEach((el) => { el.textContent = text; });
}

// The strip sits on the left edge. It fades after a few seconds; a tap on the edge brings it back.
export function initStrip({ onGear, onMute }) {
  const strip = $('#strip');
  let timer = null;
  const hide = () => strip.classList.remove('visible');
  const show = () => {
    strip.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(hide, STRIP_HIDE_MS);
  };
  $('#edge').addEventListener('pointerdown', show);
  $('#btn-gear').addEventListener('click', onGear);
  $('#btn-mute').addEventListener('click', () => { show(); onMute(); });
  return { show, hide };
}

export function setMuted(muted) {
  const btn = $('#btn-mute');
  btn.setAttribute('aria-pressed', String(muted));
  btn.setAttribute('aria-label', muted ? 'Unmute alerts' : 'Mute alerts');
  $('#icon-sound').hidden = muted;
  $('#icon-muted').hidden = !muted;
}

export function setLight(state, label) {
  const light = $('#light');
  light.dataset.state = state; // ok | warn | bad
  light.setAttribute('aria-label', label);
}

const BLOCKED_COPY = {
  blocked: {
    title: 'Camera blocked or too dark',
    text: 'Clear the lens or the windshield view. Drive Sentry can’t watch the road right now.',
  },
  frozen: {
    title: 'Camera picture stopped',
    text: 'Waiting for the camera to recover. Drive Sentry can’t watch the road right now.',
  },
  error: {
    title: 'Camera stopped',
    text: 'Another app may have taken the camera. Drive Sentry can’t watch the road right now.',
    retry: true,
  },
};

let lastBlocked = null;

export function setBlocked(kind) {
  const copy = kind ? BLOCKED_COPY[kind] : null;
  document.body.dataset.blocked = copy ? 'true' : 'false';
  if (copy) {
    $('#blocked-title').textContent = copy.title;
    $('#blocked-text').textContent = copy.text;
    $('#btn-retry').hidden = !copy.retry;
    if (kind !== lastBlocked && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  lastBlocked = copy ? kind : null;
}

let toastTimer = null;
export function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
