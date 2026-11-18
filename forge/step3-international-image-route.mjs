// Independent routing for Steps 1–3. The shared provider configuration is untouched.
const stages=new Set(['parse','visual','revision','catalog']);
const family=model=>/^(?:gpt(?:[-_.]|$)|claude(?:[-_.]|$)|gemini(?:[-_.]|$)|(?:nano[-_])?banana(?:[-_. ]|$))/i.test(String(model||''));
export function internationalGalleryBase(base,{provider,model,stage}={}){
 if(provider!=='infistar'||!stages.has(stage)||(stage!=='catalog'&&!family(model)))return base;
 let target;try{target=new URL(base);}catch{return base;}
 if(target.protocol!=='https:'||target.port||target.username||target.password||target.search||target.hash||!['infistar.cc','www.infistar.cc'].includes(target.hostname)||!/^\/(?:v1\/?)?$/.test(target.pathname))return base;
 // Tencent connects to the configured mainland entrance directly.
 return base;
}
export function internationalInitialImageUrl(url,body){
 // Initial images keep the configured entrance. These domains have distinct
 // gateways; silently changing one also changes the request's failure domain.
 return url;
}
