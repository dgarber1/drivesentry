// The Detection test screen: live numbers, a 20-minute test with a copyable log,
// and a way to run a recorded video through the detector.
import { TEST_RUN, VERSION, BUILD_LABEL, DETECT } from './config.js';

const $ = (selector) => document.querySelector(selector);
const pad = (n) => String(n).padStart(2, '0');
const mmss = (ms) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
const fix = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : v.toFixed(d));

export function initDetTest({ perf, getDetection, getSettings, isFileMode, getFileName, onPickFile, onExitFile, onClose, toast }) {
  const logEl = $('#dt-log');
  const runBtn = $('#btn-dt-run');
  const fileBtn = $('#btn-dt-file');
  const input = $('#file-input');
  let renderTimer = null;
  let test = null;
  const lines = [];

  function addLog(line) {
    lines.push(line);
    logEl.value = lines.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function render() {
    const d = getDetection();
    const s = perf.snapshot();
    $('#dt-mode').textContent = isFileMode() ? `Video file: ${getFileName()}` : 'Live camera';
    const modelLabel = DETECT.models[d.model] ? DETECT.models[d.model].label : '';
    $('#dt-engine').textContent = d.phase === 'failed' ? `Failed: ${d.reason}`
      : d.backend ? `${d.backend}, ${modelLabel}` : d.phase === 'loading' ? 'Loading…' : '–';
    $('#dt-load').textContent = d.loadMs ? `${(d.loadMs / 1000).toFixed(1)} s` : '–';
    $('#dt-fps').textContent = s.total ? `${fix(s.fpsNow)} per second` : '–';
    $('#dt-avg').textContent = s.total ? `${fix(s.fpsAvg)} / ${s.fpsMin == null ? '–' : s.fpsMin}` : '–';
    const r = (v) => Math.round(v);
    $('#dt-ms').textContent = s.total ? `${r(s.msAvg)} ms total` : '–';
    $('#dt-split').textContent = s.total
      ? `grab ${r(s.stage.grab)} · prep ${r(s.stage.prep)} · model ${r(s.stage.infer)} · post ${r(s.stage.post)}` : '–';
    const settings = getSettings();
    document.querySelectorAll('#screen-dettest .seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === settings[seg.dataset.setting])));
    });
    $('#dt-boxes').textContent = s.total ? fix(s.boxesAvg) + ' average' : '–';
    $('#dt-heat').textContent = perf.heat() === 'unavailable' ? 'not available in this browser' : perf.heat();
    $('#dt-battery').textContent = perf.batteryText();
    fileBtn.textContent = isFileMode() ? 'Back to camera' : 'Video file';
    if (test) runBtn.textContent = `Stop test (${mmss(Math.max(0, TEST_RUN.totalMs - (performance.now() - test.start)))} left)`;
    else runBtn.textContent = '20-minute test';
  }

  function stopTest(reason) {
    if (!test) return;
    clearInterval(test.timer);
    const elapsed = performance.now() - test.start;
    const s = perf.snapshot();
    addLog(`${reason} After ${mmss(elapsed)}: average ${fix(s.fpsAvg)} per second, lowest second ${s.fpsMin == null ? '–' : s.fpsMin}, ` +
      `${Math.round(s.msAvg)} ms per detection (grab ${Math.round(s.stage.grab)}, prep ${Math.round(s.stage.prep)}, model ${Math.round(s.stage.infer)}, post ${Math.round(s.stage.post)}), ` +
      `heat ${perf.heat()}, battery ${perf.batteryText()}.`);
    test = null;
    render();
  }

  function startTest() {
    const d = getDetection();
    perf.reset();
    lines.length = 0;
    addLog('Drive Sentry detection test');
    addLog(`Version ${VERSION} (${BUILD_LABEL})`);
    addLog(`Source: ${isFileMode() ? 'video file ' + getFileName() : 'live camera'}`);
    const cam = $('#cam');
    addLog(`Engine: ${d.backend || '–'}, model ${DETECT.models[d.model] ? DETECT.models[d.model].label : '–'}, load ${d.loadMs ? (d.loadMs / 1000).toFixed(1) + ' s' : '–'}`);
    addLog(`Camera: ${getSettings().camera} setting, picture ${cam.videoWidth}x${cam.videoHeight}`);
    addLog(`Screen: ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`);
    addLog(`Heat sensor: ${perf.heat() === 'unavailable' ? 'not available' : 'available'}. Battery at start: ${perf.batteryText()}`);
    if (d.phase !== 'running' && d.phase !== 'slow') addLog(`Note: detection is ${d.phase}${d.reason ? ' (' + d.reason + ')' : ''}.`);
    addLog('time   per-sec  lowest  total  grab  prep  model  post  boxes  heat     battery');
    test = { start: performance.now(), timer: null };
    test.timer = setInterval(() => {
      const elapsed = performance.now() - test.start;
      const w = perf.takeWindow();
      const n = (v, wd) => String(Math.round(v)).padStart(wd);
      addLog(`${mmss(elapsed)}  ${fix(w.fps).padStart(6)}  ${String(w.min == null ? '–' : w.min).padStart(6)}  ` +
        `${n(w.msAvg, 5)}  ${n(w.stage.grab, 4)}  ${n(w.stage.prep, 4)}  ${n(w.stage.infer, 5)}  ${n(w.stage.post, 4)}  ` +
        `${fix(w.boxesAvg).padStart(5)}  ${perf.heat().padEnd(8)} ${perf.batteryText()}`);
      if (elapsed >= TEST_RUN.totalMs) stopTest('Test complete.');
    }, TEST_RUN.logEveryMs);
    perf.takeWindow(); // start the first window now
    render();
  }

  runBtn.addEventListener('click', () => { if (test) stopTest('Stopped by you.'); else startTest(); });
  $('#btn-dt-reset').addEventListener('click', () => { perf.reset(); render(); });
  fileBtn.addEventListener('click', () => { if (isFileMode()) onExitFile(); else input.click(); });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (file) onPickFile(file);
  });
  $('#btn-dt-copy').addEventListener('click', async () => {
    if (!logEl.value) { toast('Nothing to copy yet'); return; }
    try {
      await navigator.clipboard.writeText(logEl.value);
      toast('Log copied');
    } catch {
      logEl.focus();
      logEl.select();
      toast('Select the text and copy it');
    }
  });
  $('#btn-dt-close').addEventListener('click', () => { stopTest('Left the test screen.'); clearInterval(renderTimer); onClose(); });

  return {
    open() {
      perf.reset();
      render();
      clearInterval(renderTimer);
      renderTimer = setInterval(render, 500);
    },
    // Called when detection changes state, so failures show up in the log.
    noteState(s) {
      if (test && s.phase === 'failed') addLog(`Detection failed: ${s.reason}`);
      if (test && s.phase === 'slow') addLog('Detection is running slowly.');
    },
    refresh: render,
  };
}
