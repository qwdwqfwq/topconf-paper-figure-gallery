# Step 4 historical baseline reconciliation

Before this operation: `e222c594fbb19bf953aa9e382ee5feb437b07482`.
Requested historical baseline: `09a60b5fd3edcb5dcb5f9f8fc13b5fe712818abb`.

Evidence: the original delivery report in `figure_rebuild_20261014/output/复刻流程与FigureForge第四步对照.md` identifies `09a60b5`. That delivery's hand-measured scene is not evidence of automatic reconstruction fidelity.

Audit against the historical commit:
- `forge/reconstruction-core.mjs` is already identical.
- Step 4 prompts, catalog, crop/repair planning, geometry materialization, deduplication and repair acceptance already match the requested baseline.
- Preserve current explicit line breaks, per-line font measurement/height, multiline calibration bypass and PPTX paragraph spacing.
- Preserve current reasoning settings, request timeouts, success wording, Step 3 ratio/resolution and image-size-based export canvases.
- Session logic matches except its cache namespace. Rename the misleading previous rollback label to `baseline-09a60b5-text-v2`; update module URLs and service-worker cache so old sessions are rebuilt once.

This operation changes only version/cache identity and this audit record; no reconstruction algorithm or text behavior is rewritten. Missing line breaks in recognition output are still not inferred by the existing text fix.

Validation results are recorded after running the native export, core, image request/dimension and browser reconstruction tests. Browser API responses are mocked; these tests do not establish live-model visual fidelity.

Validation completed: test-editable-export.mjs, test-reconstruction-core.mjs, test-image-api.mjs and test-reconstruction-browser.cjs all passed. git diff --check passed.
