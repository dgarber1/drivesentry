// Settings screen. Meant to be used while parked.
import { VERSION, BUILD_LABEL } from './config.js';

const $ = (selector) => document.querySelector(selector);

export function initSettings({ getSettings, updateSettings, getInfo, onDone, onCalibrate, onRestartCamera, onInstall }) {
  const segs = document.querySelectorAll('.seg');
  let timer = null;

  function renderChoices() {
    const settings = getSettings();
    segs.forEach((seg) => {
      const current = settings[seg.dataset.setting];
      seg.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.value === current));
      });
    });
  }

  function renderInfo() {
    const info = getInfo();
    $('#cal-summary').textContent = info.calibration;
    $('#info-camera').textContent = info.camera;
    $('#info-view').textContent = info.view;
    $('#info-awake').textContent = info.awake;
    $('#info-orientation').textContent = info.orientation;
    $('#info-screen').textContent = info.screen;
    $('#info-version').textContent = `${VERSION} (${BUILD_LABEL})`;
    const installBtn = $('#btn-install');
    const installText = $('#info-install');
    installBtn.hidden = !info.canInstall;
    installText.textContent = info.installed ? 'Installed'
      : info.canInstall ? 'Not installed yet'
      : 'In Chrome, tap ⋮ then Install app';
  }

  segs.forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;
      updateSettings({ [seg.dataset.setting]: button.dataset.value });
      renderChoices();
    });
  });

  $('#btn-settings-done').addEventListener('click', () => { clearInterval(timer); onDone(); });
  $('#btn-calibrate').addEventListener('click', () => { clearInterval(timer); onCalibrate(); });
  $('#btn-restart-camera').addEventListener('click', () => { clearInterval(timer); onRestartCamera(); });
  $('#btn-install').addEventListener('click', onInstall);

  return {
    open() {
      renderChoices();
      renderInfo();
      clearInterval(timer);
      timer = setInterval(renderInfo, 1000);
    },
  };
}
