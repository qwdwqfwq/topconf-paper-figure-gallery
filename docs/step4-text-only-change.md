# Step 4 text-only correction

Baseline before changes: `2b77d08f7dd5593d44b2683a1efea275004e5d52`.

Scope: preserve recognized line breaks; measure the longest individual line; cap size against per-line height; skip multiline labels in the existing single-line pixel calibrator; specify multiline PowerPoint leading.

No changes to model requests, prompts, crops, object catalog, geometry, deduplication, reconstruction core, or Step 3. Missing line breaks in model output are not inferred. A text layout cache discriminator prevents reuse of old flattened scenes; the first reconstruction after this update makes a fresh request.

Rollback: restore only the text changes from this commit against the baseline; do not reset the entire repository.

Validation: native PPTX/VSDX multiline export smoke test, reconstruction-core regression, and browser reconstruction regression all passed. Browser tests cover two/three-line labels retaining 22px, the multiline calibration bypass, catalog/crop flow, concurrency, timeout recovery, cache resume and four export formats. Requests are mocked; no live-model or PowerPoint visual fidelity claim is made.

Diff audit: reconstruction-core.mjs, reconstruction-session.mjs, model prompts and Step 3 code are unchanged. Only text normalization/sizing, multiline calibration eligibility and PPTX paragraph spacing change behavior; asset/cache versions ensure the correction is loaded.
