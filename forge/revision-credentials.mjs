// Revision-only credentials. A resumed task keeps both its provider and key identity.
export function revisionCredential(route,currentProvider,currentKey,readStoredKey,cleanKey=x=>String(x||'').trim()){
  const provider=route.p||currentProvider;
  const key=cleanKey(provider===currentProvider?currentKey:readStoredKey(provider));
  if(!key)throw Error('请填写此修改任务原服务商（'+provider+'）的 API Key，再取回任务。');
  return key;
}

export async function bindRevisionCredential(task,key){
  if(task.raw||task.result)return;
  if(!key)throw Error('请先填写此修改任务的 API Key。');
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,'0')).join('');
  if(task.credentialFingerprint&&task.credentialFingerprint!==fingerprint)throw Error('当前密钥与此修改任务提交时的密钥不同，请恢复原密钥后取回；未重新提交生图。');
  task.credentialFingerprint=fingerprint;
}
