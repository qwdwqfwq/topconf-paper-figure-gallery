import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const source=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const targetsStart=source.indexOf('const TARGETS = {');
const targets=source.slice(targetsStart,source.indexOf('\n};',targetsStart)+3);
const helpers=source.slice(source.indexOf('function generationIntent('),source.indexOf('\nconst SVG_SYS'));
const budgets=source.slice(source.indexOf('function imagePromptBudget('),source.indexOf('function compactImageGuide('));
const imageStart=source.indexOf('  const budget=imagePromptBudget(model);',source.indexOf('async function genOaiImage('));
assert.ok(imageStart>0);
const imageAssembly=source.slice(imageStart,source.indexOf('\n  let body;',imageStart));

function harness(){
  const nodes={'#target':{value:'overview'},'#targetDesc':{value:''}};
  const ctx={
    $:id=>nodes[id],tt:key=>key,refs:new Set(),data:{figs:[]},GAL_I18N:{lang:'zh'},
    ratio:'16:9',zonePriority:'',hasAnalyzedLayout:true,layoutGuide:'style '.repeat(2000),
    detailedPrompt:'Detailed reference style. '.repeat(2000)
  };
  runInNewContext(`${targets}\n${helpers}\n${budgets}
    function imagePrompt(content,model){
      const tg=TARGETS[$('#target').value] || TARGETS.overview;
      ${imageAssembly}
      return imgPrompt;
    }
    this.targets=TARGETS;`,ctx);
  return {ctx,nodes};
}

for(const target of ['overview','architecture','pipeline','results','custom']){
  for(const model of ['gpt-image-2.5-sunburst','qwen-image','qwen-image-2.0']){
    test(`${target}: manual paper input reaches SVG and ${model} with complete intent`,()=>{
      const {ctx,nodes}=harness();
      nodes['#target'].value=target;
      nodes['#targetDesc'].value='请画训练和推理双分支，末尾必须有反馈环。';
      const description=target==='custom'?nodes['#targetDesc'].value:ctx.targets[target].instr;
      const content='Method: input passes through encoder to output. '.repeat(500);
      const svg=ctx.buildPrompt(content,'reference guide',[]);
      const bitmap=ctx.imagePrompt(content,model);
      for(const prompt of [svg,bitmap]){
        assert.ok(prompt.includes(ctx.targets[target].label));
        assert.ok(prompt.includes(description));
        assert.ok(prompt.includes('input passes through encoder'));
        if(target!=='custom') assert.ok(!prompt.includes(nodes['#targetDesc'].value));
      }
      const budget=ctx.imagePromptBudget(model);
      assert.ok(ctx.imagePromptSize(bitmap,budget)<=budget.limit);
    });
  }
}

test('generation uses the current selection and custom description, independent of PDF parsing',()=>{
  const {ctx,nodes}=harness();
  ctx.imagePrompt('Manual input','gpt-image');
  nodes['#target'].value='custom';
  nodes['#targetDesc'].value='Current custom intent';
  assert.ok(ctx.imagePrompt('Manual input','gpt-image').includes('Current custom intent'));
  assert.ok(ctx.buildPrompt('Manual input','',[]).includes('Current custom intent'));
  nodes['#target'].value='pipeline';
  assert.ok(!ctx.imagePrompt('Manual input','gpt-image').includes('Current custom intent'));
});

test('oversized custom intent is reported rather than silently truncated',()=>{
  const {ctx,nodes}=harness();
  nodes['#target'].value='custom';
  nodes['#targetDesc'].value='绘图要求'.repeat(3000);
  assert.throws(()=>ctx.imagePrompt('Manual input','qwen-image'),/绘图意图超出/);
});
