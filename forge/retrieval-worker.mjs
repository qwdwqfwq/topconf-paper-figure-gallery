// Download, WASM initialization and inference stay off the UI thread.
let tokenizer,model;
const sendProgress=progress=>{
  self.postMessage({type:'progress',progress});
  if(progress.status==='done'&&/\.onnx$/.test(progress.file||''))self.postMessage({type:'progress',progress:{status:'initialize'}});
};
self.onmessage=async({data:m})=>{
  try{
    if(m.type==='init'){
      const T=await import('./vendor/transformers.min.js');
      T.env.allowLocalModels=true;T.env.allowRemoteModels=false;
      T.env.localModelPath=new URL('models/',m.base).href;
      T.env.backends.onnx.wasm.wasmPaths=new URL('vendor/',m.base).href;
      T.env.backends.onnx.wasm.numThreads=1;
      const name='clip-vit-base-patch32';
      tokenizer=await T.AutoTokenizer.from_pretrained(name,{progress_callback:sendProgress});
      model=await T.CLIPTextModelWithProjection.from_pretrained(name,{dtype:'q8',progress_callback:sendProgress});
      self.postMessage({type:'ready'});
    }else if(m.type==='embed'){
      const out=await model(tokenizer(m.text,{padding:true,truncation:true}));
      const v=out.text_embeds.tolist()[0],n=Math.hypot(...v);
      if(v.length!==512||!Number.isFinite(n)||n===0)throw new Error('Invalid semantic vector');
      self.postMessage({type:'vector',id:m.id,vector:v.map(x=>x/n)});
    }
  }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
};
