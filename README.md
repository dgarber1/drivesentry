# Drive Sentry (web prototype)

Phase 2, build 2: camera shell plus AI vehicle detection (YOLOX). No lane detection or alerts yet.

All files live in one flat folder on purpose, so they can be uploaded from a phone.

## Model files (not included, you add them)
From the YOLOX releases page (Megvii-BaseDetection/YOLOX, release 0.1.1rc0) download
`yolox_tiny.onnx` (about 20 MB) and `yolox_nano.onnx` (a few MB) and upload them next to `index.html`.
Keep the names exactly. YOLOX is Apache-2.0 licensed.
Switch between them on the Detection test screen (Settings, then Detection test).
If you ever replace a model file, change `?v=1` to `?v=2` in `config.js` (DETECT.models).

## Updating later
Bump the version in `config.js` (VERSION and BUILD_LABEL) and the CACHE name in `sw.js`
on every upload. The version shows on the first screens and in Settings.
