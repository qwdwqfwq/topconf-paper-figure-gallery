export {loadEmbedding} from './retrieval-resource-loader.mjs';
export function loadKeywordIndex({signal,onProgress=()=>{},timeoutMs=30000}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason);return;}
    const worker=new Worker(new URL('./retrieval-core-worker.mjs',import.meta.url),{type:'module'});
    let timer,finished=false;
    const finish=(error,value)=>{
      if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();
      if(error)reject(error);else resolve(value);
    };
    const abort=()=>finish(signal.reason);
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(new Error('基础索引加载超过 30 秒，已停止等待，请重试')),timeoutMs);
    worker.onerror=e=>{e.preventDefault();finish(new Error(e.message||'Keyword worker failed'));};
    worker.onmessage=({data:m})=>{
      if(m.type==='progress')onProgress(m.progress);
      else if(m.type==='error')finish(new Error(m.message));
      else if(m.type==='ready')finish(null,m);
    };
    worker.postMessage({type:'load'});
  });
}
