import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeRevisionEdges,placeRevisionLabels} from './revision-routing.mjs';
const item=(id,x,y,width=70,height=45)=>({id,keep:true,target:{x,y,width,height}});
const intersects=(a,b,r)=>a.x===b.x
 ?a.x>r.x&&a.x<r.x+r.width&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.height
 :a.y>r.y&&a.y<r.y+r.height&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.width;
for(const [direction,from,to] of [
 ['right',item('a',25,130),item('b',400,130)],
 ['left',item('a',400,130),item('b',25,130)],
 ['up',item('a',220,250),item('b',220,20)],
 ['down',item('a',220,20),item('b',220,250)]
])test('routes '+direction+' around intervening content without moving nodes',()=>{
 const obstacle=item('legend',180,100,140,100),items=[from,to,obstacle];
 const before=structuredClone(items),edge={from:'a',to:'b',label:'condition'};
 const [route]=routeRevisionEdges({items,edges:[edge]},520,330);
 assert.deepEqual(items,before);assert.deepEqual(route.edge,edge);
 assert.ok(route.points.length>=4);
 for(let n=1;n<route.points.length;n++){
  const a=route.points[n-1],b=route.points[n];
  assert.ok(a.x===b.x||a.y===b.y,'orthogonal path');
  assert.ok(a.x>=0&&a.x<=520&&a.y>=0&&a.y<=330);
  assert.equal(intersects(a,b,obstacle.target),false,'must not cross legend');
 }
 const end=route.points.at(-1),r=to.target;
 assert.ok((end.x===r.x||end.x===r.x+r.width)&&end.y>=r.y&&end.y<=r.y+r.height||
  (end.y===r.y||end.y===r.y+r.height)&&end.x>=r.x&&end.x<=r.x+r.width,'arrow ends on destination');
});
test('horizontal sibling arrangement retains independent directed branches',()=>{
 const edges=['partial','stalled','failed'].map(to=>({from:'stage',to,label:''}));
 const routes=routeRevisionEdges({items:[item('stage',220,20),item('partial',40,220),item('stalled',220,220),item('failed',400,220)],edges},520,330);
 assert.deepEqual(routes.map(r=>r.edge),edges);
 assert.throws(()=>routeRevisionEdges({items:[],edges},520,330),/端点/);
});
test('parallel branch conditions avoid shared stems, nodes and each other',()=>{
 const items=[item('stage',150,140,100,90),item('red',620,60,100,45),item('green',620,160,100,45),item('gray',620,260,100,45)];
 const edges=['red','green','gray'].map((to,i)=>({from:'stage',to,label:'condition '+i}));
 const routes=placeRevisionLabels(routeRevisionEdges({items,edges},800,400),items,800,400,()=>({width:100,height:28}));
 const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
 routes.forEach((r,i)=>{
  assert.ok(r.labelBox);
  assert.equal(items.some(item=>overlap(item.target,r.labelBox)),false);
  assert.equal(routes.slice(0,i).some(other=>overlap(other.labelBox,r.labelBox)),false);
 });
 assert.throws(()=>placeRevisionLabels([{edge:{label:'long'},points:[{x:10,y:10},{x:11,y:10}]}],[],50,50,()=>({width:100,height:28})),/分支条件/);
});
