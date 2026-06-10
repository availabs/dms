const pg=require('pg'); const cfg=require('./src/db/configs/npmrds2.config.json');
(async()=>{
const c=new pg.Client({host:cfg.host,port:cfg.port,database:cfg.database,user:cfg.user,password:cfg.password,connectionTimeoutMillis:10000});
await c.connect();
const t=await c.query(`SELECT etl_context_id,worker_path,status,left(error,1200) error FROM data_manager.tasks WHERE etl_context_id IN (6826,6828) ORDER BY etl_context_id`);
console.log("=== tasks ==="); for(const r of t.rows) console.log(`ctx ${r.etl_context_id} | ${r.worker_path} | ${r.status}\n  error: ${r.error}`);
const e=await c.query(`SELECT type,left(message,700) m FROM data_manager.task_events WHERE etl_context_id=6828 AND (error=true OR type LIKE '%ogr2ogr%') ORDER BY event_id LIMIT 30`);
console.log("\n=== ctx 6828 ogr2ogr/error messages ==="); for(const r of e.rows) console.log(`[${r.type}] ${r.m||'(empty)'}`);
await c.end();
})().catch(e=>console.log("ERR",e.message));
