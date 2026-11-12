// Step 3 SVG only. Deliberately independent of bitmap/shared request helpers.
const transient = new Set(['upstream_timeout','incomplete_stream','empty_completion','invalid_svg','invalid_stream','network_error','timeout']);
const retryStatus = new Set([408,500,502,503,504,524]);
function failure(message, code, retryable=false) {
  return Object.assign(new Error(message), {code, retryable});
}
function upstreamError(data) {
  if (!data || typeof data !== 'object') return;
  const e = data.error ?? (data.type === 'error' ? data : null);
  if (!e) return;
  const message = typeof e === 'string' ? e : String(e.message || '模型服务返回错误');
  const code = e.code ?? (/timed?\s*out|timeout/i.test(message) ? 'upstream_timeout'
    : e.type === 'upstream_stream_error' && /connection interrupted/i.test(message) ? 'network_error' : 'upstream_error');
  const details = [code, e.attempts && `attempts=${e.attempts}`, (e.request_id || data.request_id) && `request_id=${e.request_id || data.request_id}`].filter(Boolean).join(', ');
  throw failure(`${message} (${details})`, code, transient.has(code) || retryStatus.has(Number(code)));
}
function textContent(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.filter(p => p && typeof p === 'object' && (p.type === 'text' || p.type === 'output_text') && typeof p.text === 'string').map(p => p.text).join('');
}
export function completeStep3Svg(raw, parseXML) {
  if (typeof raw !== 'string' || !raw.trim()) throw failure('模型未返回 SVG 内容', 'empty_completion', true);
  // Use the last closing tag so nested SVG elements are retained. XML parsing
  // rejects multiple roots, unmatched tags and incomplete outer SVG elements.
  const start = raw.search(/<svg\b/i);
  const closing = [...raw.matchAll(/<\/svg\s*>/gi)].at(-1);
  const end = closing?.index ?? -1;
  if (start < 0 || end < start) throw failure('SVG 尚未完整返回，请重试', 'incomplete_stream', true);
  // Retain the existing SVG-only handling of decorative XML comments.
  const code = raw.slice(start, end + closing[0].length).replace(/<!--[\s\S]*?-->/g,'');
  const doc = parseXML(code);
  if (!doc?.documentElement || doc.documentElement.localName !== 'svg' || doc.querySelector('parsererror')) {
    throw failure('模型返回的 SVG XML 不完整或无效', 'invalid_svg', true);
  }
  return {code, truncated:false};
}
async function readCompletion(response) {
  if (!response.ok) {
    // Do not echo response bodies that can contain credentials from proxies.
    await response.body?.cancel().catch(()=>{});
    throw failure(`模型服务 HTTP ${response.status}`, response.status, retryStatus.has(response.status));
  }
  if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
    let data;
    try { data = await response.json(); } catch { throw failure('模型服务返回无效 JSON', 'invalid_stream', true); }
    upstreamError(data);
    const choice = Array.isArray(data?.choices) ? data.choices.find(c => c && typeof c === 'object' && (c.index == null || c.index === 0)) : null;
    if (!choice) throw failure('模型未返回 SVG 内容', 'empty_completion', true);
    if ('finish_reason' in choice && choice.finish_reason !== 'stop') {
      throw failure(`SVG 生成未完成 (${choice.finish_reason ?? 'missing finish_reason'})`, 'incomplete_stream', choice.finish_reason !== 'content_filter');
    }
    return textContent(choice.message?.content);
  }
  if (!response.body) throw failure('模型服务返回空响应流', 'empty_completion', true);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer='', content='', finish, done=false;
  function event(block) {
    const payload = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!payload) return; // SSE comments/relay heartbeat.
    if (payload.trim() === '[DONE]') { done=true; return; }
    let data;
    try { data=JSON.parse(payload); } catch { throw failure('模型服务返回无效流数据', 'invalid_stream', true); }
    upstreamError(data);
    if (!Array.isArray(data?.choices)) return;
    for (const choice of data.choices) {
      if (!choice || typeof choice !== 'object' || (choice.index != null && choice.index !== 0)) continue;
      // Null tool calls/usage/deltas are legal; only SVG text is relevant here.
      content += textContent(choice.delta?.content ?? choice.message?.content);
      if (choice.finish_reason != null) finish=choice.finish_reason;
    }
  }
  try {
    while (!done) {
      const part = await reader.read();
      buffer += decoder.decode(part.value, {stream:!part.done});
      buffer = buffer.replace(/\r\n/g,'\n');
      let boundary;
      while (!done && (boundary=buffer.indexOf('\n\n')) !== -1) {
        event(buffer.slice(0,boundary)); buffer=buffer.slice(boundary+2);
      }
      if (part.done) { if (!done && buffer.trim()) event(buffer); break; }
    }
    if (finish !== 'stop') throw failure(`SVG 响应中断或未完成 (${finish ?? 'missing finish_reason'})`, 'incomplete_stream', finish !== 'content_filter');
    return content;
  } finally {
    // Also close a connection that remains open after [DONE] or an error.
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
function delay(ms, signal) {
  return new Promise((resolve,reject)=>{
    const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};
    const timer=setTimeout(finish,ms);
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason || new DOMException('Aborted','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) abort();
  });
}
export async function requestStep3Svg({base,modelBody,key,parseXML,signal,onRetry=()=>{},fetchImpl=globalThis.fetch,sleep=delay,maxAttempts=3,attemptTimeoutMs=600000}) {
  if (typeof parseXML !== 'function') throw new TypeError('parseXML is required');
  // Explicit streaming bypasses relay buffered-chat aggregation and its nested
  // retries. Each retry preserves the complete original prompt and references.
  const body=JSON.stringify({...modelBody,stream:true});
  for (let attempt=1; attempt<=maxAttempts; attempt++) {
    signal?.throwIfAborted();
    const controller=new AbortController();
    const abort=()=>controller.abort(signal.reason);
    signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(failure('SVG 请求等待超时', 'timeout', true)),attemptTimeoutMs);
    try {
      const response=await fetchImpl(base.replace(/\/+$/,'')+'/chat/completions', {
        method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body,signal:controller.signal
      });
      const raw=await readCompletion(response);
      return completeStep3Svg(raw,parseXML);
    } catch (caught) {
      if (signal?.aborted) throw signal.reason || caught;
      let error=controller.signal.aborted ? controller.signal.reason : caught;
      if (error instanceof TypeError) error=failure('SVG 请求连接中断', 'network_error', true);
      if (!error.retryable || attempt===maxAttempts) {
        error.message+=`；SVG 未生成，未显示不完整结果（本次尝试 ${attempt}/${maxAttempts}）`;
        throw error;
      }
      onRetry({attempt,nextAttempt:attempt+1,maxAttempts,error});
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort',abort);
    }
    await sleep(1000 * 2**(attempt-1),signal);
  }
  throw new RangeError('maxAttempts must be positive');
}
