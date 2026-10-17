# FigureForge workflow protection

The repository owner has locked the current Step 3 (bitmap generation) and Step 4 (editable reconstruction and export) workflows. Do not change their prompts, model calls, routing, timeouts, retries, catalog/region logic, node handling, reconstruction, export, or supporting code without the owner's explicit consent in the current conversation. This also applies to changing the lock manifest or its checker.

The protected baseline is recorded in `.github/forge-workflow-lock.json`. Run `node scripts/check-forge-workflow-lock.mjs` before submitting changes. The deployment workflow also runs this check. If a requested change needs to alter protected files, get explicit owner approval for that specific change before updating the baseline.

This rule is about the FigureForge implementation. README text and the example images in `docs/figureforge-examples/` may be edited without changing that implementation.
