# Nano Banana 2.1 ordinary endpoint contract

Owner authorization, 2026-11-15: restore Nano Banana 2.1 ordinary transport and
synchronize the Worker only. Prompts, protection outside the selection, image
parameters and editable/export pipelines stay frozen.

For Infistar's exact `gemini-nano-banana-2.1` model, start directly with native
`/v1beta/models/gemini-nano-banana-2.1:generateContent`. Do not first probe
`streamGenerateContent`, use OpenAI chat, or obey a stale streaming cache record.
The policy lives in `forge/step3-image-compat.mjs` and is imported by both browser
and Worker. Other providers/models retain their existing behavior.

The overseas Worker selects `infistar.ai` before its sole upstream POST when
this exact native Nano Banana route arrives with `infistar.cc` or
`www.infistar.cc`. Preserve the path, query, request body and Key. This fixes
the omitted international gateway selection that left native Nano requests
on the domestic host and produced upstream HTTP 522. Do not replay a failed
paid request against another host. Other native Gemini models retain their
existing routing.

Live verification on 2026-11-15 used the frontend job client and deployed
Worker, with `gemini-nano-banana-2.1`, ordinary `generateContent`, `16:9` and
`4K`. Task `2f0e265a-34d9-47a2-b9c4-8e15e7e889d9` succeeded with upstream
HTTP 200 and one upstream attempt in 53,546 ms. The returned PNG contains
11,896,218 bytes and measures 5504 by 3072 pixels. Worker version:
`9c31ac86-8f67-4b51-a79b-877fce4297fe`. This deployment changed only the
Worker gateway selection; it did not publish frontend or Step 4 files.

Any future change to streaming, negotiation or deployment must retain this
contract and run `forge/test-step3-nano-banana-ordinary.mjs` plus
`infistar-image-relay/test-worker.mjs`. The existing stream suite imports the
Nano regression suite; a separate CI guard runs on pushes and pull requests.
Deploy both the frontend module and the bundled Worker whenever this shared
transport changes. Never publish the entire repository over a narrow live
artifact: derive the artifact from the last deployed byte proof and permit
only the authorized file replacements.
