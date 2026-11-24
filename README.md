# Drive Sentry (web prototype)

Phase 2: camera shell plus AI vehicle detection (YOLOX-Tiny). No lane detection or alerts yet.

All files live in one flat folder on purpose, so they can be uploaded from a phone.

## The model file (not included, you add it)
Download `yolox_tiny.onnx` from the YOLOX releases page (Megvii-BaseDetection/YOLOX, release 0.1.1rc0)
and upload it to the repository next to `index.html`. Keep the name exactly `yolox_tiny.onnx`.
YOLOX is Apache-2.0 licensed. If you ever replace the file, change `?v=1` to `?v=2` in
`config.js` (DETECT.modelUrl) so phones fetch the new one.

## Updating later
Bump the version in `config.js` (VERSION and BUILD_LABEL) and the CACHE name in `sw.js`
on every upload. The version shows on the first screens and in Settings.
