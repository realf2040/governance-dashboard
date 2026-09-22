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
async function init(DB){
 await DB.prepare("CREATE TABLE IF NOT EXISTS governance_users (username TEXT PRIMARY KEY COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await DB.prepare("CREATE TABLE IF NOT EXISTS governance_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,action TEXT NOT NULL,record_id INTEGER,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await DB.prepare("INSERT OR IGNORE INTO governance_users(username,password,role,active) VALUES ('SuperAdmin','SuperAdmin','superadmin',1),('Admin','Admin','admin',1)").run();
 try{await DB.prepare("ALTER TABLE governance_records ADD COLUMN saved_by TEXT DEFAULT 'Admin'").run()}catch(e){}
}
function row(r){return {id:r.id,name:r.employee_name,employee_name:r.employee_name,service:r.service,period:r.period,quality:r.quality,csat:r.csat,prod:r.productivity,productivity:r.productivity,date:r.updated_at,created_at:r.created_at,updated_at:r.updated_at,savedBy:r.saved_by||'Admin'};}
async function audit(DB,u,a,id,d){await DB.prepare('INSERT INTO governance_audit(username,action,record_id,details) VALUES (?,?,?,?)').bind(u||'Admin',a,id||null,JSON.stringify(d||{})).run()}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  try{
   await init(env.DB);
   if(url.pathname==='/api/auth/login'&&request.method==='POST'){const b=await request.json(),u=await env.DB.prepare('SELECT username,role FROM governance_users WHERE username=? AND password=? AND active=1').bind(String(b.username||''),String(b.password||'')).first();return u?json({ok:true,user:u}):json({ok:false,error:'Invalid credentials'},401)}
   if(url.pathname==='/api/users'&&request.method==='GET'){const q=await env.DB.prepare("SELECT username,role,active,created_at,updated_at FROM governance_users ORDER BY username").all();return json({ok:true,users:q.results||[]})}
   if(url.pathname==='/api/users'&&request.method==='POST'){const b=await request.json(),name=String(b.username||'').trim(),pass=String(b.password||'');if(!name||!pass)return json({ok:false,error:'Username and password required'},400);await env.DB.prepare("INSERT INTO governance_users(username,password,role,active) VALUES (?,?,?,1)").bind(name,pass,b.role==='admin'?'admin':'user').run();return json({ok:true},201)}
   if(url.pathname==='/api/users/password'&&request.method==='PUT'){const b=await request.json(),u=String(b.username||''),old=String(b.oldPassword||''),nw=String(b.newPassword||'');if(!nw)return json({ok:false,error:'New password required'},400);const x=await env.DB.prepare('SELECT username FROM governance_users WHERE username=? AND password=? AND active=1').bind(u,old).first();if(!x)return json({ok:false,error:'Current password is incorrect'},401);await env.DB.prepare('UPDATE governance_users SET password=?,updated_at=CURRENT_TIMESTAMP WHERE username=?').bind(nw,u).run();return json({ok:true})}
   if(url.pathname==='/api/users/reset-password'&&request.method==='PUT'){const b=await request.json();if(!b.username||!b.password)return json({ok:false,error:'Required'},400);await env.DB.prepare('UPDATE governance_users SET password=?,updated_at=CURRENT_TIMESTAMP WHERE username=?').bind(String(b.password),String(b.username)).run();await audit(env.DB,request.headers.get('x-governance-user')||'SuperAdmin','RESET_PASSWORD',null,{username:b.username});return json({ok:true})}
   if(url.pathname==='/api/users/status'&&request.method==='PUT'){const b=await request.json(),name=String(b.username||'');if(!name||name.toLowerCase()==='superadmin')return json({ok:false,error:'Not allowed'},400);await env.DB.prepare('UPDATE governance_users SET active=?,updated_at=CURRENT_TIMESTAMP WHERE username=?').bind(b.active?1:0,name).run();await audit(env.DB,request.headers.get('x-governance-user')||'SuperAdmin',b.active?'ENABLE_USER':'DISABLE_USER',null,{username:name});return json({ok:true})}
   const um=url.pathname.match(/^\/api\/users\/([^/]+)$/);if(um&&request.method==='DELETE'){const name=decodeURIComponent(um[1]);if(name.toLowerCase()==='superadmin')return json({ok:false,error:'Not allowed'},400);await env.DB.prepare('DELETE FROM governance_users WHERE username=?').bind(name).run();await audit(env.DB,request.headers.get('x-governance-user')||'SuperAdmin','DELETE_USER',null,{username:name});return json({ok:true})}
   if(url.pathname==='/api/audit'&&request.method==='GET'){const q=await env.DB.prepare('SELECT id,username,action,record_id,details,created_at FROM governance_audit ORDER BY id DESC LIMIT 500').all();return json({ok:true,logs:q.results||[]})}
   if(!url.pathname.startsWith('/api/records')) return env.ASSETS.fetch(request);
   if(request.method==='GET'&&url.pathname==='/api/records'){
    const q=await env.DB.prepare('SELECT id,employee_name,service,period,quality,csat,productivity,created_at,updated_at,saved_by FROM governance_records ORDER BY id DESC').all();
    return json({ok:true,records:(q.results||[]).map(row)});
   }
   if(request.method==='POST'&&url.pathname==='/api/records'){
    const b=await request.json(),v=clean(b); if(!v)return json({ok:false,error:'Invalid record'},400);const user=String(b.savedBy||'Admin');
    const q=await env.DB.prepare('INSERT INTO governance_records (employee_name,service,period,quality,csat,productivity,created_at,updated_at,saved_by) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?) RETURNING *').bind(v.employee_name,v.service,v.period,v.quality,v.csat,v.productivity,user).first();await audit(env.DB,user,'CREATE',q.id,row(q));
    return json({ok:true,record:row(q)},201);
   }
   const m=url.pathname.match(/^\/api\/records\/(\d+)$/); if(!m)return json({ok:false,error:'Not found'},404);
   const id=Number(m[1]);
   if(request.method==='PUT'){
    const b=await request.json(),v=clean(b); if(!v)return json({ok:false,error:'Invalid record'},400);const user=String(b.savedBy||'Admin');
    const q=await env.DB.prepare('UPDATE governance_records SET employee_name=?,service=?,period=?,quality=?,csat=?,productivity=?,updated_at=CURRENT_TIMESTAMP,saved_by=? WHERE id=? RETURNING *').bind(v.employee_name,v.service,v.period,v.quality,v.csat,v.productivity,user,id).first();if(q)await audit(env.DB,user,'UPDATE',id,row(q));
    return q?json({ok:true,record:row(q)}):json({ok:false,error:'Record not found'},404);
   }
   if(request.method==='DELETE'){
    const q=await env.DB.prepare('DELETE FROM governance_records WHERE id=? RETURNING id').bind(id).first();
    if(q)await audit(env.DB,request.headers.get('x-governance-user')||'Admin','DELETE',id,{id});return q?json({ok:true,id}):json({ok:false,error:'Record not found'},404);
   }
   return json({ok:false,error:'Method not allowed'},405);
  }catch(e){return json({ok:false,error:'Database operation failed'},500)}
 }
};