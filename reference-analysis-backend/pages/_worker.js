export default {
 async fetch(request,env){
  return env.ANALYSIS.fetch(request);
 }
};
