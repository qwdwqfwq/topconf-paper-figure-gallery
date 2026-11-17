import {imageJobRoute} from './step3-image-protocol.mjs';
export function revisionImageJobRoute(value){
 const route=imageJobRoute(value);if(route)return route;
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.hash&&!u.search&&['infistar.cc','www.infistar.cc','infistar.ai','www.infistar.ai'].includes(u.hostname)&&u.pathname==='/v1/images/edits')return 'infistar';}catch{}
 return null;
}
