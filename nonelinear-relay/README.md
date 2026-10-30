# NoneLinear gallery relay

Default API base: `https://gallery-nonelinear-relay.lixiao-gallery.workers.dev/v1`.
The browser supplies each visitor's own key. No shared API key is stored here.

For JSON `/v1/images/generations` requests, base64 `image` references are uploaded
to NoneLinear's official `https://nonelinear.com.cn/api/upload-file` endpoint
using that request's authorization. The returned HTTPS URLs replace the image
references, in order. Model, prompt, size, aspect ratio and other fields remain
unchanged. Existing HTTPS references pass through. An upload failure stops the
generation; there is no automatic retry of a billable generation.

Only this dedicated provider's generation adapter is changed. Chat, image edits,
other providers, the gallery frontend and Step 4 exports are unchanged.

Run from the repository root:

```sh
node nonelinear-relay/test-worker.mjs
node nonelinear-relay/test-references.mjs
node scripts/check-forge-workflow-lock.mjs
```

Deploy from this directory with `npx wrangler deploy` using Cloudflare login.
Do not add API keys to the config, code or logs.

Verified 2026-10-30 against the deployed relay: three real gallery JPEG references,
`gemini-3.1-flash-image-preview`, `size=4K`, `aspect_ratio=16:9`, HTTP 200, decoded
JPEG 5504 × 3072. Worker version: `3243b1c4-6364-43b6-af20-6bfdf060aca2`.

Provider reference: https://docs.nonelinear.com/skills/nonelinear-image
