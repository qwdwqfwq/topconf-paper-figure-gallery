/* Anonymous gallery analytics. Isolated from generation, requests and exports. */
(()=>{
  'use strict';
  try{
    if(location.hostname!=='qwdwqfwq.github.io')return;
    const endpoint='https://gallery-analytics.lixiao-gallery.workers.dev/collect';
    const path=location.pathname.replace(/index\.html$/,'').replace(/\/?$/,'/');
    if(!['/topconf-paper-figure-gallery/','/topconf-paper-figure-gallery/forge/'].includes(path))return;
    const uuid=()=>crypto.randomUUID();
    let visitor;try{visitor=localStorage.getItem('gallery_anonymous_visitor_v1');if(!/^[a-f0-9-]{36}$/.test(visitor||'')){visitor=uuid();localStorage.setItem('gallery_anonymous_visitor_v1',visitor);}}catch{visitor=uuid();}
    function send(kind,mode=''){
      try{
        const body=JSON.stringify({id:uuid(),visitor,kind,path,mode});
        // Never wait for analytics and never retry a generation event.
        void fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
      }catch{}
    }
    globalThis.GalleryAnalytics=Object.freeze({generation(mode){if(mode==='svg'||mode==='image')send('generate',mode);}});
    send('pageview');
  }catch{}
})();
