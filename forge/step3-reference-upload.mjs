// Private Step 3 direct-API adapter. Project relays already upload references.
function publicHttps(value){
  try{
    const u=new URL(value),host=u.hostname.toLowerCase();
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
      host.includes('.')&&!host.endsWith('.localhost')&&!host.endsWith('.local')&&
      !/^[\d.]+$/.test(host)&&!host.includes(':');
  }catch{return false;}
}
export async function uploadStep3References(value,init,fetchImpl){
  if(value.image==null)return value;
  const references=Array.isArray(value.image)?value.image:[value.image];
  // Validate every reference before sending even the first upload.
  const prepared=references.map(reference=>{
    if(typeof reference==='string'&&publicHttps(reference))return {url:reference};
    const match=typeof reference==='string'&&/^data:image\/(png|jpe?g|webp|gif|bmp|tiff?);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(reference);
    if(!match||match[2].length%4)throw new Error('非线智能参考图必须是公开 HTTPS 地址或有效的图像数据；尚未提交生成请求。');
    return {image:match[2],type:'.'+match[1].toLowerCase().replace(/^jpeg$/,'jpg').replace(/^tif$/,'tiff')};
  });
  const urls=[];
  for(const reference of prepared){
    init.signal?.throwIfAborted();
    if(reference.url){urls.push(reference.url);continue;}
    try{
      const response=await fetchImpl('https://nonelinear.com.cn/api/upload-file',{
        method:'POST',headers:{Authorization:new Headers(init.headers).get('Authorization')||'','Content-Type':'application/json'},
        body:JSON.stringify(reference),redirect:'manual',signal:init.signal,
      });
      if(!response.ok)throw new Error('upload status');
      const result=await response.json();
      if(typeof result?.url!=='string'||!publicHttps(result.url))throw new Error('upload URL');
      urls.push(result.url);
    }catch{
      init.signal?.throwIfAborted();
      throw new Error('非线智能参考图上传失败；尚未提交生成请求，请检查服务商上传接口。');
    }
  }
  return {...value,image:Array.isArray(value.image)?urls:urls[0]};
}
