// NoneLinear generation accepts HTTPS references, not browser data URLs.
// Upload only to the provider's fixed endpoint, using the requesting user's key.
export class ReferenceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.hostname !== 'localhost' && !url.hostname.endsWith('.localhost');
  } catch { return false; }
}

export async function adaptReferences(body, authorization, signal) {
  let data;
  try { data = JSON.parse(new TextDecoder().decode(body)); }
  catch { throw new ReferenceError(400, 'Invalid image generation JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ReferenceError(400, 'Invalid image generation JSON');
  if (data.image == null) return body;
  const refs = Array.isArray(data.image) ? data.image : [data.image];
  // Validate the entire list before any upload or billable generation.
  const prepared = refs.map(ref => {
    if (typeof ref !== 'string') throw new ReferenceError(400, 'Reference images must be HTTPS URLs or base64 image data URLs');
    if (httpsUrl(ref)) return { url: ref };
    const match = /^data:image\/(png|jpe?g|webp|gif|bmp|tiff?);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(ref);
    if (!match || match[2].length % 4 !== 0) throw new ReferenceError(400, 'Invalid reference image data URL');
    const type = match[1].toLowerCase();
    return { image: match[2], type: '.' + type };
  });
  if (!prepared.some(ref => ref.image)) return body;
  const urls = [];
  for (const ref of prepared) {
    if (ref.url) { urls.push(ref.url); continue; }
    let response, result;
    try {
      response = await fetch('https://nonelinear.com.cn/api/upload-file', {
        method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify(ref), redirect: 'manual', signal,
      });
      if (!response.ok) throw new Error('upload status');
      result = await response.json();
      if (typeof result?.url !== 'string' || !httpsUrl(result.url)) throw new Error('upload URL');
    } catch {
      throw new ReferenceError(502, 'NoneLinear reference image upload failed; generation was not submitted');
    }
    urls.push(result.url);
  }
  data.image = Array.isArray(data.image) ? urls : urls[0];
  return JSON.stringify(data);
}
