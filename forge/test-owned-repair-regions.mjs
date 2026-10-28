import assert from 'node:assert/strict';
import {planOwnedDefectRegions} from './bitmap-evidence.mjs';
import {planDefectRegions} from './reconstruction-pipeline.mjs';

const scene={nodes:[{id:'cross',type:'rect',x:400,y:100,w:200,h:100,owner:'global'}]};
const owners=[{id:'left',x:0,y:0,w:500,h:1000},{id:'right',x:500,y:0,w:500,h:1000}];
const d=(x,w,reason,objectIds=[])=>({x,y:100,w,h:100,reason,objectIds});
const defects=[d(300,150,'left'),d(500,150,'right'),d(440,100,'bridge')];
const regions=planOwnedDefectRegions(scene,defects,1000,1000,owners,planDefectRegions);
assert.equal(regions.length,3,'a cross-panel diagnosis must not transitively absorb both panel repairs');
assert.deepEqual(regions.flatMap(r=>r.reasons).sort(),defects.map(d=>d.reason).sort());
assert.equal(new Set(regions.map(r=>r.id)).size,3);
const cross=planOwnedDefectRegions(scene,[d(410,20,'whole object',['cross'])],1000,1000,owners,planDefectRegions);
assert.equal(cross.length,1);
assert.ok(cross[0].coreX<=400&&cross[0].coreRight>=600,'target objects must remain complete across owner boundaries');
assert.deepEqual(cross[0].targetIds,['cross']);
assert.deepEqual(planOwnedDefectRegions(scene,defects,1000,1000,[],planDefectRegions),planDefectRegions(scene,defects,1000,1000,[]),'whole-image fallback retains the original planner');
console.log('owned repair region checks passed');
