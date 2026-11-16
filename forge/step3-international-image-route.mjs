// Independent routing for Steps 1–3. The shared provider configuration is untouched.
const stages=new Set(['parse','visual','generate','revision','catalog']);
const family=model=>/^(?:gpt(?:[-_.]|$)|claude(?:[-_.]|$)|gemini(?:[-_.]|$)|(?:nano[-_])?banana(?:[-_. ]|$))/i.test(String(model||''));
export function internationalGalleryBase(base,{provider,model,stage}={}){
 if(provider!=='infistar'||!stages.has(stage)||(stage!=='catalog'&&!family(model)))return base;
 let target;try{target=new URL(base);}catch{return base;}
 if(target.protocol!=='https:'||target.port||target.username||target.password||target.search||target.hash||!['infistar.cc','www.infistar.cc'].includes(target.hostname)||!/^\/(?:v1\/?)?$/.test(target.pathname))return base;
 target.hostname='infistar.ai';return target.href.replace(/\/$/,'');
}
export function internationalInitialImageUrl(url,body){
 let target;try{target=new URL(url);}catch{return url;}
 if(target.protocol!=='https:'||target.port||target.username||target.password||target.hash||!['infistar.cc','www.infistar.cc'].includes(target.hostname))return url;
 const native=/^\/v1beta\/models\/([^/]+):(?:streamGenerateContent|generateContent)$/.exec(target.pathname);
 const model=native?decodeURIComponent(native[1]):typeof FormData!=='undefined'&&body instanceof FormData?body.get('model'):body?.model;
 const valid=native?(!target.search||target.search==='?alt=sse'):target.pathname==='/v1/images/generations'&&!target.search;
 if(valid&&family(model)){target.hostname='infistar.ai';return target.href;}
 return url;
}
