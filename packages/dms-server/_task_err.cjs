const pg=require('pg'); const cfg=require('./src/db/configs/npmrds2.config.json');
(async()=>{
const c=new pg.Client({host:cfg.host,port:cfg.port,database:cfg.database,user:cfg.user,password:cfg.password});
await c.connect();
const t=await c.query(`SELECT etl_context_id,worker_path,status,left(error,1000) error FROM data_manager.tasks WHERE etl_context_id IN (6826,6828) ORDER BY etl_context_id`);
console.log("=== tasks ==="); for(const r of t.rows) console.log(r.etl_context_id, r.worker_path, r.status, '\n  error:', r.error);
const e=await c.query(`SELECT type,left(message,600) message FROM data_manager.task_events WHERE etl_context_id=6828 AND (error=true OR type LIKE '%ogr2ogr%' OR type='log') ORDER BY event_id`);
console.log("\n=== ctx 6828 ogr2ogr/log/error messages ===");
for(const r of e.rows) console.log(`[${r.type}] ${r.message||''}`);
await c.end();
})().catch(e=>{console.error('ERR',e.message)});
