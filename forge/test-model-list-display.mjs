import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelGeneration,arrangeModels} from './model-list-display.mjs';
const gpt=['5.3','5.4','5.5','5.6','6','6.1','6.2'].flatMap(v=>['sol','terra'].map(t=>`gpt-${v}-${t}`));
test('numeric generations, future versions and same-generation tiers',()=>{
 const r=arrangeModels([...gpt,'gpt-6.10-sol','future-unversioned']);
 assert.deepEqual(r.visible,['gpt-6.10-sol','gpt-6.2-sol','gpt-6.2-terra','gpt-6.1-sol','gpt-6.1-terra','future-unversioned']);
 assert.ok(r.older.includes('gpt-5.3-sol'));assert.equal(new Set([...r.visible,...r.older]).size,16);
 assert.deepEqual(modelGeneration('claude-opus-5-2'),{family:'claude',version:[5,2]});
 assert.deepEqual(modelGeneration('gpt-5-20251101'),{family:'gpt',version:[5,0]});
 assert.equal(modelGeneration('model-20261115'),null);
});
test('thresholds, independent product lines, unknown names and all-model entry',()=>{
 const small=['gpt-5.1','gpt-5.2','gpt-5.3','gpt-5.4'];
 assert.equal(arrangeModels(small).older.length,0);
 const crowded=[...small,...Array.from({length:17},(_,i)=>'unknown-'+(2020+i))];
 assert.deepEqual(arrangeModels(crowded).older,['gpt-5.1']);
 const full=arrangeModels(gpt,{expanded:true});assert.deepEqual(new Set(full.visible),new Set(gpt));
 const lines=arrangeModels([...gpt,'gpt-image-1','gpt-image-2','qwen-image-2.0','qwen-3.8']);
 for(const id of ['gpt-image-1','gpt-image-2','qwen-image-2.0','qwen-3.8'])assert.ok(lines.visible.includes(id));
 assert.deepEqual(arrangeModels([...gpt].reverse(),{enabled:false}).visible,[...gpt].reverse());
});
test('selected legacy or missing model always survives collapse and partial catalogs',()=>{
 for(const selected of ['gpt-5.3-sol','gpt-4-retired']){
  const result=arrangeModels(gpt,{selected});assert.ok(result.visible.includes(selected));assert.ok(!result.older.includes(selected));
 }
});
