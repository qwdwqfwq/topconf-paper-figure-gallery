// Real generation audit, 2026-10-16. Each combination was checked against
// the returned bitmap pixels. Availability can change with the API account.
const ALL = '1K:16:9,1K:3:2,1K:4:3,1K:1:1,2K:16:9,2K:3:2,2K:4:3,2K:1:1,4K:16:9,4K:3:2,4K:4:3,4K:1:1';
const split = value => new Set(value.split(',').filter(Boolean));
const full = split(ALL);
const audits = {
  'gpt-image-2': {verified:full},
  'gpt-image-2.5-sunburst': {verified:full},
  'gpt-image-2.5-flare': {verified:full},
  'gemini-3-pro-image': {verified:full},
  'gemini-3.1-flash-image': {verified:split('1K:16:9,1K:3:2,1K:4:3,1K:1:1,2K:16:9,2K:3:2,2K:4:3,2K:1:1,4K:16:9,4K:3:2,4K:4:3'),inconclusive:split('4K:1:1')},
  'gemini-3.1-flash-lite-image': {wrongSize:full},
  'wan2.7-image-pro': {verified:full},
  'wan2.7-image': {verified:split('1K:16:9,1K:3:2,1K:4:3,1K:1:1,2K:16:9,2K:3:2,2K:4:3,2K:1:1'),rejected:split('4K:16:9,4K:3:2,4K:4:3,4K:1:1')},
  'qwen-image-2.0': {verified:split('1K:16:9,1K:3:2,1K:4:3,1K:1:1,2K:16:9,2K:3:2,2K:4:3,2K:1:1'),rejected:split('4K:16:9,4K:3:2,4K:4:3,4K:1:1')},
  'qwen-image-2.0-pro': {verified:split('1K:16:9,1K:3:2'),limited:split('1K:4:3,1K:1:1,2K:16:9,2K:3:2,2K:4:3,2K:1:1'),rejected:split('4K:16:9,4K:3:2,4K:4:3,4K:1:1')},
  'qwen-image-max': {rejected:full},
  'qwen-image-plus': {rejected:full},
  'qwen-image': {rejected:full},
  'doubao-seedream-5-0-260128': {verified:split('2K:16:9,2K:3:2,2K:4:3,2K:1:1,4K:16:9,4K:3:2,4K:4:3,4K:1:1'),rejected:split('1K:16:9,1K:3:2,1K:4:3,1K:1:1')},
  'doubao-seedream-4-0-250828': {verified:full},
  'grok-imagine-image': {unavailable:full},
  'grok-imagine-image-quality': {unavailable:full}
};

export function infistarAuditStatus(model, ratio, resolution){
  const entry=audits[model];
  if(!entry) return 'untested';
  const combination=`${resolution}:${ratio}`;
  for(const [status, combinations] of Object.entries(entry)){
    if(combinations.has(combination)) return status;
  }
  return 'untested';
}
