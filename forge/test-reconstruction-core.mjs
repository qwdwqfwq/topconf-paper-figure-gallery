import assert from 'node:assert/strict';
import {extractEditableNodes,planReconstructionTiles,mergeReconstructionTiles} from './reconstruction-core.mjs';

assert.deepEqual(extractEditableNodes({scene:{nodes:[]}}),[],'blank crops must be valid');
assert.deepEqual(extractEditableNodes({result:{shapes:[{type:'rect'}]}}),[{type:'rect'}]);
assert.throws(()=>extractEditableNodes({message:'provider error'}),/nodes array/);

const tiles=planReconstructionTiles(1600,900);
assert.equal(tiles.length,2);
assert.deepEqual(tiles.map(t=>[t.coreX,t.coreRight]),[[0,800],[800,1600]]);
assert.ok(tiles[0].x+tiles[0].w>tiles[1].x,'adjacent crops must overlap');

const left={tile:tiles[0],scene:{nodes:[
  {id:'cube-front',type:'polyline',points:'730,250 790,250 790,310 730,310',closed:true,fill:'#77AADA'},
  {id:'seam-label',type:'text',x:778,y:100,w:60,h:30,text:'Once'},
  {id:'left-label',type:'text',x:100,y:50,w:80,h:30,text:'Left'},
]}};
const right={tile:tiles[1],scene:{nodes:[
  // This is the same seam label, now in right-tile coordinates.
  {id:'seam-label',type:'text',x:6,y:100,w:60,h:30,text:'Once'},
  {id:'right-line',type:'line',x:40,y:400,x2:120,y2:400,arrow:true},
  {id:'right-path',type:'path',d:'M 40 500 C 80 470 100 530 140 500',stroke:'#222222',fill:'none'},
]}};
const merged=mergeReconstructionTiles([left,right],1600,900);
assert.equal(merged.canvas.width,1600);
assert.equal(merged.nodes.filter(n=>n.text==='Once').length,1,'overlap must not duplicate the same label');
const cube=merged.nodes.find(n=>n.id==='tile1_cube-front');
assert.equal(cube.closed,true,'a cube face must remain a closed polygon');
assert.equal(cube.points,'730,250 790,250 790,310 730,310');
const line=merged.nodes.find(n=>n.id==='tile2_right-line');
assert.deepEqual([line.x,line.x2],[tiles[1].x+40,tiles[1].x+120]);
const path=merged.nodes.find(n=>n.id==='tile2_right-path_part1');
assert.equal(path.type,'polyline');
assert.ok(path.points.startsWith(`${tiles[1].x+40},500`));
assert.equal(merged.counts.total,merged.nodes.length);
console.log('reconstruction tile geometry and overlap: OK');
