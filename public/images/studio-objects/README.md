# Studio step visuals

Premium 3D renders used in the project studio hero, one per step. Sourced from
[3dicons.co](https://3dicons.co) (CC0 — public domain, no attribution required),
downloaded at the 400px "dynamic" angle, "color" style. The CDN only serves these
flattened onto a solid white background (no alpha channel), so each was reprocessed
locally: a border-connected flood fill turns the white/near-white background transparent
(interior near-white pixels, e.g. book pages, are untouched since they aren't connected
to the border), then the canvas is auto-trimmed to the object's bounding box.

Filenames carry a "-v2" suffix: the first cutout shipped under the plain names, and once it was
fixed in place under those same names, browsers that had already loaded the page kept serving the
stale (white-matte) bitmap from cache. New filenames were the reliable way to force a fresh fetch.

- notebook: https://3dicons.co/icons/628100-notebook (step 1 — The big idea)
- chat-bubble: https://3dicons.co/icons/eec43d-chat-bubble (step 2 — People & process)
- cube: https://3dicons.co/icons/4f52f8-cube (step 3 — Under the hood)
- camera: https://3dicons.co/icons/5656e5-camera (step 4 — Show your work)
- chart: https://3dicons.co/icons/4a4275-chart (step 5 — What it took)
- folder: https://3dicons.co/icons/176980-folder (step 6 — This chapter)
