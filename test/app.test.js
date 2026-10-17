import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/application.js';
import {compute} from '../src/ledger.js';
import {hashPassword,verifyPassword,sessionToken} from '../src/security.js';
const purchase={type:'purchase',date:'2025-01-01',product:'Pearl earrings',quantity:10,unitPrice:10000,fees:1000,reference:'PO-1'};
const sale={type:'sale',date:'2025-01-02',product:'Pearl earrings',quantity:2,unitPrice:15000,fees:500,reference:'S-1'};
function memoryDatabase(){
 const data={ledger:[{_id:'main',version:0,entries:[],history:[]}],sessions:[],users:[],loginAttempts:[]};
 const match=(row,query)=>Object.entries(query).every(([key,value])=>value&&typeof value==='object'&&'$gt'in value?row[key]>value.$gt:row[key]===value);
 return {data,collection(name){return {
  async findOne(query){return structuredClone(data[name].find(row=>match(row,query))||null)},
  async findOneAndUpdate(query,update){let row=data[name].find(row=>match(row,query));if(!row){row={...query,...structuredClone(update.$setOnInsert||{})};data[name].push(row)}for(const [key,value]of Object.entries(update.$inc||{}))row[key]=(row[key]||0)+value;return structuredClone(row)},
  async insertOne(row){data[name].push(structuredClone(row))},
  async deleteOne(query){data[name]=data[name].filter(row=>!match(row,query))},
  async deleteMany(query){data[name]=data[name].filter(row=>!match(row,query))},
  async updateOne(query,update){const row=data[name].find(row=>match(row,query));if(!row)return{modifiedCount:0};Object.assign(row,structuredClone(update.$set||{}));for(const [key,value]of Object.entries(update.$push||{})){row[key]=[...(row[key]||[]),...structuredClone(value.$each)].slice(value.$slice)}return{modifiedCount:1}}
 }}}
}
test('FIFO fees allocate correctly and overselling fails',()=>{
 const entries=[{...purchase,id:'p'},{...sale,id:'s'}];const totals=compute(entries);
 assert.equal(totals.cogs,20200);assert.equal(totals.net,9300);assert.equal(totals.inventory,80800);
 assert.throws(()=>compute([...entries,{...sale,id:'s2',quantity:9}]),/exceeds available stock/);
 // Two price lots, partial final lot, and the remaining cost must reconcile.
 const costs=compute([{...purchase,id:'1',quantity:3,unitPrice:100,fees:1},{...purchase,id:'2',quantity:2,unitPrice:200,fees:1},{...sale,id:'3',quantity:4,unitPrice:400,fees:0}]);
 assert.equal(costs.cogs+costs.inventory,702);
});
test('password hashing uses distinct salts and verifies secrets',async()=>{
 const a=await hashPassword('A-long-secret-123');const b=await hashPassword('A-long-secret-123');assert.notEqual(a,b);
 assert.equal(await verifyPassword('A-long-secret-123',a),true);assert.equal(await verifyPassword('wrong',a),false);
 await assert.rejects(hashPassword('short'));
 assert.equal(sessionToken({headers:{cookie:'x=1; kundeeeq_session=abc; other=2'}}),'abc');
});
test('authenticated HTTP writes, conflicts, backup, sessions and validation',async t=>{
 process.env.APP_ORIGIN='http://localhost:3000';
 const db=memoryDatabase();db.data.users.push({_id:'admin',email:'admin@example.com',passwordHash:await hashPassword('Private-password-123')});
 const app=createApp(db);const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 assert.equal((await request('/api/ledger')).status,401);
 assert.equal((await request('/')).status,302);
 assert.equal((await request('/api/auth/login','POST',{email:'admin@example.com',password:'Private-password-123'},{Origin:'https://evil.example'})).status,403);
 assert.equal((await request('/api/auth/login','POST',{email:'admin@example.com',password:'wrong'})).status,401);
 const login=await request('/api/auth/login','POST',{email:'admin@example.com',password:'Private-password-123'});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 const initial=await(await request('/api/ledger','GET',undefined,{Cookie:cookie})).json();assert.equal(initial.version,0);
 const headers={Cookie:cookie,'X-CSRF-Token':initial.csrf};
 assert.equal((await request('/api/ledger','POST',{action:'add',version:0,entries:[purchase]},{Cookie:cookie})).status,403);
 const added=await request('/api/ledger','POST',{action:'add',version:0,entries:[purchase]},headers);assert.equal(added.status,200);
 const purchased=await added.json();assert.equal(purchased.version,1);
 assert.equal((await request('/api/ledger','POST',{action:'add',version:0,entries:[purchase]},headers)).status,409);
 // Atomic compare-and-set accepts only one of two simultaneous saves.
 const parallel=await Promise.all([request('/api/ledger','POST',{action:'add',version:1,entries:[sale]},headers),request('/api/ledger','POST',{action:'add',version:1,entries:[sale]},headers)]);
 assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);
 const current=await(await request('/api/ledger','GET',undefined,headers)).json();assert.equal(current.entries.length,2);assert.equal(current.metrics.net,9300);
 assert.equal((await request('/api/ledger','POST',{action:'delete',version:2,id:purchased.entries[0].id},headers)).status,400);
 assert.equal((await request('/api/ledger','POST',{action:'add',version:2,entries:[{...sale,quantity:100}]},headers)).status,400);
 assert.equal((await request('/api/ledger','POST',{action:'add',version:2,entries:[{...purchase,unitPrice:-1}]},headers)).status,400);
 const backup=await(await request('/api/backup','GET',undefined,headers)).json();assert.equal(backup.format,'kundeeeq-ledger-v1');assert.equal(backup.ledger.entries.length,2);
 const insight=await(await request('/api/ledger','POST',{action:'ask',question:'What is my profit?'},headers)).json();assert.match(insight.answer,/93.00/);
 const changed=await request('/api/auth/password','POST',{currentPassword:'Private-password-123',newPassword:'New-private-password-456'},headers);assert.equal(changed.status,200);
 assert.equal((await request('/api/ledger','GET',undefined,headers)).status,401);
 const again=await request('/api/auth/login','POST',{email:'admin@example.com',password:'New-private-password-456'});assert.equal(again.status,200);
 const cookie2=again.headers.get('set-cookie').split(';')[0];const me=await(await request('/api/auth/me','GET',undefined,{Cookie:cookie2})).json();
 assert.equal((await request('/api/auth/logout','POST',{}, {Cookie:cookie2,'X-CSRF-Token':me.csrf})).status,200);
 assert.equal((await request('/api/ledger','GET',undefined,{Cookie:cookie2})).status,401);
 assert.equal(db.data.ledger[0].version,2);assert.equal(db.data.ledger[0].history.length,2);
});
test('login limit is shared between two server instances',async t=>{
 process.env.APP_ORIGIN='http://localhost:3000';
 const db=memoryDatabase();
 const servers=[createApp(db).listen(0,'127.0.0.1'),createApp(db).listen(0,'127.0.0.1')];
 await Promise.all(servers.map(s=>once(s,'listening')));
 t.after(()=>Promise.all(servers.map(s=>new Promise(resolve=>s.close(resolve)))));
 const attempt=i=>fetch(`http://127.0.0.1:${servers[i%2].address().port}/api/auth/login`,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'unknown@example.com',password:'wrong'})});
 for(let i=0;i<10;i++)assert.equal((await attempt(i)).status,401);
 assert.equal((await attempt(10)).status,429);
 assert.equal((await attempt(11)).status,429);
});
