// Explicit streaming callers receive heartbeats even before upstream headers.
// Complete SSE events are forwarded unchanged; no image/prompt transformation.
export function waitingSSE(pending, headers, heartbeatMs = 10000) {
  const encoder = new TextEncoder();
  let reader, timer, cancelled = false;
  const body = new ReadableStream({
    async start(controller) {
      const emit = text => { if (!cancelled) controller.enqueue(encoder.encode(text)); };
      const failure = (message, code) => emit('data: ' + JSON.stringify({error: {message, type: 'upstream_stream_error', ...(code ? {code} : {})}}) + '\n\n');
      emit(': relay connected\n\n');
      timer = setInterval(() => emit(': keepalive\n\n'), heartbeatMs);
      try {
        const response = await pending;
        if (cancelled) { await response.body?.cancel(); return; }
        if (!response.ok) {
          await response.body?.cancel();
          failure(`NoneLinear upstream HTTP ${response.status}`, response.status);
          return;
        }
        if (!/text\/event-stream/i.test(response.headers.get('content-type') || '')) {
          // Some compatible providers ignore stream:true and return complete JSON.
          const result = await response.json();
          emit('data: ' + JSON.stringify(result) + '\n\ndata: [DONE]\n\n');
          return;
        }
        reader = response.body.getReader();
        // Buffer only an incomplete event, so heartbeats never split upstream data.
        const decoder = new TextDecoder();
        let pendingEvent = '';
        for (;;) {
          const {done, value} = await reader.read();
          if (cancelled) break;
          pendingEvent += done ? decoder.decode() : decoder.decode(value, {stream: true});
          let separator;
          while ((separator = /\r?\n\r?\n/.exec(pendingEvent))) {
            const end = separator.index + separator[0].length;
            emit(pendingEvent.slice(0, end));
            pendingEvent = pendingEvent.slice(end);
          }
          if (done) { if (pendingEvent) emit(pendingEvent); break; }
        }
      } catch {
        failure('NoneLinear upstream connection interrupted');
      } finally {
        clearInterval(timer);
        reader?.releaseLock();
        if (!cancelled) controller.close();
      }
    },
    cancel(reason) { cancelled = true; clearInterval(timer); return reader?.cancel(reason); },
  });
  const outgoing = new Headers(headers);
  outgoing.set('Content-Type', 'text/event-stream; charset=utf-8');
  return new Response(body, {headers: outgoing});
}
