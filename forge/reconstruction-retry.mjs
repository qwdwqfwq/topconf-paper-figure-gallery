// Transport failures have a separate budget from malformed scene responses.
// Never infer an HTTP status from arbitrary provider text or a request ID.
export function reconstructionHttpError(response, message) {
  const error = new Error(message);
  error.status = response.status;
  const value = response.retryAfter;
  const seconds = value == null || value === '' ? NaN : Number(value);
  error.retryAfterMs = Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - Date.now()) || 0;
  return error;
}

export function reconstructionRetryDelay(error, attempt, formatAttempts = 1) {
  if (error?.visionTimeout || attempt >= 3) return null;
  if (Number.isInteger(error?.status)) {
    if (![408, 429, 500, 502, 503, 504].includes(error.status)) return null;
    // Honor provider backoff, bounded so a bad header cannot stall the UI.
    return Math.min(60000, Math.max(error.retryAfterMs || 0, 2000 * 2 ** (attempt - 1)));
  }
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))
    return 2000 * 2 ** (attempt - 1);
  return attempt < formatAttempts ? 1000 * 2 ** (attempt - 1) : null;
}

export function reconstructionFailureMessage(error, attempts, zh = true) {
  if (![408, 429, 500, 502, 503, 504].includes(error?.status)) return error?.message;
  return zh
    ? `HTTP ${error.status}: 重建服务暂时不可用，已请求 ${attempts} 次。原图仍保留，请稍后重试，或在模型设置中选择其他可用的视觉模型。详情：${error.message}`
    : `HTTP ${error.status}: Reconstruction service unavailable after ${attempts} attempts. Your original image is preserved. Retry later or select another available vision model. Details: ${error.message}`;
}
