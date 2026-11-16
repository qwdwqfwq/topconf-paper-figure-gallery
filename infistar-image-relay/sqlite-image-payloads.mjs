// Step 3 fallback for accounts without R2. Keep large image chunks out of the
// result JSON and read one chunk at a time. The manifest is committed last.
const enc=new TextEncoder();
export function sqliteImagePayloads(storage){
  const prefix=key=>'blob:'+key+':';
  async function remove(key){
    const p=prefix(key);
    for(;;){const keys=[...(await storage.list({prefix:p,limit:128,noCache:true})).keys()];if(!keys.length)break;await storage.delete(keys);}
  }
  return {
    async put(key,text){
      const p=prefix(key);let count=0;
      for(let offset=0;offset<text.length;){
        let end=Math.min(text.length,offset+32000);
        // Each stored string becomes an independent UTF-8 stream chunk.
        if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1])&&/[\uDC00-\uDFFF]/.test(text[end]))end--;
        await storage.put(p+count++,text.slice(offset,end),{noCache:true});offset=end;
      }
      await storage.put(p+'manifest',{count,kind:'text'});return {key};
    },
    async get(key){
      const p=prefix(key),manifest=await storage.get(p+'manifest');if(!manifest)return null;
      let index=0;
      const body=new ReadableStream({async pull(c){
        if(index===manifest.count){c.close();return;}
        const value=await storage.get(p+index++,{noCache:true});if(value===undefined)throw Error('IMAGE_CHUNK_MISSING');
        c.enqueue(typeof value==='string'?enc.encode(value):value);
      }});
      return {body,async text(){return new Response(body).text();}};
    },
    async createMultipartUpload(key){
      const p=prefix(key);let count=0,nextPart=1;
      return {
        async uploadPart(partNumber,data){
          if(partNumber!==nextPart++)throw Error('IMAGE_PART_ORDER');
          for(let offset=0;offset<data.length;offset+=64000)await storage.put(p+count++,data.slice(offset,offset+64000),{noCache:true});
          return {partNumber,etag:String(partNumber)};
        },
        async complete(){await storage.put(p+'manifest',{count,kind:'binary'});return {key};},
        async abort(){await remove(key);}
      };
    },
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])await remove(key);}
  };
}
