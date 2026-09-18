# Vendored, on purpose

Tesseract.js, pinned and kept in the repo rather than loaded from a CDN, so that
receipt photos are read on the phone and nothing leaves the device. See **Reading
receipts** in `BRIEF.md` for why this is the one dependency.

| File | From | Version |
|---|---|---|
| `tesseract.min.js` | npm `tesseract.js` (dist) | 7.0.0 |
| `worker.min.js` | npm `tesseract.js` (dist) | 7.0.0 |
| `tesseract-core-simd-lstm.wasm.js` | npm `tesseract.js-core` | 7.0.0 |
| `tesseract-core-lstm.wasm.js` | npm `tesseract.js-core` | 7.0.0 |
| `eng.traineddata.gz` | npm `@tesseract.js-data/eng` (`4.0.0_best_int`) | 1.0.0 |

Two cores: the SIMD build is used where the browser supports it, the plain one
otherwise. Only one is ever downloaded. The LSTM-only builds and the matching
`_best_int` training data are the small pair — the legacy engine is not used.

Nothing here is in the service worker's `SHELL`. It downloads on first use only,
and `sw.js` then serves it from cache without re-fetching, because these files
never change without a version bump here.

To update: `npm pack tesseract.js@<v> tesseract.js-core@<v> @tesseract.js-data/eng`,
copy the same files across, update this table, and bump `CACHE` in `sw.js`.
