// Drive Sentry, Phase 2: camera shell plus AI vehicle detection. No lane detection or alerts yet.
import { VERSION, BUILD_LABEL } from './config.js';
import * as store from './storage.js';
import { createCamera, cameraPermission } from './camera.js';
import * as device from './device.js';
import { showScreen, setVersionText, initStrip, setMuted, setLight, setBlocked, setNotice, getBlockedKind, toast } from './ui.js';
import { initCalibration } from './calibration.js';
import { initSettings } from './settings.js';
import { createOverlay } from './overlay.js';
import { createPerf } from './perf.js';
import { createDetection } from './detection.js';
import { initDetTest } from './dettest.js';

const $ = (selector) => document.querySelector(selector);

let settings = store.loadSettings();
let calibration = store.loadCalibration();
let cameraState = { status: 'idle', sample: { mean: 0, spread: 0 } };

setVersionText(`Version ${VERSION} (${BUILD_LABEL})`);

// ---------- Camera ----------
const camera = createCamera($('#cam'), (state) => {
  cameraState = state;
  refreshStatus();
}, () => settings.camera);

// ---------- Vehicle detection ----------
const perf = createPerf();
const overlay = createOverlay($('#overlay'));
let detState = { phase: 'off', reason: '', backend: '', loadMs: 0, boxes: 0, fps: 0 };
let fileTest = null; // { name, url } while a recorded video is run through the detector

const detection = createDetection({
  video: $('#cam'),
  overlay,
  perf,
  getModel: () => settings.model,
  // Detect only on the driving view and the test screen, and only with a good picture.
  shouldRun: () => ['camera', 'dettest'].includes(document.body.dataset.screen) && (!!fileTest || cameraState.status === 'ok'),
  onState: (s) => {
    detState = s;
    refreshStatus();
    dettest.noteState(s);
  },
});

// One place decides what the status light, the red message, and the top notice say.
function refreshStatus() {
  const cam = cameraState.status;
  const camBad = !fileTest && ['blocked', 'frozen', 'error'].includes(cam);
  const detFailed = detState.phase === 'failed';

  if (camBad) setBlocked(cam);
  else if (detFailed) setBlocked('detector', detState.reason);
  else setBlocked(null);

  let light;
  if (camBad) light = ['bad', 'Camera problem'];
  else if (detFailed) light = ['bad', 'Vehicle detection failed'];
  else if (!fileTest && cam === 'idle') light = ['off', 'Drive Sentry is off'];
  else if (!fileTest && cam === 'starting') light = ['warn', 'Starting camera'];
  else if (detState.phase === 'loading') light = ['warn', 'Loading vehicle detection'];
  else if (detState.phase === 'slow') light = ['warn', 'Vehicle detection is slow'];
  else if (detState.phase === 'running') light = ['ok', 'Camera and detection working'];
  else light = ['warn', 'Vehicle detection is off'];
  setLight(light[0], light[1]);

  if (detState.phase === 'loading' && !camBad) setNotice('Loading vehicle detection…');
  else if (detState.phase === 'slow' && !camBad) setNotice(`Detection is running slowly (${Math.round(detState.fps)} per second)`);
  else setNotice(null);
}

const DENIED_COPY = {
  denied: {
    title: 'Camera access is off',
    text: 'Drive Sentry needs the camera to watch the road. Video stays on your phone.',
    steps: [
      'Installed app: touch and hold the Drive Sentry icon, tap App info, then Permissions, then Camera, then Allow.',
      'In Chrome: tap the icon left of the address bar, then Permissions, then Camera, then Allow.',
      'Come back here and tap Try again.',
    ],
  },
  nocamera: {
    title: 'No camera found',
    text: 'This phone did not report a rear camera.',
    steps: ['Close other camera apps, then tap Try again.', 'If it keeps happening, restart your phone.'],
  },
  inuse: {
    title: 'Camera is busy',
    text: 'Another app is using the camera.',
    steps: ['Close apps that use the camera, such as video calls.', 'Tap Try again.'],
  },
  error: {
    title: 'Camera could not start',
    text: 'Something went wrong while starting the camera.',
    steps: ['Tap Try again.', 'If it keeps failing, close and reopen Drive Sentry.'],
  },
};

