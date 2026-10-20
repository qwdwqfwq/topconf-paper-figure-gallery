import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {prepareQuery,buildIndex,rank} from '../forge/retrieval.mjs';

const data={
  figs:[{id:'a',title:'Medical segmentation'},{id:'b',title:'Generic fusion pipeline'}],
  ids:['a','b'],
  bm:{docs:[['medical','segmentation','encoder-decoder'],['fusion','multi-stage','pipeline']]},
  IE:new Float32Array(1024),TE:new Float32Array(1024)
};
test('Chinese topics are expanded without changing the original prompt',()=>{
  const raw='医学图像分割，编码解码结构，多阶段融合';
  const q=prepareQuery(raw);
  assert.equal(q.raw,raw);
  assert.ok(q.topicTerms.includes('medical'));
  assert.ok(!q.topicTerms.includes('fusion'));
  assert.ok(prepareQuery('扩散模型用于图像生成').terms.includes('image'));
});
test('reject misaligned rows before searching',()=>{
  assert.throws(()=>buildIndex({...data,ids:['b','a']}),/未对齐/);
});
test('topic evidence wins over generic structure with equal semantic scores',()=>{
  const index=buildIndex(data),q=prepareQuery('医学图像分割，多阶段融合流水线',index.idf);
  const ranked=rank(index,q,[0,1],[.3,.3],[.3,.3]);
  assert.equal(ranked[0].i,0);
  assert.ok(ranked.every(r=>Number.isFinite(r.score)&&r.score>=0&&r.score<=100));
  assert.deepEqual(rank(index,q,[1],[.3,.3],[.3,.3]).map(r=>r.i),[1]);
});
