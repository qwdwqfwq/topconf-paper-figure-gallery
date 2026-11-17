// Step 3 bitmap edits only. Diagnostics never contain request bodies or image URLs.
export const revisionStages={source:'准备原图与参考图',storage:'保存本机修改任务',preparation:'准备修改请求',reading:'读取选区内容',upload:'上传参考图',submission:'确认任务接收',status:'查询后台生成进度',upstream:'服务商生成修改图',result:'读取后台结果',response:'解析服务商响应','image-download':'接收结果图片',validation:'校验修改图片',composite:'还原局部修改',history:'保存修改版本'};
export function cleanRevisionDetail(value,key=''){
 let text=String(value??'');
 if(key)text=text.replaceAll(key,'[redacted]');
 return text.replace(/Bearer\s+[^\s"';,]+/gi,'Bearer [redacted]').replace(/sk-[A-Za-z0-9_-]+/gi,'[redacted]').replace(/data:image\/[^\s"']+/gi,'[image]').replace(/https?:\/\/[^\s"'<>]+/gi,'[url]').slice(0,600);
}
export function revisionFailure(error,stage,context={},key=''){
 if(error?.revisionDiagnostic)return error;
 const raw=error?.diagnostic||{},upstream=raw.diagnostic||{};
 stage=raw.stage||stage||'preparation';
 let observed=cleanRevisionDetail(error?.message||error||'未知错误',key);
 const status=context.httpStatus??raw.httpStatus??upstream.upstreamStatus;
 const reason= context.reason || (status>=400?'http':error?.code==='JOB_RESULT_UNKNOWN'?'upstream-unconfirmed':/REQUEST_TIMEOUT|超时/.test(observed)||error?.name==='TimeoutError'?'timeout':error?.name==='AbortError'?'aborted':/Failed to fetch|NetworkError|Load failed/i.test(observed)?'unreadable-response':error?.name==='SyntaxError'||/不完整的响应|INVALID_RESPONSE/.test(observed)?'invalid-response':error?.name==='QuotaExceededError'?'storage-quota':'reported-error');
 if(reason==='unreadable-response')observed=observed.match(/Failed to fetch|NetworkError|Load failed/i)?.[0]||observed;
 const reasonLabel={http:'接口返回 HTTP '+status,timeout:'等待响应超时',aborted:'请求被取消','unreadable-response':'浏览器未取得可读取的响应；具体原因未确认（无法仅凭此错误区分断网、跨域拦截或服务端断开）','upstream-unconfirmed':'后台无法确认服务商是否完成生成','invalid-response':'接口响应不完整或格式无效','storage-quota':'浏览器本机存储空间不足','reported-error':'处理失败，详见原始错误'}[reason]||reason;
 const diagnostic={version:1,at:new Date().toISOString(),stage,stageLabel:revisionStages[stage]||stage,reason,reasonLabel,observedError:observed};
 const values={...context,code:error?.code,jobId:context.jobId||error?.jobId,requestId:context.requestId||raw.requestId||upstream.requestId,httpStatus:status,providerErrorCode:context.providerErrorCode||upstream.errorCode,upstreamStage:upstream.phase||upstream.stage,upstreamMessage:upstream.upstreamMessage||upstream.message,online:globalThis.navigator?.onLine};
 for(const name of ['code','jobId','requestId','httpStatus','providerErrorCode','upstreamStage','upstreamMessage','operation','chunk','total','attempt','elapsedMs','online'])if(values[name]!==undefined)diagnostic[name]=typeof values[name]==='string'?cleanRevisionDetail(values[name],key):values[name];
 const detail=reason==='unreadable-response'?reasonLabel:reasonLabel+'。'+observed;
 const identifiers=[diagnostic.requestId?'请求 ID：'+diagnostic.requestId:'',diagnostic.jobId?'修改任务：'+diagnostic.jobId:''].filter(Boolean).join('\n');
 const result=Object.assign(new Error('改图失败阶段：'+diagnostic.stageLabel+'\n原因：'+detail+(identifiers?'\n'+identifiers:'')),{name:error?.name||'Error',code:error?.code||'REVISION_STAGE_ERROR',jobId:diagnostic.jobId,diagnostic,revisionDiagnostic:true});
 return result;
}
export function createRevisionDiagnostics(task,{key='',persist=async()=>{}}={}){
 const log=task.diagnostics||={version:1,events:[],sequence:0};
 async function record(event){
  const safe={};
  for(const name of ['at','stage','stageLabel','reason','reasonLabel','observedError','code','jobId','requestId','httpStatus','providerErrorCode','upstreamStage','upstreamMessage','operation','chunk','total','attempt','elapsedMs','online','outcome'])if(event[name]!==undefined)safe[name]=typeof event[name]==='string'?cleanRevisionDetail(event[name],key):event[name];
  safe.at||=new Date().toISOString();safe.sequence=++log.sequence;log.events.push(safe);log.events=log.events.slice(-80);
  if(event.outcome==='failed')log.lastFailure=safe;
  try{await persist();}catch{/* Recording must not turn a successful HTTP call into another request. */}
 }
 return {record,setStage(stage){log.currentStage=stage;},async run(stage,action,context={}){
  const started=Date.now();log.currentStage=stage;
  await record({stage,outcome:'started'});
  try{return await action();}catch(error){
   const failure=revisionFailure(error,log.currentStage||stage,{jobId:task.id,elapsedMs:Date.now()-started,...context},key);
   await record({...failure.diagnostic,outcome:'failed'});throw failure;
  }
 }};
}
export function revisionDiagnosticText(task){
 const log=task.diagnostics;if(!log?.events?.length)return task.error||'';
 const lines=['修改任务：'+task.id,'服务商：'+(task.input?.route?.p||'')+'；模型：'+(task.input?.route?.model||''),'诊断记录（最近 80 条，按发生顺序）：'];
 for(const e of log.events)lines.push([e.at,revisionStages[e.stage]||e.stage,e.outcome==='recovered'?'已恢复':e.outcome==='failed'?'失败':e.outcome==='started'?'开始':'本次请求异常',e.reasonLabel,e.observedError,e.httpStatus?'HTTP '+e.httpStatus:'',e.code,e.providerErrorCode?'服务商错误码：'+e.providerErrorCode:'',e.upstreamStage?'上游阶段：'+e.upstreamStage:'',e.upstreamMessage,e.requestId?'请求 ID：'+e.requestId:'',e.operation,e.chunk?'分片 '+e.chunk+'/'+e.total:'',e.attempt?'第 '+e.attempt+' 次尝试':'',e.elapsedMs!==undefined?'耗时 '+e.elapsedMs+' ms':'',e.online!==undefined?'浏览器在线标志：'+e.online:''].filter(v=>v!==undefined&&v!=='').join(' · '));
 return lines.join('\n');
}
