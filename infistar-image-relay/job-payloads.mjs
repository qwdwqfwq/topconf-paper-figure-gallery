// Private, immutable stage objects for Step 3 only. Provider/client JSON is
// stored verbatim: no image resizing, format conversion or public R2 URLs.
export const PAYLOAD_STORE='r2-v1';
export const SQLITE_PAYLOAD_STORE='do-stream-v1';
export const hasPayloadStore=meta=>[PAYLOAD_STORE,SQLITE_PAYLOAD_STORE].includes(meta.payloadStore);
const stages=['input','raw','result','image'];
function objectKey(meta,stage){
  if(!stages.includes(stage)||!/^[a-f0-9]{64}$/.test(meta.owner)||!/^[a-f0-9-]{36}$/.test(meta.id))throw Error('INVALID_PAYLOAD_ID');
  return `step3/${meta.owner}/${meta.id}/${stage}.json`;
}
export function payloadBucket(env,meta){
  const bucket=meta.payloadStore===SQLITE_PAYLOAD_STORE?env.DO_IMAGE_PAYLOADS:env.IMAGE_PAYLOADS;
  if(!bucket)throw Error('IMAGE_PAYLOAD_BUCKET_REQUIRED');
  return bucket;
}
export async function putPayload(env,meta,stage,text){
  const stored=await payloadBucket(env,meta).put(objectKey(meta,stage),text,{
    httpMetadata:{contentType:'application/json; charset=utf-8'},
    customMetadata:{expires:String(meta.expires)}
  });
  if(!stored)throw Error('IMAGE_PAYLOAD_WRITE_FAILED');
}
export async function getPayload(env,meta,stage){
  const stored=await payloadBucket(env,meta).get(objectKey(meta,stage));
  if(!stored)throw Error('IMAGE_PAYLOAD_NOT_FOUND');
  return stored.text();
}
export async function payloadObject(env,meta,stage){
  const stored=await payloadBucket(env,meta).get(objectKey(meta,stage));
  if(!stored)throw Error('IMAGE_PAYLOAD_NOT_FOUND');
  return stored;
}
export function imageObjectKey(meta){return objectKey(meta,'image');}
export async function deletePayloads(env,meta){
  // Delete every possible stage, including objects written just before an
  // interrupted metadata commit. No bucket listing or public access is used.
  await payloadBucket(env,meta).delete(stages.map(stage=>objectKey(meta,stage)));
}
