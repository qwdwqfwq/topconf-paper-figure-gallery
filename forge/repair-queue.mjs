// Hold an ownership reservation through preparation AND serialized validation.
// A slow request must not prevent unrelated completed work from being committed.
export async function runRepairQueue(items, {limit=3, describe, conflicts, prepare, commit, check=()=>{}}) {
  const pending=[...items], active=new Set();
  let commits=Promise.resolve(), failure;
  while(pending.length||active.size){
    if(!failure){
      try{
        check();
        for(let i=0;i<pending.length&&active.size<limit;){
          const entry=describe(pending[i]);
          if([...active].some(task=>conflicts(task.entry,entry))){i++;continue;}
          pending.splice(i,1);
          const task={entry};active.add(task);
          task.done=(async()=>{
            const result=await prepare(entry);
            const committed=commits.then(()=>{if(failure)throw failure;check();return commit(result);});
            // Serialize mutations even if an earlier commit fails; failure below
            // stops further dispatch and drains every already-started request.
            commits=committed.catch(error=>{failure??=error;});
            await committed;
          })().catch(error=>{failure??=error;}).finally(()=>active.delete(task));
        }
      }catch(error){failure??=error;}
    }
    if(active.size)await Promise.race([...active].map(task=>task.done));
    else if(failure)break;
  }
  await commits;
  if(failure)throw failure;
}
