// Rear camera, plus checks that the picture is really there.
// Statuses: idle | starting | ok | blocked | frozen | denied | nocamera | inuse | error
const QUALITY = { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080] };

function constraints(quality) {
  const [width, height] = QUALITY[quality] || QUALITY['720p'];
  return {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 30, max: 30 },
    },
  };
}

const SAMPLE_W = 32;
const SAMPLE_H = 18;
const TICKS_TO_FLAG = 3;     // about 3 seconds of a bad picture before we say so
const TICKS_TO_CLEAR = 2;

export async function cameraPermission() {
  try {
    const result = await navigator.permissions.query({ name: 'camera' });
    return result.state; // granted | prompt | denied
  } catch {
    return 'prompt';
  }
}

function mapError(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'nocamera';
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') return 'inuse';
  return 'error';
}

export function createCamera(video, onChange, getQuality = () => '720p') {
  let stream = null;
  let timer = null;
  let status = 'idle';
  let lastTime = -1;
  let frozenTicks = 0;
  let badTicks = 0;
  let goodTicks = 0;
  const sample = { mean: 0, spread: 0 };

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  function set(next) {
    if (next === status) return;
    status = next;
    onChange({ status, sample });
  }

  async function open() {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints(getQuality()));
    } catch (err) {
      if (err && (err.name === 'OverconstrainedError' || err.name === 'TypeError')) {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      throw err;
    }
  }

  function release() {
    clearInterval(timer);
    timer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }

  function tick() {
    if (!stream || document.hidden) return;
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') { set('error'); return; }
    if (video.readyState < 2) return;

    // Is the picture still moving?
    const t = video.currentTime;
    frozenTicks = Math.abs(t - lastTime) < 0.001 ? frozenTicks + 1 : 0;
    lastTime = t;

    // Is the picture covered or black? Look at a tiny copy of the frame.
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const px = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const n = SAMPLE_W * SAMPLE_H;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < px.length; i += 4) {
      const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      sum += y;
      sumSq += y * y;
    }
    const mean = sum / n;
    const spread = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    sample.mean = mean;
    sample.spread = spread;

    if (frozenTicks >= TICKS_TO_FLAG) { set('frozen'); return; }

    const covered = spread < 3 || (mean < 8 && spread < 6);
    if (covered) {
      goodTicks = 0;
      badTicks += 1;
      if (badTicks >= TICKS_TO_FLAG) set('blocked');
    } else {
      badTicks = 0;
      goodTicks += 1;
      if (goodTicks >= TICKS_TO_CLEAR && (status === 'blocked' || status === 'frozen')) set('ok');
    }
  }

  // Returns true when the camera is running.
  async function start() {
    release();
    badTicks = goodTicks = frozenTicks = 0;
    lastTime = -1;
    set('starting');
    try {
      stream = await open();
    } catch (err) {
      stream = null;
      set(mapError(err));
      return false;
    }
    video.srcObject = stream;
    try { await video.play(); } catch { /* muted video should autoplay anyway */ }
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => set('error'));
    track.addEventListener('mute', () => set('frozen'));
    track.addEventListener('unmute', () => { if (status === 'frozen') set('ok'); });
    timer = setInterval(tick, 1000);
    set('ok');
    return true;
  }

  // Call when the app comes back to the foreground.
  function recover() {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') start();
  }

  return {
    start,
    recover,
    stop: () => { release(); set('idle'); },
    getStatus: () => status,
    sample,
  };
}
