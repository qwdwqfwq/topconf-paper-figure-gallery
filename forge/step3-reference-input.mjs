// Step 3 gallery references only; uploaded/private references retain the existing path.
export async function step3ReferenceInputs(provider,ids,figureFor,fallback){
  if(provider!=='nonelinear')return fallback(ids);
  const result=[];
  for(const id of ids){
    const figure=figureFor(id);
    const path=figure?.image;
    if(!figure?.localURL&&typeof path==='string'&&/^images\//.test(path)&&!path.split('/').includes('..')){
      const url=new URL(path,'https://qwdwqfwq.github.io/topconf-paper-figure-gallery/');
      result.push(url.href);
    }else result.push(...await fallback([id]));
  }
  return result;
}
