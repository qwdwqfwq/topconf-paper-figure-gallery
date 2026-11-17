// Private modification transport only. Chunks preserve the serialized request verbatim.
export const REVISION_CHUNK=512*1024;
export const REVISION_UPLOAD_MAX=32*1024*1024;
export async function revisionDigest(text){
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function validUpload(value){return value&&Number.isInteger(value.count)&&value.count>0&&value.count<=REVISION_UPLOAD_MAX/REVISION_CHUNK&&/^[a-f0-9]{64}$/.test(value.digest);}