function showCameraProblem(kind) {
  detection.stop();
  const copy = DENIED_COPY[kind] || DENIED_COPY.error;
  $('#denied-title').textContent = copy.title;
  $('#denied-text').textContent = copy.text;
  const list = $('#denied-steps');
  list.replaceChildren(...copy.steps.map((s) => Object.assign(document.createElement('li'), { textContent: s })));
  showScreen('denied');
}

async function startCamera() {
  showScreen('camera');
  strip.show();
  const ok = await camera.start();
  if (!ok) {
    showCameraProblem(camera.getStatus());
    return;
  }
  device.keepAwake();
  detection.start();
  if (!calibration && !store.wasCalibrationPrompted()) {
    store.setCalibrationPrompted();
    openCalibration();
  }
}

// ---------- On / off ----------
// Off stops the camera and the alerts, and lets the screen sleep.
function turnOff() {
  detection.stop();
  camera.stop();
  device.releaseAwake();
  showScreen('off');
}

// Back to whichever main screen fits: the driving view, or the off screen.
function showMain() {
  if (camera.getStatus() === 'idle') {
    showScreen('off');
  } else {
    showScreen('camera');
    strip.show();
  }
}

async function ensureCameraOn() {
  if (camera.getStatus() !== 'idle') return true;
  const ok = await camera.start();
  if (!ok) { showCameraProblem(camera.getStatus()); return false; }
  device.keepAwake();
  detection.start();
  return true;
}

// ---------- Control strip ----------
const strip = initStrip({
  onPower: turnOff,
  onGear: () => { showScreen('settings'); settingsScreen.open(); },
  onMute: () => {
    settings = { ...settings, muted: !settings.muted };
    store.saveSettings(settings);
    setMuted(settings.muted);
    toast(settings.muted ? 'Alerts muted' : 'Alerts on');
  },
});
setMuted(settings.muted);

// ---------- Calibration ----------
const calibrationScreen = initCalibration({
  getSaved: () => calibration,
  onSave: (c) => { calibration = c; store.saveCalibration(c); },
  onClose: showMain,
  toast,
});

function openCalibration() {
  showScreen('calibration');
  calibrationScreen.open();
}

// ---------- Settings ----------
const settingsScreen = initSettings({
  getSettings: () => settings,
  updateSettings: (patch) => {
    const prev = settings;
    settings = { ...settings, ...patch };
    store.saveSettings(settings);
    // Model and camera quality take effect right away, and restart the numbers.
    if (patch.model && patch.model !== prev.model) { detection.setModel(patch.model); perf.reset(); }
    if (patch.camera && patch.camera !== prev.camera) {
      perf.reset();
      if (!fileTest && camera.getStatus() !== 'idle') camera.start();
    }
  },
  getInfo: () => {
    const d = device.describeDevice();
    const cameraText = {
      ok: 'Working', starting: 'Starting', blocked: 'Blocked or too dark',
      frozen: 'Picture stopped', error: 'Stopped', idle: 'Off',
    }[cameraState.status] || 'Off';
    const s = cameraState.sample;
    const ds = detection.getState();
    const fps = Math.round(ds.fps);
    const modelLabel = ds.model === 'nano' ? 'Nano' : 'Tiny';
    const detectionText = ({
      off: 'Off',
      loading: 'Loading the model…',
      running: `Running at ${fps} per second (${ds.backend}, ${modelLabel})`,
      slow: `Slow, ${fps} per second (${ds.backend}, ${modelLabel})`,
      failed: `Failed: ${ds.reason}`,
    })[ds.phase] || 'Off';
    return {
      ...d,
      detection: detectionText,
      camera: cameraText,
      view: cameraState.status === 'idle' ? '–' : `brightness ${Math.round(s.mean)}, detail ${Math.round(s.spread)}`,
      calibration: calibration
        ? `Horizon at ${Math.round(calibration.horizon * 100)}%, hood at ${Math.round(calibration.hood * 100)}% of screen height`
        : 'Not calibrated yet',
    };
  },
  onDone: showMain,
  onCalibrate: async () => { if (await ensureCameraOn()) openCalibration(); },
  onDetTest: async () => { if (await ensureCameraOn()) { showScreen('dettest'); dettest.open(); } },
  onRestartCamera: () => { device.enterDrivingMode(); startCamera(); },
  onInstall: () => device.promptInstall(),
});

