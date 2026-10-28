import assert from 'node:assert/strict';
import {runRepairQueue} from './repair-queue.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const gates=Object.fromEntries(['slow','fast','third','fourth','dependent'].map(id=>[id,deferred()]));
const started=[],committed=[],validation=deferred();let version=0,peak=0,preparing=0;
const run=runRepairQueue(Object.keys(gates),{
  limit:3,
  describe:id=>({id,version}),
  conflicts:(a,b)=>[a.id,b.id].includes('fast')&&[a.id,b.id].includes('dependent'),
  async prepare(entry){started.push(entry);peak=Math.max(peak,++preparing);await gates[entry.id].promise;preparing--;return entry;},
  async commit(entry){if(entry.id==='fast')await validation.promise;committed.push(entry.id);version++;}
});
await turn();assert.deepEqual(started.map(e=>e.id),['slow','fast','third']);
gates.fast.resolve();await turn();
assert.deepEqual(committed,[]);assert.equal(started.length,3,'validation retains its reservation');
validation.resolve();await turn();
assert.deepEqual(committed,['fast'],'a slow first request must not block a completed patch');
assert.equal(started[3].id,'fourth','refill before slow and third finish');
assert.equal(started[3].version,1,'new work uses the latest committed scene');
gates.fourth.resolve();await turn();
assert.equal(started[4].id,'dependent');assert.equal(started[4].version,2);
for(const gate of Object.values(gates))gate.resolve();await run;assert.ok(peak<=3);
// Read/write ownership conflicts remain reserved until validation is done.
const owner=deferred(),seen=[];
const serial=runRepairQueue(['owner','dependent','independent'],{
  describe:id=>({id}),conflicts:(a,b)=>a.id!=='independent'&&b.id!=='independent',
  async prepare(entry){seen.push(entry.id);return entry;},
  async commit(entry){if(entry.id==='owner')await owner.promise;}
});
await turn();assert.deepEqual(seen,['owner','independent']);owner.resolve();await serial;
assert.deepEqual(seen,['owner','independent','dependent']);
// Cancellation drains in-flight work without committing it or dispatching more.
const drain=deferred();let cancelled=false,launched=0,mutations=0;
const cancelledRun=runRepairQueue([1,2,3],{limit:2,describe:id=>({id}),conflicts:()=>false,
  check(){if(cancelled)throw Error('cancelled');},
  async prepare(entry){launched++;await drain.promise;return entry;},commit(){mutations++;}});
cancelled=true;drain.resolve();await assert.rejects(cancelledRun,/cancelled/);
assert.equal(launched,2);assert.equal(mutations,0);
console.log('repair queue: rolling concurrency, current snapshots, dependency reservations and cancellation passed');
