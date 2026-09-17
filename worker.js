const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const allowedService=new Set(['quality','tickets','surveys']);
const allowedPeriod=new Set(['daily','weekly','monthly','annual']);
function clean(body){
  const employee_name=String(body.employee_name??body.name??'').trim();
  const service=String(body.service??'').trim();
  const period=String(body.period??'').trim();
  const quality=Number(body.quality),csat=Number(body.csat),productivity=Number(body.productivity??body.prod);
  if(!employee_name||!allowedService.has(service)||!allowedPeriod.has(period)||!Number.isFinite(quality)||quality<0||quality>100||!Number.isFinite(csat)||csat<0||csat>100||!Number.isFinite(productivity)||productivity<0) return null;
  return {employee_name,service,period,quality,csat,productivity:Math.round(productivity)};
}
function row(r){return {id:r.id,name:r.employee_name,employee_name:r.employee_name,service:r.service,period:r.period,quality:r.quality,csat:r.csat,prod:r.productivity,productivity:r.productivity,date:r.updated_at,created_at:r.created_at,updated_at:r.updated_at};}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/records')) return env.ASSETS.fetch(request);
  try{
   if(request.method==='GET'&&url.pathname==='/api/records'){
    const q=await env.DB.prepare('SELECT id,employee_name,service,period,quality,csat,productivity,created_at,updated_at FROM governance_records ORDER BY id DESC').all();
    return json({ok:true,records:(q.results||[]).map(row)});
   }
   if(request.method==='POST'&&url.pathname==='/api/records'){
    const v=clean(await request.json()); if(!v)return json({ok:false,error:'Invalid record'},400);
    const q=await env.DB.prepare('INSERT INTO governance_records (employee_name,service,period,quality,csat,productivity,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *').bind(v.employee_name,v.service,v.period,v.quality,v.csat,v.productivity).first();
    return json({ok:true,record:row(q)},201);
   }
   const m=url.pathname.match(/^\/api\/records\/(\d+)$/); if(!m)return json({ok:false,error:'Not found'},404);
   const id=Number(m[1]);
   if(request.method==='PUT'){
    const v=clean(await request.json()); if(!v)return json({ok:false,error:'Invalid record'},400);
    const q=await env.DB.prepare('UPDATE governance_records SET employee_name=?,service=?,period=?,quality=?,csat=?,productivity=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *').bind(v.employee_name,v.service,v.period,v.quality,v.csat,v.productivity,id).first();
    return q?json({ok:true,record:row(q)}):json({ok:false,error:'Record not found'},404);
   }
   if(request.method==='DELETE'){
    const q=await env.DB.prepare('DELETE FROM governance_records WHERE id=? RETURNING id').bind(id).first();
    return q?json({ok:true,id}):json({ok:false,error:'Record not found'},404);
   }
   return json({ok:false,error:'Method not allowed'},405);
  }catch(e){return json({ok:false,error:'Database operation failed'},500)}
 }
};