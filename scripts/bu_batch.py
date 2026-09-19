# -*- coding: utf-8 -*-
"""Serial in-browser downloader (bu IPC is not thread-safe). Runs INSIDE a
plane='bu' cell via exec(open(...).read()). Jobs: data/batch_jobs.json.
State: window.__bdone (page JS). Turnstile refreshed via hidden iframe every
200s and on any failure.
  BATCH='data/batch_jobs.json'; exec(open(r'scripts/bu_batch.py',encoding='utf-8').read())
"""
import seed_browser_use as bu
import time, json
from pathlib import Path

ROOT = r"C:\Users\黎枭\Doubao\chats\2026-09-16\new-chat\topconf-paper-figure-gallery"
jobs = json.loads(Path(ROOT, BATCH).read_text(encoding="utf-8"))

bu.js(r"""
if(!window.__bdone){window.__bdone={};}
window.__challenge=function(){
  return new Promise(res=>{
    if(window.__block){res('busy');return;}
    window.__block=true;
    const f=document.createElement('iframe');
    f.style.cssText='width:300px;height:120px;position:fixed;right:8px;bottom:8px;opacity:0.02;z-index:99999';
    f.src='https://openreview.net/challenge?redirect='+encodeURIComponent('https://api.openreview.net/notes?forum=doBkiqESYq')+'&_='+Date.now();
    let d=false;
    const fin=()=>{if(d)return;d=true;setTimeout(()=>{try{f.remove()}catch(e){};window.__block=false;res('ok');},12000);};
    f.onload=()=>setTimeout(fin,600);
    setTimeout(fin,30000);
    document.body.appendChild(f);
  });
};
""")
prior = json.loads(bu.js("JSON.stringify(window.__bdone)"))
jobs = [j for j in jobs if j["id"] not in prior]
print("new jobs:", len(jobs), flush=True)

def needs_challenge(rec):
    p = rec.get("path")
    if not p:
        return True
    try:
        head = open(p, "rb").read(4000).decode("utf-8", "ignore").lower()
        hit = any(k in head for k in ("challenge-platform", "turnstile", "cloudflare", "verifying your browser"))
        try:
            import os as _os
            if not hit:
                _os.remove(p)  # delete small 404/error HTML so recovery ignores it
        except Exception:
            pass
        return hit
    except Exception:
        return True

t0 = time.time(); okc = failc = 0; last_challenge = time.time()
for n, j in enumerate(jobs, 1):
    rec = None
    for attempt in range(2):
        if time.time() - last_challenge > 200:
            bu.js("window.__challenge()"); time.sleep(10); last_challenge = time.time()
        try:
            rec = bu.download(j["url"], filename=j["id"] + ".pdf", timeout=75)
        except Exception as e:
            rec = {"state": "err", "error": str(e)[:150]}
        if rec.get("state") == "completed" and rec.get("bytes", 0) > 50000:
            break
        if attempt == 0 and needs_challenge(rec):
            bu.js("window.__challenge()"); time.sleep(10); last_challenge = time.time()
        else:
            break
    good = rec.get("state") == "completed" and rec.get("bytes", 0) > 50000
    r = {"id": j["id"], "ok": good, "path": rec.get("path"), "bytes": rec.get("bytes"),
         "state": rec.get("state"), "error": rec.get("error")}
    bu.js("window.__bdone[%s]=%s;" % (json.dumps(j["id"]), json.dumps(r)))
    okc += good; failc += (not good)
    if n % 20 == 0:
        print(f"{n}/{len(jobs)} ok={okc} fail={failc} {(time.time()-t0)/60:.1f}min", flush=True)
print("CELLBATCH DONE", okc, failc, f"{(time.time()-t0)/60:.1f}min", flush=True)
print("LEDGER:" + bu.js("JSON.stringify(window.__bdone)"))
