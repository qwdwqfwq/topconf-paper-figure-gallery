// Reference analysis only: the provider connection does not depend on our job gateways.
const active=new Map();
function load(storage,slot){try{return JSON.parse(storage?.getItem(slot)||'null');}catch{return null;}}
function persist(storage,slot,record){
 storage.setItem(slot,JSON.stringify(record));
 if(!storage.getItem(slot))throw Error('无法保存归纳请求状态，请允许当前页面使用会话存储后重试。');
}
function response(record){return new Response(record.text,{status:record.status,headers:record.headers});}
function uncertain(task){return Object.assign(new Error('直连归纳的响应未完整收到，无法确认模型是否完成。本地请求编号 '+task.id+'（非服务商编号）。为避免重复扣费，本页面不会自动再次调用模型；请先在服务商记录中确认该请求。'),{name:'AnalysisDirectError',analysisDirectDiagnostic:task.diagnostic||{kind:'transport',reason:'unknown'}});}
export async function collectAnalysisStream(response){
 if(!response.ok||!response.headers.get('Content-Type')?.includes('text/event-stream'))return await response.text();
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let buffer='',content='',reasoning='',finish=null,done=false,bytes=0;
 const result={object:'chat.completion',choices:[]};
 function event(block){
  const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
  if(!data)return;
  if(data==='[DONE]'){done=true;return;}
  const chunk=JSON.parse(data);
  if(chunk.error){result.error=chunk.error;done=true;return;}
  for(const field of ['id','model','created','usage','system_fingerprint'])if(chunk[field]!=null)result[field]=chunk[field];
  for(const choice of chunk.choices||[]){
   if((choice.index??0)!==0)continue;
   const delta=choice.delta||{};
   if(typeof delta.content==='string')content+=delta.content;
   if(typeof delta.reasoning_content==='string')reasoning+=delta.reasoning_content;
   if(choice.finish_reason!=null)finish=choice.finish_reason;
  }
 }
 function consume(){let end;while(!done&&(end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);event(block);}}
 try{
  while(!done){
   const next=await reader.read();
   if(next.done){buffer+=decoder.decode();break;}
   bytes+=next.value.byteLength;if(bytes>8*1024*1024)throw Error('归纳响应超过读取上限');
   buffer+=decoder.decode(next.value,{stream:true});
   // Normalize line endings after decoding, preserving CR/LF split across chunks.
   buffer=buffer.replace(/\r\n/g,'\n');consume();
  }
  consume();if(!done&&buffer.trim())event(buffer);
  if(result.error)return JSON.stringify(result);
  if(!finish)throw Error('归纳流提前结束，未收到模型完成标记');
  result.choices=[{index:0,finish_reason:finish,message:{role:'assistant',content,...(reasoning?{reasoning_content:reasoning}:{})}}];
  return JSON.stringify(result);
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function requestDirectAnalysis({url,init,fetchImpl,storage,slot,id,now=Date.now,deadlineMs=900000}){
 if(active.has(slot))return active.get(slot).then(response);
 const saved=load(storage,slot),start=now();
 if(saved?.transport==='direct'&&saved.created<=start&&saved.created>start-86400000){
  if(saved.state==='complete')return Promise.resolve(response(saved));
  return Promise.reject(uncertain(saved));
 }
 const task={id,created:start,transport:'direct',state:'pending'};
 // Store no API key or source image; a lost response must never cause an automatic paid retry.
 try{persist(storage,slot,task);}catch(error){return Promise.reject(error);}
 const promise=(async()=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new DOMException('归纳等待超时','TimeoutError')),deadlineMs);
  const abort=()=>controller.abort(init.signal.reason);
  if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true});
  let upstream;
  try{
   // Preserve the original non-streaming request: the provider's streamed path
   // can stall while the same visual request completes normally without it.
   upstream=await fetchImpl(url,{...init,signal:controller.signal});
   const text=await collectAnalysisStream(upstream);
   const record={...task,state:'complete',status:upstream.status,headers:{'Content-Type':'application/json'},text};
   for(const name of ['x-request-id','request-id','x-oneapi-request-id']){const value=upstream.headers.get(name);if(value)record.headers[name]=value;}
   // If quota is exhausted, the completed in-memory result remains reusable;
   // the persisted pending marker still prevents a duplicate after reload.
   try{persist(storage,slot,record);}catch{}
   return record;
  }catch(error){
   task.diagnostic={kind:upstream?'response-read':error?.name==='TimeoutError'?'timeout':error?.name==='AbortError'?'cancelled':'transport',reason:error?.name||'Error'};
   if(upstream){task.diagnostic.httpStatus=upstream.status;task.diagnostic.requestId=upstream.headers.get('x-request-id')||upstream.headers.get('request-id')||upstream.headers.get('x-oneapi-request-id')||'';}
   try{persist(storage,slot,task);}catch{}
   throw uncertain(task);
  }
  finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
 })();
 active.set(slot,promise);
 // Keep successful promises for the session; rejected promises use the persistent unknown marker.
 promise.catch(()=>active.delete(slot));
 return promise.then(response);
}
