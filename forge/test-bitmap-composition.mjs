import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const source=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const targetsStart=source.indexOf('const TARGETS = {');
const targets=source.slice(targetsStart,source.indexOf('\n};',targetsStart)+3);
const helpers=source.slice(source.indexOf('function generationIntent('),source.indexOf('\nconst SVG_SYS'));
const budgets=source.slice(source.indexOf('function imagePromptBudget('),source.indexOf('function selectImageRoute('));
const start=source.indexOf('  const guide = layoutGuide',source.indexOf('async function genOaiImage('));
const assembly=source.slice(start,source.indexOf('\n  let body;',start));
assert.ok(start>0);

function harness(){
  const ctx={
    $:()=>({value:'overview'}),tt:key=>key,refs:new Set(),data:{figs:[]},GAL_I18N:{lang:'en'},
    passMode:'two',analysis:{j:{layoutBlueprint:[
      {id:'Zone 1',role:'Stacked robot demonstrations',x:48,y:126,w:288,h:504},
      {id:'Zone 11',role:'Closed-loop feedback',x:1056,y:657,w:496,h:189}
    ]}},figureCanvas:()=>({width:1600,height:900})
  };
  runInNewContext(`${targets}\n${helpers}\n${budgets}
    function imagePrompt(content,model,ratio,layoutGuide){
      const resolution='2K',tg=TARGETS.overview;
      ${assembly}
      return imgPrompt;
    }`,ctx);
  return ctx;
}

test('blueprint guidance preserves exact internal coordinates and excludes Zone IDs',()=>{
  const ctx=harness();
  const guide=ctx.compactImageGuide(ctx.analysis.j);
  assert.match(guide,/Stacked robot demonstrations/);
  assert.match(guide,/Closed-loop feedback/);
  assert.match(guide,/never visible text/);
  assert.match(guide,/bbox=\(48,126,288,504\)/);
  assert.match(guide,/bbox=\(1056,657,496,189\)/);
  assert.match(guide,/source 1600x900 grid/);
  assert.match(guide,/Never print bbox values, Zone IDs or planning instructions/);
  assert.doesNotMatch(guide,/Zone\s*\d|@/);
});

for(const model of ['gpt-image-2.5-sunburst','qwen-image','qwen-image-2.0']){
  for(const analyzed of [false,true]){
    for(const longInput of [false,true]){
      test(`${model}: complete composition rules survive ${analyzed?'analyzed':'direct'} ${longInput?'compressed':'short'} prompts`,()=>{
        const ctx=harness();
        ctx.passMode=analyzed?'two':'one';
        const content='Method: encoder to robot controller. Results: measured success rate 85%. '.repeat(longInput?500:1);
        const prompt=ctx.imagePrompt(content,model,'16:9','Reference topology and palette. '.repeat(longInput?2000:1));
        assert.match(prompt,/Fill the complete 16:9 rectangular canvas/);
        assert.match(prompt,/No missing corner, L-shaped content, or large blank region/);
        assert.match(prompt,/Never draw planning metadata: Zone labels\/numbers, layout coordinates\/percentages, role codes or instructions/);
        assert.match(prompt,/genuine chart axes\/measurements are allowed/);
        assert.match(prompt,/encoder to robot controller/);
        if(analyzed){
          assert.match(prompt,/bbox=\(48,126,288,504\)/);
          assert.match(prompt,/bbox=\(1056,657,496,189\)/);
          assert.match(prompt,/Never print bbox values, Zone IDs or planning instructions/);
        }
        assert.ok(ctx.imagePromptSize(prompt,ctx.imagePromptBudget(model))<=ctx.imagePromptBudget(model).limit);
      });
    }
  }
}

test('composition follows the selected aspect ratio without forcing square output',()=>{
  const prompt=harness().imagePrompt('Method: encoder to output.','gpt-image','4:3','');
  assert.match(prompt,/Fill the complete 4:3 rectangular canvas/);
});

test('internal geometry retains fractional precision without percentage rounding',()=>{
  const ctx=harness();
  ctx.analysis.j.layoutBlueprint=[{role:'Zone 7: Visual encoder',x:48.125,y:126.375,w:288.625,h:504.875}];
  const guide=ctx.compactImageGuide(ctx.analysis.j);
  assert.match(guide,/Visual encoder bbox=\(48\.125,126\.375,288\.625,504\.875\)/);
  assert.doesNotMatch(guide,/Zone 7/);
});
