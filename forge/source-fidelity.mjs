// Export quality and source identity are independent of presentation format.
export async function bitmapDigest(dataUrl) {
  const bytes=await (await fetch(dataUrl)).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function auditSourceText(scene, transcript) {
  const normalize=s=>String(s||'').normalize('NFC').replace(/\s+/g,'').trim();
  const texts=s=>(s?.nodes||[]).filter(n=>n.type==='text').map(n=>normalize(n.text)).filter(Boolean).sort();
  const expected=texts(transcript), actual=texts(scene);
  // Independent OCR is a review aid, never proof of Office rendering quality.
  return {state:JSON.stringify(expected)===JSON.stringify(actual)?'passed':'needs-review',expected,actual};
}
export function canExportReconstruction(state) {
  if(!state.svg||state.reconPending)return false;
  if(state.source!=='bitmap')return true;
  if(!state.sourceBinding || state.sourceBinding.source!==state.bitmap)return false;
  return state.allowDraft===true ||
    (state.recon?.qualityState==='succeeded' && (state.font||'original')==='original');
}