// ---------- Detection test screen ----------
function enterFileTest(file) {
  if (fileTest) URL.revokeObjectURL(fileTest.url);
  fileTest = { name: file.name, url: URL.createObjectURL(file) };
  camera.stop(); // the camera is off while a recorded video runs through the detector
  const v = $('#cam');
  v.srcObject = null;
  v.src = fileTest.url;
  v.loop = true;
  v.muted = true;
  v.play().catch(() => {});
  perf.reset();
  detection.start();
  refreshStatus();
  dettest.refresh();
}

async function exitFileTest() {
  if (!fileTest) return;
  URL.revokeObjectURL(fileTest.url);
  fileTest = null;
  const v = $('#cam');
  v.pause();
  v.removeAttribute('src');
  v.loop = false;
  v.load();
  refreshStatus();
  if (await ensureCameraOn()) perf.reset();
  dettest.refresh();
}

const dettest = initDetTest({
  perf,
  getDetection: () => detection.getState(),
  getSettings: () => settings,
  isFileMode: () => !!fileTest,
  getFileName: () => (fileTest ? fileTest.name : ''),
  onPickFile: enterFileTest,
  onExitFile: exitFileTest,
  onClose: async () => { await exitFileTest(); showMain(); },
  toast,
});

// ---------- First-run flow ----------
function prepareStartScreen(permission) {
  const granted = permission === 'granted';
  $('#start-title').textContent = granted ? 'Ready to drive' : 'Allow the camera';
  $('#start-text').textContent = granted
    ? 'Mount your phone horizontally (landscape) and level, near the middle of the windshield, then tap Start.'
    : 'Drive Sentry uses your camera to watch the road. Video is processed on your phone and is never uploaded or saved. Your phone will ask for camera permission next.';
  $('#btn-start').textContent = granted ? 'Start' : 'Allow camera and start';
  $('#start-install').hidden = device.isInstalled();
}

async function goStart() {
  const permission = await cameraPermission();
  if (permission === 'denied') {
    showCameraProblem('denied');
    return;
  }
  if (device.isInstalled() && permission === 'granted') {
    await startCamera();
    return;
  }
  prepareStartScreen(permission);
  showScreen('start');
}

$('#btn-accept').addEventListener('click', () => {
  store.setAccepted();
  device.enterDrivingMode(); // this tap lets the browser go full screen
  goStart();
});
$('#btn-turn-on').addEventListener('click', () => { device.enterDrivingMode(); startCamera(); });
$('#btn-off-settings').addEventListener('click', () => { showScreen('settings'); settingsScreen.open(); });
$('#btn-start').addEventListener('click', () => { device.enterDrivingMode(); startCamera(); });
$('#btn-denied-retry').addEventListener('click', () => { device.enterDrivingMode(); startCamera(); });
$('#btn-retry').addEventListener('click', async () => {
  if (getBlockedKind() === 'detector') { detection.retry(); return; }
  const ok = await camera.start();
  if (!ok) showCameraProblem(camera.getStatus());
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (cameraState.status !== 'idle') {
    device.keepAwake();
    camera.recover();
  }
});

// ---------- Boot ----------
if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  showScreen('unsupported');
} else if (!store.hasAccepted()) {
  showScreen('disclaimer');
} else {
  goStart();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
