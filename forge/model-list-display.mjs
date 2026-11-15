// Private catalog presentation for Steps 1 and 3 only. Never changes catalog data,
// selected-model storage, inference parameters, or Step 4 controls.
export function modelGeneration(id){
  const name=id.toLowerCase();
  // Keep distinct product lines independent (image, OSS and Nano Banana).
  const match=name.match(/^(gpt-image|gpt-oss|gemini-nano-banana|nano-banana|qwen-image|doubao-seedream|stable-diffusion|[a-z]+(?:-(?:opus|sonnet|haiku|fable|v|m|k))?)[- .]?(\d+)(?:[.](\d+)|-(\d{1,2})(?=-|$))?/);
  if(!match||Number(match[2])>=100)return null; // Dates and unknown schemes stay visible.
  const family=match[1].replace(/^claude-(?:opus|sonnet|haiku|fable)$/,'claude');
  return {family,version:[Number(match[2]),Number(match[3]||match[4]||0)]};
}
const compareVersion=(a,b)=>b[0]-a[0]||b[1]-a[1];
export function arrangeModels(models,{selected='',expanded=false,enabled=true}={}){
  const list=[...new Set(models)],groups=new Map();
  if(!enabled)return {visible:selected&&!list.includes(selected)?[selected,...list]:list,older:[],total:list.length+(selected&&!list.includes(selected)?1:0)};
  for(const id of list){
    const generation=modelGeneration(id),key=generation?.family||'unknown:'+id;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({id,generation});
  }
  const visible=[],older=[];
  for(const rows of groups.values()){
    rows.sort((a,b)=>a.generation&&b.generation?compareVersion(a.generation.version,b.generation.version):0);
    const generations=[...new Set(rows.filter(r=>r.generation).map(r=>r.generation.version.join('.')))];
    const fold=(rows.length>6||list.length>20)&&generations.length>3;
    const latest=new Set(generations.slice(0,3));
    for(const row of rows)(fold&&!latest.has(row.generation?.version.join('.'))&&row.id!==selected?older:visible).push(row.id);
  }
  // A saved model can disappear from a partial/offline catalog. Preserve it.
  if(selected&&!list.includes(selected))visible.unshift(selected);
  return {visible:expanded?[...visible,...older]:visible,older,total:list.length+(selected&&!list.includes(selected)?1:0)};
}

export function createModelListDisplay(select,language=()=>document.documentElement.lang){
  let input,expanded=false,context='',button,controls;
  const originalStyle=select.getAttribute('style');
  const doc=select.ownerDocument,text=(zh,en)=>String(language()).startsWith('en')?en:zh;
  function render(options){
    if(options)input=options;
    if(!input)return;
    const {models,selected,source,enabled,scope,placeholder}=input;
    if(context!==scope){expanded=false;context=scope;}
    const arranged=arrangeModels(models,{selected,expanded,enabled});
    select.replaceChildren();
    if(arranged.visible.length){
      const group=doc.createElement('optgroup');group.label=source;
      for(const id of arranged.visible){const option=doc.createElement('option');option.value=id;option.textContent=id;group.append(option);}
      select.append(group);if(selected)select.value=selected;
    }else{
      const option=doc.createElement('option');option.value='';option.disabled=true;option.textContent=placeholder;select.append(option);
    }
    if(!button&&select.parentNode){
      // Keep the disclosure below the selector so a narrow row cannot squeeze
      // the selected model down to an unreadable arrow-only control.
      controls=doc.createElement('div');
      controls.style.cssText='display:flex;flex-direction:column;align-items:stretch;gap:2px;flex:1 1 220px;min-width:0;';
      select.before(controls);controls.append(select);
      select.style.cssText+=';width:100%;min-width:0;box-sizing:border-box;flex:0 0 auto;';
      button=doc.createElement('button');button.type='button';button.id=select.id+'ShowAllModels';
      button.style.cssText='font:inherit;font-size:12px;color:#6351d8;background:transparent;border:0;cursor:pointer;padding:6px 0;max-width:100%;white-space:normal;text-align:start;align-self:flex-start;';
      button.setAttribute('aria-controls',select.id);
      button.addEventListener('click',()=>{input.selected=select.value;expanded=!expanded;render();});
      select.insertAdjacentElement('afterend',button);
    }
    if(button){
      button.hidden=!enabled||!arranged.older.length;button.setAttribute('aria-expanded',String(expanded));
      button.textContent=expanded?text('收起旧模型','Collapse older models'):text(`显示全部模型（另 ${arranged.older.length} 款旧模型）`,`Show all models (${arranged.older.length} older)`);
    }
    return arranged;
  }
  const changed=()=>{if(input)input.selected=select.value;};
  const translated=()=>{if(input){input.selected=select.value;render();}};
  select.addEventListener('change',changed);doc.addEventListener('langchange',translated);
  return {render,dispose(){select.removeEventListener('change',changed);doc.removeEventListener('langchange',translated);button?.remove();if(controls){controls.before(select);controls.remove();if(originalStyle===null)select.removeAttribute('style');else select.setAttribute('style',originalStyle);}}};
}
