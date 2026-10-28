// Recovery is confined to Step 4. Never evaluate model output or substitute
// metadata for drawing primitives. Unrecoverable entries remain in the audit.
const schemas={inventory:['items','layers','connections','uncertainties'],scene:['nodes','elements','objects','shapes','regions','uncertainties'],patch:['operations','uncertainties'],diagnosis:['defects','coverage','evidence','unlistedSourceItems','uncertainties']};
function removeContainerStrayQuotes(source,repaired){
  let result='',inString=false,escaped=false,previous='';
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(inString){
      result+=ch;
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){
      // A real path response ended with `"strokeWidth":2,"}`. This is
      // punctuation after a complete numeric value, never a string value.
      if(/(?:[:\[,]\s*)-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\s*,\s*$/.test(result)&&/^\s*}/.test(source.slice(i+1))){
        result=result.replace(/,\s*$/,'');
        repaired.push({reason:'stray quote and trailing comma after number'});continue;
      }
      // Real regional responses can append a quote to a complete numeric
      // value ("w":121",). Match only a value token outside strings;
      // text ending in a digit or an escaped quote must remain untouched.
      if(/(?:[:\[,]\s*)-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\s*$/.test(result)&&/^\s*[,}\]]/.test(source.slice(i+1))){
        repaired.push({reason:'stray quote after number'});continue;
      }
      // Another observed form is "w":121,","h":99. The extra quote and
      // comma occur between a complete value and the next quoted property.
      if(/(?:[:\[,]\s*)-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\s*,\s*$/.test(result)&&/^,\s*"[^"\r\n]+"\s*:/.test(source.slice(i+1))){
        repaired.push({reason:'stray quote and comma after number'});i++;continue;
      }
      // A quote closing a text value belongs to the string, including formulas
      // ending in } or ]. Only remove quotes outside strings after containers.
      if(/[}\]]/.test(previous)&&/^\s*[,}\]]/.test(source.slice(i+1))){
        repaired.push({reason:'stray quote after container'});continue;
      }
      inString=true;
    }
    result+=ch;if(!/\s/.test(ch))previous=ch;
  }
  return result;
}
function parseValue(source,start){
  // Try complete JSON prefixes. A broken quote in one entry cannot hide later
  // siblings, unlike a single quote-state scan over the entire response.
  for(let end=start+1;end<=source.length;end++){
    if(!/[}\]"\delt]/.test(source[end-1]))continue;
    if(end<source.length&&!/[\s,\]}]/.test(source[end]))continue;
    try{return {value:JSON.parse(source.slice(start,end)),end};}catch{}
  }
  return null;
}
export function recoverBitmapResponse(text,schema){
  const original=String(text??'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const keys=schemas[schema];if(!keys)throw Error('Unknown bitmap response schema');
  const required=schema==='inventory'?'items':schema==='patch'?'operations':schema==='diagnosis'?'defects':null;
  try{let value=JSON.parse(original);if(schema==='scene'&&Array.isArray(value))value={nodes:value};if(value&&typeof value==='object'&&(!required||Array.isArray(value[required])))return {...value,recovery:{schema,repaired:[],rejected:[]}};}catch{}
  const repaired=[];
  // Only unambiguous punctuation repairs; invalid values are never guessed.
  let source=original.replace(/([{,]\s*)"([A-Za-z_$][\w$-]*)="(?=[^:])/g,(_,prefix,key)=>{repaired.push({reason:'property separator',key});return prefix+'"'+key+'":"';});
  source=removeContainerStrayQuotes(source,repaired);
  const result={},rejected=[];
  // Preserve explicit coordinate provenance even when a later array is truncated.
  for(const key of ['canvas','complete','wholeImageAcceptable','inventoryComplete','summary']){
    const match=new RegExp('"'+key+'"\\s*:\\s*').exec(source);
    if(match){const parsed=parseValue(source,match.index+match[0].length);if(parsed)result[key]=parsed.value;}
  }
  const fields=[...source.matchAll(new RegExp('"('+keys.join('|')+')"\\s*:\\s*\\[','g'))];
  for(let f=0;f<fields.length;f++){
    const match=fields[f],key=match[1],start=match.index+match[0].length;
    if(result[key])continue;
    const limit=fields[f+1]?.index??source.length;
    const body=source.slice(start,limit), entries=[];
    let cursor=0,index=0;
    while(cursor<body.length){
      while(/[\s,]/.test(body[cursor]||'')&&cursor<body.length)cursor++;
      if(cursor>=body.length||body[cursor]===']')break;
      const parsed=parseValue(body,cursor);
      if(parsed){entries.push(parsed.value);cursor=parsed.end;index++;continue;}
      // Resynchronize only at a sibling object with the schema's discriminator.
      const discriminator=key==='operations'?'op':key==='items'?'id':key==='defects'?'x|reason|objectIds':key==='evidence'?'itemId':key==='nodes'||key==='elements'||key==='objects'||key==='shapes'?'id|type|kind|shape':key==='layers'?'backItemId':key==='connections'?'itemId':null;
      const next=discriminator?new RegExp(',\\s*(\\{\\s*"(?:'+discriminator+')"\\s*:)','g'):null;
      if(next)next.lastIndex=cursor+1;
      const boundary=next?.exec(body),end=boundary?boundary.index+boundary[0].indexOf('{'):body.length;
      rejected.push({field:key,index,reason:'Invalid JSON entry; isolated without guessing values',excerpt:body.slice(cursor,Math.min(end,cursor+180))});
      index++;if(!boundary)break;cursor=end;
    }
    result[key]=entries;
  }
  if(required&&!Array.isArray(result[required]))throw Error('Bitmap response lacks '+required+' array');
  if(schema==='scene'&&!['nodes','elements','objects','shapes'].some(k=>Array.isArray(result[k])))throw Error('Bitmap response lacks editable nodes array; regions are metadata');
  result.recovery={schema,repaired,rejected};
  // Evidence recovered from malformed JSON cannot certify formal acceptance.
  if(schema==='inventory'||schema==='diagnosis')result.uncertainties=[...(result.uncertainties||[]),'JSON 结构经恢复，需复核；隔离条目 '+rejected.length];
  return result;
}

export function visibleEditableContent(scene){
  const W=scene?.canvas?.width??scene?.canvas?.w??Infinity,H=scene?.canvas?.height??scene?.canvas?.h??Infinity;
  const painted=v=>v!=null&&!/^(?:none|transparent|rgba\([^)]*,\s*0(?:\.0*)?\s*\)|#[\da-f]{6}00)$/i.test(String(v).trim());
  return (scene?.nodes||[]).filter(n=>{
    if(!n||n.hidden||n.visible===false||Number(n.opacity??1)<=0)return false;
    const x=Number(n.x??0),y=Number(n.y??0),w=Number(n.w??n.width??0),h=Number(n.h??n.height??0);
    if(x>=W||y>=H||x+w<0||y+h<0)return false;
    const fill=painted(n.fill)&&Number(n.fillOpacity??1)>0,stroke=painted(n.stroke)&&Number(n.strokeOpacity??1)>0&&Number(n.strokeWidth??1)>0;
    if(n.type==='text')return !!String(n.text??'').trim()&&fill&&Number(n.fontSize??12)>0;
    if(n.type==='image')return w>0&&h>0&&!!(n.href||n.src||n.dataUrl);
    if(n.type==='line')return stroke&&(n.x!==n.x2||n.y!==n.y2);
    if(n.type==='path')return (fill||stroke)&&typeof n.d==='string'&&/[LlCcQqAaHhVvSsTt]/.test(n.d);
    if(n.type==='polyline')return (fill||stroke)&&n.points?.length>1;
    // A white page/background alone is not usable reconstructed content.
    if(x<=0&&y<=0&&w>=W&&h>=H&&!stroke&&/^#(?:fff|ffffff)$/i.test(n.fill||''))return false;
    return ['rect','ellipse'].includes(n.type)&&w>0&&h>0&&(fill||stroke);
  });
}
