# Nano Banana 2.1 ordinary endpoint contract

Owner authorization, 2026-11-15: restore Nano Banana 2.1 ordinary transport and
synchronize the Worker only. Prompts, protection outside the selection, image
parameters and editable/export pipelines stay frozen.

For Infistar's exact `gemini-nano-banana-2.1` model, start directly with native
`/v1beta/models/gemini-nano-banana-2.1:generateContent`. Do not first probe
`streamGenerateContent`, use OpenAI chat, or obey a stale streaming cache record.
The policy lives in `forge/step3-image-compat.mjs` and is imported by both browser
and Worker. Other providers/models retain their existing behavior.

Any future change to streaming, negotiation or deployment must retain this
contract and run `forge/test-step3-nano-banana-ordinary.mjs` plus
`infistar-image-relay/test-worker.mjs`. The existing stream suite imports the
Nano regression suite; a separate CI guard runs on pushes and pull requests.
Deploy both the frontend module and the bundled Worker whenever this shared
transport changes. Never publish the entire repository over a narrow live
artifact: derive the artifact from the last deployed byte proof and permit
only the authorized file replacements.
