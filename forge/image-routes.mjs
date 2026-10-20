// Session-only evidence: never persist credentials or infer edits support from
// a text generation success. A changed credential is a different route.
export class ImageRoutes {
  constructor(now=()=>Date.now()){ this.now=now; this.records=[]; }
  same(a,b){ return ['base','model','key','ratio','resolution','references'].every(k=>a[k]===b[k]); }
  record(route,state){
    this.records=this.records.filter(r=>!this.same(r,route));
    this.records.push({...route,state,at:this.now()});
  }
  status(route){
    const r=this.records.find(r=>this.same(r,route));
    if(!r || this.now()-r.at>(r.state==='verified'?30*60*1000:60*1000)) return 'unknown';
    return r.state;
  }
  alternatives(route){
    return this.records.filter(r=>!this.same(r,route) &&
      ['ratio','resolution','references'].every(k=>r[k]===route[k]) &&
      this.status(r)==='verified');
  }
}

// Only explicit pre-execution rejection is safe for automatic failover.
// 500/read-body failures and network timeouts may already have been billed.
export function safeImageFailover(status,text){
  return status===503 && /no available compatible accounts|没有可用.*(?:账号|渠道)|无可用.*(?:账号|渠道)/i.test(text) ||
    status===422 && /没有线路支持|no.*(?:route|channel).*support/i.test(text);
}
