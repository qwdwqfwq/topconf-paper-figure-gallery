// Step 3 only. Public /models and pricing catalogs classify image OUTPUT,
// not reference-image INPUT. Unknown IDs must stay hidden until documented.
// Reviewed 2026-11-17. Exact IDs intentionally prevent future aliases from
// inheriting capabilities. This does not grant a key/channel inference access.
const infistar = [
  // https://infistar.cc/announcements (2026-11-16 model announcements)
  'gpt-image-2.5-flare', 'gemini-nano-banana-2.1',
  // https://doc.infistar.cc/api-reference/image-generation (Images edits)
  'qwen-image-edit-plus',
];
const openai = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1.5'];
// https://developers.openai.com/api/docs/guides/image-generation
const seedream = [
  // https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh
  'doubao-seedream-5-5-261028', 'doubao-seedream-5-0-pro-260628',
  'doubao-seedream-5-0-flash-260915', 'doubao-seedream-5-0-260128',
  'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828',
];
const nonelinear = [
  // https://docs.nonelinear.com/models/images/gpt-image
  'gpt-image-2',
  ...['gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'].flatMap(id=>['high','medium','low'].map(q=>`${id}-${q}`)),
  // https://docs.nonelinear.com/models/images/gemini
  'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image',
  // https://docs.nonelinear.com/models/images/seedream
  'doubao-seedream-5-0-pro-260628', 'Doubao-Seedream-5.0-lite',
  'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828',
  // https://docs.nonelinear.com/models/images/qwen
  'qwen-image-3.0-pro', 'qwen-image-3.0', 'qwen-image-2.0-pro', 'qwen-image-2.0',
  'qwen-image-edit-max', 'qwen-image-edit-plus', 'Qwen-Image-Edit',
];
const policies = {
  infistar: {hosts:['infistar.cc','infistar.ai'],models:new Set(infistar)},
  nonelinear: {hosts:['api.nonelinear.com.cn','gallery-nonelinear-relay.lixiao-gallery.workers.dev'],models:new Set(nonelinear)},
  oai: {hosts:['api.openai.com'],models:new Set(openai)},
  ark: {hosts:['ark.cn-beijing.volces.com'],models:new Set(seedream)},
};
export function supportsStep3ReferenceImage(config,model){
  const policy=policies[config?.provider];
  if(!policy||!policy.models.has(model))return false;
  try{
    const url=new URL(config.base);
    return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&policy.hosts.includes(url.hostname);
  }catch{return false;}
}
