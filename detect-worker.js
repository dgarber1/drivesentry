// Runs the AI model off the main thread so the screen stays smooth.
// Plain (classic) worker: loads ONNX Runtime Web from the CDN, then the model from this site.
/* global ort, Postprocess */
importScripts('postprocess.js');

let session = null;
let inputName = '';
let outputName = '';
let size = 416;
let canvas = null;
let ctx = null;
let floatBuf = null;

function describe(err) {
  if (err == null) return 'unknown error';
  if (typeof err === 'number') return 'engine error code ' + err;
  return err.message || String(err);
}

async function runModel() {
  const tensor = new ort.Tensor('float32', floatBuf, [1, 3, size, size]);
  const out = await session.run({ [inputName]: tensor });
  return out[outputName];
}

async function init(m) {
  const t0 = performance.now();
  size = m.inputSize;

  try {
    importScripts(m.ortBase + 'ort.webgpu.min.js');
  } catch (e) {
    throw new Error('Could not load the AI library. Check your internet connection. (' + describe(e) + ')');
  }
  ort.env.wasm.wasmPaths = m.ortBase;
  ort.env.wasm.numThreads = 1;   // GitHub Pages cannot enable multi-threading
  ort.env.wasm.proxy = false;    // already in a worker

  let res;
  try {
    res = await fetch(m.modelUrl);
  } catch (e) {
    throw new Error('Could not download the model file ' + m.modelName + '. (' + describe(e) + ')');
  }
  if (!res.ok) {
    throw new Error('Model file ' + m.modelName + ' was not found (HTTP ' + res.status +
      '). Upload it to your GitHub repository next to index.html.');
  }
  const bytes = new Uint8Array(await res.arrayBuffer());

  let backend = '';
  let lastErr = null;
  const tries = [];
  if ('gpu' in self.navigator) tries.push(['WebGPU', ['webgpu']]);
  tries.push(['WASM', ['wasm']]);
  for (const [name, providers] of tries) {
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: providers, graphOptimizationLevel: 'all' });
      backend = name;
      break;
    } catch (e) {
      lastErr = e;
      session = null;
    }
  }
  if (!session) throw new Error('Could not start the AI engine. (' + describe(lastErr) + ')');

  inputName = session.inputNames[0];
  outputName = session.outputNames[0];
  canvas = new OffscreenCanvas(size, size);
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  floatBuf = new Float32Array(3 * size * size);
  floatBuf.fill(114);
  await runModel(); // warm-up, so the first real frame is not slow

  self.postMessage({ type: 'ready', backend, loadMs: Math.round(performance.now() - t0) });
}

async function detect(m) {
  const t0 = performance.now();
  const bw = m.bitmap.width;
  const bh = m.bitmap.height;

  // Letterbox: picture at the top-left, gray (114) padding elsewhere, like YOLOX expects.
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(m.bitmap, 0, 0);
  m.bitmap.close();
  const px = ctx.getImageData(0, 0, size, size).data;

  // YOLOX wants blue, green, red order, values 0 to 255, no other scaling.
  const plane = size * size;
  for (let i = 0, j = 0; i < plane; i++, j += 4) {
    floatBuf[i] = px[j + 2];
    floatBuf[plane + i] = px[j + 1];
    floatBuf[2 * plane + i] = px[j];
  }
  const t1 = performance.now();

  const out = await runModel();
  const t2 = performance.now();

  const detections = Postprocess.process(out.data, out.dims, size, bw, bh, m.minScore);
  const t3 = performance.now();

  self.postMessage({
    type: 'result',
    id: m.id,
    detections,
    timing: { prep: t1 - t0, infer: t2 - t1, post: t3 - t2, total: t3 - t0 },
  });
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') await init(m);
    else if (m.type === 'detect') await detect(m);
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: describe(err) });
  }
};
