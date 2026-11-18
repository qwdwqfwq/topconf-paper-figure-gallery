// Shared network configuration. API keys remain supplied by each visitor.
// Load before the frozen application module so its fetch calls use Tencent.
window.FF_NONELINEAR_BASE = window.FF_NONELINEAR_BASE || 'https://analysis.topconf-paper-figure-gallery.cn/v1';
(() => {
 const origin='https://analysis.topconf-paper-figure-gallery.cn';
 const nativeFetch=window.fetch.bind(window);
 const relayRoutes=new Map([['/v1/models','GET'],['/v1/chat/completions','POST'],['/v1/responses','POST'],['/v1/images/generations','POST'],['/v1/images/edits','POST'],['/v1/source-image','POST']]);
 function targetFor(input,method){
  let u;try{u=new URL(input,window.location.href);}catch{return null;}
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash)return null;
  if(['api.nonelinear.com.cn','gallery-nonelinear-relay.lixiao-gallery.workers.dev'].includes(u.hostname)&&!u.search&&relayRoutes.get(u.pathname)===method)return origin+u.pathname;
  let provider;
  if(['nonelinear.com.cn','www.nonelinear.com.cn'].includes(u.hostname)){
   if(!((method==='GET'&&u.pathname==='/models')||(method==='POST'&&u.pathname==='/api/upload-file'&&!u.search)))return null;
   for(const [name,value]of u.searchParams)if(!['offset','limit'].includes(name)||!/^\d{1,4}$/.test(value))return null;
   provider='nonelinear';
  }else if(['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'].includes(u.hostname)){
   const gemini=/^\/v1beta\/models\/[a-zA-Z0-9._-]+:(?:generateContent|streamGenerateContent)$/.test(u.pathname);
   if(!((method==='GET'&&['/pricing','/v1/models'].includes(u.pathname))||(method==='POST'&&['/v1/chat/completions','/v1/messages','/v1/responses','/v1/images/generations','/v1/images/edits'].includes(u.pathname))||(method==='POST'&&gemini)))return null;
   if(u.search&&!(gemini&&u.search==='?alt=sse'))return null;
   provider=u.hostname.endsWith('.ai')?'infistar-ai':'infistar-cc';
  }else return null;
  return origin+'/providers/'+provider+u.pathname+u.search;
 }
 window.fetch=function(input,init){
  const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const target=targetFor(input instanceof Request?input.url:input,method);
  if(!target)return nativeFetch(input,init);
  // Keep FormData/Blob/string bodies intact; converting them to a stream changes
  // browser upload behavior and can require HTTP/2 even for an ordinary request.
  if(!(input instanceof Request))return nativeFetch(target,{...init,credentials:'omit',redirect:'error'});
  const request=new Request(input,init);
  return nativeFetch(new Request(target,{
   method:request.method,headers:request.headers,body:request.body,
   signal:request.signal,cache:request.cache,mode:request.mode,
   credentials:'omit',redirect:'error',referrerPolicy:request.referrerPolicy,
   ...(request.body?{duplex:'half'}:{})
  }));
 };
})();
