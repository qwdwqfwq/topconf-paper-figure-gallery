// Independent revision output receiver. No API credentials, routes or shared bindings.
const ORIGIN='https://qwdwqfwq.github.io';
const HOST='imagen-nonelinear-2025.tos-cn-beijing.volces.com';
const MAX=40*1024*1024;
export function allowedImage(value){
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===HOST&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/(?:others|gemini)\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/.test(u.pathname);}catch{return false;}
}
// Long image edits can outlast an idle browser/proxy connection. JSON whitespace
// keeps only this independent revision request alive; there are no retries.
async function generate(request,headers,upstream){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
  if(request.method!=='POST')return new Response('POST required',{status:405,headers});
  const authorization=request.headers.get('Authorization');
  if(!/^Bearer\s+\S+$/.test(authorization||''))return new Response('Key required',{status:401,headers});
  let body;try{body=await request.text();if(body.length>128*1024)throw Error();const data=JSON.parse(body);if(!Array.isArray(data.image)||!data.image.length||data.image.length>5||typeof data.prompt!=='string'||typeof data.model!=='string'||data.image.some(x=>{try{const u=new URL(x);return u.protocol!=='https:'||u.username||u.password;}catch{return true;}}))throw Error();}catch{return new Response('Invalid revision request',{status:400,headers});}
  const stream=new ReadableStream({async start(controller){
    const encode=value=>new TextEncoder().encode(value);let closed=false;
    const send=value=>{if(!closed)try{controller.enqueue(encode(value));}catch{closed=true;}};
    send('\n');const timer=setInterval(()=>send('\n'),15000);
    try{const r=await upstream('https://api.nonelinear.com.cn/v1/images/generations',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body,redirect:'manual',signal:AbortSignal.timeout(600000)});
      if(r.status>=300&&r.status<400)throw Error('Redirect refused');
      const data=await r.json();data._revisionUpstreamStatus=r.status;send(JSON.stringify(data));
    }catch{send(JSON.stringify({error:{message:'Revision upstream connection failed; not retried'},_revisionUpstreamStatus:502}));}
    finally{clearInterval(timer);if(!closed)controller.close();}
  },cancel(){/* No automatic retry: the original request may already be billed. */}});
  return new Response(stream,{headers:{...headers,'Content-Type':'application/json'}});
}
export async function receive(request,upstream=fetch){
  const headers={'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const reply=(status,message)=>new Response(message,{status,headers});
  if(request.headers.get('Origin')!==ORIGIN)return new Response('Forbidden',{status:403});
  if(new URL(request.url).pathname==='/v1/images/generations')return generate(request,headers,upstream);
  if(new URL(request.url).pathname!=='/revision-image')return reply(404,'Not found');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}});
  if(request.method!=='POST')return reply(405,'POST required');
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply(415,'JSON required');
  let body;
  try{const reader=request.body?.getReader();if(!reader)return reply(400,'Missing body');let text='',size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return reply(413,'Body too large');}text+=decoder.decode(value,{stream:true});}body=JSON.parse(text+decoder.decode());}catch{return reply(400,'Invalid JSON');}
  if(!allowedImage(body.url))return reply(400,'Unsupported image URL');
  try{
    const r=await upstream(body.url,{redirect:'manual',signal:AbortSignal.timeout(60000)});
    if(r.status!==200)return reply(502,'Image unavailable');
    if(Number(r.headers.get('Content-Length'))>MAX){await r.body?.cancel();return reply(413,'Image too large');}
    if(!r.body)return reply(502,'Missing image');
    const reader=r.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX){await reader.cancel();return reply(413,'Image too large');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
    const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!png&&!jpeg&&!webp)return reply(415,'Invalid image');
    return new Response(bytes,{headers:{...headers,'Content-Type':png?'image/png':jpeg?'image/jpeg':'image/webp'}});
  }catch{return reply(502,'Image download failed');}
}
export default {fetch:request=>receive(request)};
