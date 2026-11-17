// Stateless alternate ingress. Never creates its own job namespace or model call.
export default {
 async fetch(request,env){return env.ANALYSIS.fetch(request);}
};
