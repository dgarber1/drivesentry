// Full screen, landscape lock, screen-awake, and install handling.
const listeners = new Set();
let wakeSentinel = null;
let wakeState = 'unknown';        // unknown | on | off | unsupported | refused
let orientationState = 'unknown'; // unknown | locked | open
let deferredInstall = null;

export function onDeviceChange(fn) { listeners.add(fn); }
function emit() { listeners.forEach((fn) => fn()); }

// True when running as an installed app (home screen), not in a normal Chrome tab.
export function isInstalled() {
  if (navigator.standalone === true) return true;
  if (matchMedia('(display-mode: standalone)').matches) return true;
  // A Chrome tab that went full screen also matches "fullscreen", but then
  // document.fullscreenElement is set. An installed full-screen app has none.
  return matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement;
}

// Call this straight from a tap. Browsers only allow full screen after a tap.
export async function enterDrivingMode() {
  const el = document.documentElement;
  try {
    if (!isInstalled() && !document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch { /* the browser refused; the status shows in Settings */ }
  try {
    await screen.orientation.lock('landscape');
    orientationState = 'locked';
  } catch {
    orientationState = 'open';
  }
  emit();
}

export async function keepAwake() {
  if (!('wakeLock' in navigator)) {
    wakeState = 'unsupported';
    emit();
    return;
  }
  if (wakeSentinel && !wakeSentinel.released) return;
  try {
    wakeSentinel = await navigator.wakeLock.request('screen');
    wakeState = 'on';
    wakeSentinel.addEventListener('release', () => { wakeState = 'off'; emit(); });
  } catch {
    wakeState = 'refused';
  }
  emit();
}

export function describeDevice() {
  const installed = isInstalled();
  return {
    installed,
    canInstall: !!deferredInstall,
    screen: installed ? 'Full screen (installed app)'
      : document.fullscreenElement ? 'Full screen' : 'Not full screen',
    orientation: orientationState === 'locked' ? 'Locked to landscape'
      : installed ? 'Landscape (set by the installed app)'
      : 'Not locked (install the app to lock it)',
    awake: ({
      on: 'Screen stays on',
      off: 'Released, will retry',
      unsupported: 'Not supported by this browser',
      refused: 'Blocked by the browser',
    })[wakeState] || 'Not started',
  };
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  emit();
});
window.addEventListener('appinstalled', () => { deferredInstall = null; emit(); });
document.addEventListener('fullscreenchange', emit);

export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch { /* ignore */ }
  deferredInstall = null;
  emit();
  return true;
}
