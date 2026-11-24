// The Detection test screen: live numbers, a 20-minute test with a copyable log,
// and a way to run a recorded video through the detector.
import { TEST_RUN, VERSION, BUILD_LABEL } from './config.js';

const $ = (selector) => document.querySelector(selector);
const pad = (n) => String(n).padStart(2, '0');
const mmss = (ms) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
const fix = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : v.toFixed(d));

export function initDetTest({ perf, getDetection, isFileMode, getFileName, onPickFile, onExitFile, onClose, toast }) {
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
    $('#dt-engine').textContent = d.phase === 'failed' ? `Failed: ${d.reason}`
      : d.backend ? d.backend : d.phase === 'loading' ? 'Loading…' : '–';
    $('#dt-load').textContent = d.loadMs ? `${(d.loadMs / 1000).toFixed(1)} s` : '–';
    $('#dt-fps').textContent = s.total ? `${fix(s.fpsNow)} per second` : '–';
    $('#dt-avg').textContent = s.total ? `${fix(s.fpsAvg)} / ${s.fpsMin == null ? '–' : s.fpsMin}` : '–';
    $('#dt-ms').textContent = s.total ? `${Math.round(s.msAvg)} ms (model ${Math.round(s.modelMsAvg)} ms)` : '–';
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
      `${Math.round(s.msAvg)} ms per detection, heat ${perf.heat()}, battery ${perf.batteryText()}.`);
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
    addLog(`Engine: ${d.backend || '–'}, model load ${d.loadMs ? (d.loadMs / 1000).toFixed(1) + ' s' : '–'}`);
    addLog(`Screen: ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`);
    addLog(`Heat sensor: ${perf.heat() === 'unavailable' ? 'not available' : 'available'}. Battery at start: ${perf.batteryText()}`);
    if (d.phase !== 'running' && d.phase !== 'slow') addLog(`Note: detection is ${d.phase}${d.reason ? ' (' + d.reason + ')' : ''}.`);
    addLog('time   per-sec  lowest  ms    boxes  heat     battery');
    test = { start: performance.now(), timer: null };
    test.timer = setInterval(() => {
      const elapsed = performance.now() - test.start;
      const w = perf.takeWindow();
      addLog(`${mmss(elapsed)}  ${fix(w.fps).padStart(6)}  ${String(w.min == null ? '–' : w.min).padStart(6)}  ` +
        `${String(Math.round(w.msAvg)).padStart(4)}  ${fix(w.boxesAvg).padStart(5)}  ${perf.heat().padEnd(8)} ${perf.batteryText()}`);
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
