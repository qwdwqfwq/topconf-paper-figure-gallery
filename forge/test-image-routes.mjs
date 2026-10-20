import test from 'node:test';
import assert from 'node:assert/strict';
import {ImageRoutes,safeImageFailover} from './image-routes.mjs';

const route={base:'https://example.test/v1',model:'image',key:'test',ratio:'16:9',resolution:'4K',references:true};
test('verification is isolated by account, endpoint, model and exact requested image mode',()=>{
  const registry=new ImageRoutes();
  registry.record(route,'verified');
  assert.equal(registry.status(route),'verified');
  for(const [field,value] of Object.entries({base:'https://backup.test/v1',model:'other',key:'other',ratio:'1:1',resolution:'2K',references:false})){
    assert.equal(registry.status({...route,[field]:value}),'unknown',field);
  }
});
test('only matching successful routes can be backups; expired evidence is excluded',()=>{
  let now=0;
  const registry=new ImageRoutes(()=>now);
  const backup={...route,model:'backup'};
  registry.record(backup,'verified');
  registry.record({...route,model:'text',references:false},'verified');
  registry.record({...route,model:'small',resolution:'2K'},'verified');
  registry.record({...route,model:'bad'},'blocked');
  assert.deepEqual(registry.alternatives(route).map(r=>r.model),['backup']);
  now=60_001;
  assert.equal(registry.status({...route,model:'bad'}),'unknown');
  now=30*60*1000+1;
  assert.deepEqual(registry.alternatives(route),[]);
});
test('only explicit no-route responses allow failover, never ambiguous or authentication errors',()=>{
  assert.equal(safeImageFailover(503,'no available compatible accounts'),true);
  assert.equal(safeImageFailover(422,'现在没有线路支持这次要求的生成方式'),true);
  for(const status of [500,502,504,401,403,429]){
    assert.equal(safeImageFailover(status,'no available compatible accounts'),false);
  }
  assert.equal(safeImageFailover(503,'service temporarily unavailable'),false);
  assert.equal(safeImageFailover(422,'invalid request'),false);
});
