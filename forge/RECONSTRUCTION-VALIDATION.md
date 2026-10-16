# Quality-first reconstruction validation (2026-10-16)

Full-image reconstruction retains its complete scene prompt on every attempt. Each request defaults to 15 minutes (configurable from 1 to 60 in the page), with up to two retries. Persistent image/model/endpoint/context-keyed caches retain the scene and completed crop IDs for seven days, up to three sessions; credentials are excluded.

Local refinement uses three shared queue slots, disjoint existing IDs, and whole-object crop bounds. Timed-out or truncated requests split their ID batches after retries (maximum three subdivision levels). Exhausted requests preserve the global scene and remain resumable. Full-image omission auditing registers new IDs centrally; local responses cannot allocate IDs or change transcribed text. Quality-regressing patches are discarded.

Validated:
- `node forge/test-reconstruction-core.mjs`: identity preservation, text deduplication, cross-boundary geometry, font drift rejection, central omission deduplication, distinct paths and nested details.
- `node forge/test-editable-export.mjs`: editable export regression suite.
- `node forge/test-reconstruction-browser.cjs`: actual peak concurrency three; 900-second configured timeout and retry; timeout subdivision; isolated failed leaf and cache resume; persistent cache across reload; duplicate omission proposals; SVG/PPTX/VSDX/draw.io exports.
- `CATALOG_REPLAY=1` with `forge/test-precision-import.cjs`: existing CDTA sample retains all 287 objects, including 46 text boxes and 17 images. Serialized PPTX layout audit passes.
- Native Microsoft PowerPoint render: all 46 labels matched; no text pairs with intersection exceeding 35% of the smaller glyph box; maximum exported font-size deviation 0.9941% from the scene.

Limits: API responses were deterministic fixtures, not a live Vision model benchmark. The sample still has image/crop and visual fidelity defects and is correctly marked `needs-review`. These checks verify orchestration, object retention and export behavior; they do not certify publication-ready reconstruction. Native rendering artifacts and metrics are in local `work/` and are not shipped.
