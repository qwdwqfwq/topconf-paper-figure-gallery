// TEMPORARY 2026-11-19: bypass the Tencent ingress while ICP filing is pending.
// Restore Tencent routing by setting this and temporaryInfistarDirect in
// nonelinear-config.js to false after ingress verification.
// Existing uncertain direct calls must still never be automatically replayed.
export const TEMPORARY_INFISTAR_DIRECT=true;
