// Private Step 3 presentation adapter. Does not alter generation, Step 4,
// reconstruction inputs, shared HTML, styles, storage or request parameters.
import {step3ImageResolutions} from './step3-image-capabilities.mjs?v=20261114-model-resolution';

export function installStep3ResolutionDisplay(select,readConfig,language){
  const doc=select?.ownerDocument,warn=doc?.getElementById('imageRatioWarn');
  const Observer=doc?.defaultView?.MutationObserver;
  if(!warn||!Observer)return {update(){},dispose(){}};
  function update(){
    const config=readConfig();
    if(config.mode!=='image')return;
    const ratio=doc.getElementById('figureRatio')?.value;
    const model=config.provider==='custom'?doc.getElementById('customModel')?.value.trim():select.value;
    const choices=step3ImageResolutions(config.provider,model,ratio);
    // The dropdown already conveys the documented resolution restriction.
    // Never display empirical audit status (including "verified" success).
    if(choices.length||!model){
      if(!warn.hidden)warn.hidden=true;
      if(warn.textContent)warn.textContent='';
    }else{
      const message=String(language()).startsWith('en')
        ?'The model’s documented output sizes do not support this canvas ratio. Choose another ratio.'
        :'该模型官网说明的输出尺寸不支持当前画布比例，请选择其他比例。';
      if(warn.textContent!==message)warn.textContent=message;
      if(warn.hidden)warn.hidden=false;
    }
  }
  // The frozen page also refreshes this note on ratio/model/language changes.
  // Observe only this Step 3 note, leaving all other UI and handlers untouched.
  const observer=new Observer(update);
  observer.observe(warn,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  return {update,dispose(){observer.disconnect();}};
}
