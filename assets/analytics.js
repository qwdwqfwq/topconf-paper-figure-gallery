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

/* Public domain registration notice, independent of analytics and API requests. */
(()=>{
  'use strict';
  const path=location.pathname.replace(/index\.html$/,'').replace(/\/?$/,'/');
  if(!['/topconf-paper-figure-gallery/','/topconf-paper-figure-gallery/forge/'].includes(path))return;
  function showNotice(){
    if(!document.body||document.getElementById('gallery-domain-notice'))return;
    const notice=document.createElement('aside');
    notice.id='gallery-domain-notice';
    notice.setAttribute('role','status');
    notice.setAttribute('aria-label','网站通告');
    notice.textContent='域名备案中，可先使用无限星河api';
    notice.style.cssText='display:block;position:relative;z-index:1000;box-sizing:border-box;width:100%;margin:0;padding:16px 20px;background:#fff0bd;color:#792b08;border-bottom:2px solid #e9ac35;text-align:center;font-size:20px;font-weight:800;line-height:1.5;letter-spacing:.04em;';
    document.body.prepend(notice);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showNotice,{once:true});
  else showNotice();
})();

/* Step 1 connection notice. Static display only; independent of generation. */
(()=>{
  'use strict';
  const path=location.pathname.replace(/index\.html$/,'').replace(/\/?$/,'/');
  if(path!=='/topconf-paper-figure-gallery/forge/')return;
  function showConnectionNotice(){
    const header=document.querySelector('#card1 > .step');
    const contact=header?.querySelector('#authorContactOpen');
    if(!contact||document.getElementById('gallery-connection-notice'))return;
    const notice=document.createElement('span');
    notice.id='gallery-connection-notice';
    notice.textContent='建议不要挂梯子';
    notice.style.cssText='flex:1 0 160px;text-align:center;color:#b45309;font-size:16px;font-weight:700;line-height:1.5;';
    header.insertBefore(notice,contact);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showConnectionNotice,{once:true});
  else showConnectionNotice();
})();
