// Retrieval owns its cancellation and retries; generation/export never wait here.
export function createRetrievalBoot({loadCore,loadSemantic,onState=()=>{},timeoutMs=300000}){
  let state={phase:'core-loading'}, coreReady=false, pending=null, controller;
  const set=(phase,error)=>{state={phase,error};onState(state);};
  async function run(load,label){
    controller=new AbortController();
    const current=controller;
    let timer;
    try{
      await Promise.race([
        Promise.resolve().then(()=>load(current.signal)),
        new Promise((_,reject)=>{timer=setTimeout(()=>{
          const error=new Error(label+' timeout ('+Math.round(timeoutMs/1000)+'s)');
          current.abort(error);reject(error);
        },timeoutMs);})
      ]);
    }catch(e){current.abort(e);throw e;}
    finally{clearTimeout(timer);}
  }
  function start(){
    if(coreReady)return Promise.resolve();
    if(pending)return pending;
    set('core-loading');
    pending=(async()=>{
      try{await run(loadCore,'Keyword index');coreReady=true;}
      catch(e){set('core-error',e);return;}
      finally{pending=null;}
      semantic();
    })();
    return pending;
  }
  function semantic(){
    if(pending)return pending;
    set('semantic-loading');
    pending=(async()=>{
      try{await run(loadSemantic,'Semantic model');set('ready');}
      catch(e){set('semantic-error',e);}
      finally{pending=null;}
    })();
    return pending;
  }
  return {get state(){return state;},start,
    retry(){return coreReady?(state.phase==='ready'?Promise.resolve():semantic()):start();},
    semanticFailed(e){controller?.abort(e);set('semantic-error',e);}
  };
}

export function createSemanticWorker(url,signal,onProgress=()=>{}){
  const worker=new Worker(url,{type:'module'});
  let sequence=0,closed=false;
  const requests=new Map();
  let readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  function dispose(reason=new Error('Semantic worker stopped')){
    if(closed)return;
    closed=true;worker.terminate();signal.removeEventListener('abort',abort);
    readyReject(reason);
    for(const r of requests.values()){clearTimeout(r.timer);r.reject(reason);}
    requests.clear();
  }
  const abort=()=>dispose(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=e=>{e.preventDefault();dispose(new Error(e.message||'Semantic worker failed'));};
  worker.onmessage=({data:m})=>{
    if(m.type==='progress')onProgress(m.progress);
    else if(m.type==='ready')readyResolve();
    else if(m.type==='error')dispose(new Error(m.message));
    else if(m.type==='vector'){
      const r=requests.get(m.id);if(!r)return;
      clearTimeout(r.timer);requests.delete(m.id);r.resolve(m.vector);
    }
  };
  if(signal.aborted)abort();else worker.postMessage({type:'init',base:new URL('./',url).href});
  return {ready,dispose,embed(text){
    if(closed)return Promise.reject(new Error('Semantic worker unavailable'));
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>dispose(new Error('Semantic query timeout (300s)')),300000);
      requests.set(id,{resolve,reject,timer});worker.postMessage({type:'embed',id,text});
    });
  }};
}
