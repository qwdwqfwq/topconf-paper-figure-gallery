# Step 3 durable image jobs

Reuses the existing Cloudflare account and GitHub Pages application. This worker
owns the long image request so closing a tab does not cancel generation. The
browser stores a random task ID before submission and reuses that ID after a lost
acknowledgement. A Durable Object claims a task before making exactly one upstream
generation request. Repeated PUTs and GETs never generate another image.

Image responses are persisted before download/normalization. Result-download
failures retry the download only. Results and encrypted credentials expire after
24 hours; expired IDs remain tombstoned so they cannot replay a paid request.
Credentials use AES-GCM with the `JOB_ENCRYPTION_KEY` Worker secret and are not
included in logs, responses, repository files or browser task records. Access to
a task requires the original API key. Observability is disabled.

If the upstream connection itself is lost before a response can be persisted,
the task is marked unknown and never automatically submitted again. There is no
invented upstream task-lookup API. The UI preserves the ID and requires the user
to check the original task before explicitly clearing it. This prevents automatic
duplicate billing; it cannot recover an image the upstream never delivered.

The allowlist covers the existing Infistar, OpenAI and NoneLinear Step 3 routes.
OpenAI reference images use multipart edits; Gemini uses native contents and
imageConfig. Shared API/size modules and the Step 4 implementation are unchanged.

Deploy from this directory with `wrangler deploy`. Provision a random 32-byte
base64 `JOB_ENCRYPTION_KEY` using `wrangler secret put` before first use; do not
rotate it while jobs remain active. `wrangler.jsonc` contains the Durable Object
binding, SQLite migration and allowed gallery origin. No provider key is deployed.

Run the offline checks from the repository root:

```
node --test forge/test-step3-image-capabilities.mjs forge/test-step3-image-protocol.mjs forge/test-step3-infistar-job.mjs infistar-image-relay/test-worker.mjs infistar-image-relay/test-image-result.mjs
node forge/test-step3-image-capabilities-browser.cjs
node forge/test-step3-image-recovery-browser.cjs
```

Real API tests are separately authorized and kept outside the public repository.

The overseas Worker selects Infistar's documented international image gateway
(https://infistar.ai/v1) before the only image-generation POST. It never falls
back to another host after submission. Native Gemini keeps its working route.
Gateway 5xx responses remain uncertain tasks and never trigger a new POST.
Gateway reference: https://doc.infistar.cc/integration-guides/gateway-config

## Long GPT requests and hosting capacity

GPT image requests use the account's Browser Run binding. A single headless
browser performs the single generation POST; its connection stays active while
the Durable Object persists the response. This avoids depending on the user's
proxy, tab lifetime, or the shorter ordinary Worker HTTP gateway wait. Native
Gemini retains its streaming Worker transport. Browser sessions close in finally.

Browser acquisition/navigation happens before the durable upstream claim. When
capacity is unavailable the task stays queued with zero upstream attempts and a
bounded backoff; it does not lose the encrypted input or issue a paid request.
Once a POST starts, an uncertain result never causes another generation POST.

Browser Run has account-level time and concurrency quotas. Confirm the production
account plan and capacity before enabling this frontend for users: the free
allowance (10 browser minutes/day) is too small for routine multi-minute image
generation. Capacity queues do not create additional quota. Consult the current
pricing at https://developers.cloudflare.com/browser-run/pricing/ and configure
usage monitoring in the hosting account. No subscription change is automated by
this repository or release workflow.
