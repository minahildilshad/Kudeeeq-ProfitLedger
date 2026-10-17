import express from 'express';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {compute,validate,insight} from './ledger.js';
import {token,digest,hashPassword,verifyPassword,sessionToken,cookie} from './security.js';
const publicDir = fileURLToPath(new URL('../views/',import.meta.url));
export function createApp(db) {
  const app=express();
  app.disable('x-powered-by');
  if(process.env.VERCEL || process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
  const origin=process.env.APP_ORIGIN || 'http://localhost:3000';
  if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS.');
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data: blob:; connect-src 'self'; font-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
    if(process.env.NODE_ENV==='production') res.set('Strict-Transport-Security','max-age=31536000');
    next();
  });
  app.use(express.json({limit:'1mb',strict:true}));
  // Only our configured origin may submit writes, including login requests.
  app.use((req,res,next)=>{
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==origin) return res.status(403).json({error:'Open the app using its configured APP_ORIGIN address.'});
    next();
  });
  app.post('/api/auth/login',async(req,res)=>{
    const now=Date.now(),windowSize=900000;
    const bucket=Math.floor(now/windowSize);
    const key=digest(`${req.ip}:${bucket}`);
    const attempt=await db.collection('loginAttempts').findOneAndUpdate(
      {_id:key},
      {$inc:{count:1},$setOnInsert:{expiresAt:new Date((bucket+2)*windowSize)}},
      {upsert:true,returnDocument:'after'}
    );
    if(attempt.count>10)return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
    const email=String(req.body.email||'').trim().toLowerCase();
    const user=await db.collection('users').findOne({email});
    // A dummy hash keeps unknown-email verification on the password-hashing path.
    const stored=user?.passwordHash||'00000000000000000000000000000000:'+ '00'.repeat(64);
    if(!await verifyPassword(req.body.password,stored)||!user)return res.status(401).json({error:'Incorrect email or password.'});
    const raw=token();
    await db.collection('sessions').insertOne({_id:digest(raw),userId:user._id,csrf:token(),expiresAt:new Date(now+43200000)});
    res.set('Set-Cookie',cookie(raw)).json({ok:true});
  });
  app.get('/login',(req,res)=>res.sendFile(publicDir+'login.html'));
  app.get('/api/health',(req,res)=>res.json({ok:true}));
  app.use(async(req,res,next)=>{
    const raw=sessionToken(req);
    const session=raw&&await db.collection('sessions').findOne({_id:digest(raw),expiresAt:{$gt:new Date()}});
    if(!session)return req.path.startsWith('/api/')?res.status(401).json({error:'Please sign in.'}):res.redirect('/login');
    req.session=session;
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('X-CSRF-Token')!==session.csrf)return res.status(403).json({error:'Session check failed. Refresh and retry.'});
    next();
  });
  app.get('/api/auth/me',(req,res)=>res.json({csrf:req.session.csrf}));
  app.post('/api/auth/logout',async(req,res)=>{
    await db.collection('sessions').deleteOne({_id:req.session._id});
    res.set('Set-Cookie',cookie('',true)).json({ok:true});
  });
  app.post('/api/auth/password',async(req,res)=>{
    const user=await db.collection('users').findOne({_id:req.session.userId});
    if(!user||!await verifyPassword(req.body.currentPassword,user.passwordHash))return res.status(400).json({error:'Current password is incorrect.'});
    const passwordHash=await hashPassword(req.body.newPassword);
    await db.collection('users').updateOne({_id:user._id},{$set:{passwordHash}});
    await db.collection('sessions').deleteMany({userId:user._id});
    res.set('Set-Cookie',cookie('',true)).json({ok:true});
  });
  const result=(record,session)=>({version:record.version,entries:record.entries,metrics:compute(record.entries),csrf:session.csrf});
  app.get('/api/ledger',async(req,res)=>res.json(result(await db.collection('ledger').findOne({_id:'main'}),req.session)));
  app.post('/api/ledger',async(req,res)=>{
    const current=await db.collection('ledger').findOne({_id:'main'});
    const body=req.body;
    if(body.action==='ask')return res.json({answer:insight(String(body.question||'').slice(0,500),current.entries)});
    if(!Number.isSafeInteger(body.version)||body.version!==current.version)return res.status(409).json({error:'Records changed on another device. Refresh and review before trying again.'});
    let entries;
    if(body.action==='add'){
      if(!Array.isArray(body.entries)||body.entries.length<1||body.entries.length>500)return res.status(400).json({error:'Add 1 to 500 records.'});
      entries=[...current.entries,...body.entries.map(row=>{
        const entry={id:randomUUID(),type:row.type,date:row.date,product:String(row.product||'').trim(),quantity:row.quantity,unitPrice:row.unitPrice,fees:row.fees,reference:String(row.reference||'').trim()};
        validate(entry);return entry;
      })];
    }else if(body.action==='delete'){
      if(typeof body.id!=='string'||!current.entries.some(e=>e.id===body.id))return res.status(404).json({error:'Transaction not found.'});
      entries=current.entries.filter(e=>e.id!==body.id);
    }else return res.status(400).json({error:'Unknown action.'});
    if(entries.length>10000)return res.status(400).json({error:'The 10,000 record limit has been reached.'});
    compute(entries); // Validate the complete proposed ledger, including FIFO stock, before saving.
    const next={version:current.version+1,entries};
    const write=await db.collection('ledger').updateOne({_id:'main',version:current.version},{$set:next,$push:{history:{$each:[{at:new Date(),actor:String(req.session.userId),action:body.action,count:body.entries?.length||1,removedId:body.id||null,version:next.version}],$slice:-1000}}});
    if(write.modifiedCount!==1)return res.status(409).json({error:'Another device saved first. Refresh and review your change.'});
    res.json(result(next,req.session));
  });
  app.get('/api/backup',async(req,res)=>{
    const ledger=await db.collection('ledger').findOne({_id:'main'});
    res.attachment(`kundeeeq-ledger-${new Date().toISOString().slice(0,10)}.json`).json({format:'kundeeeq-ledger-v1',exportedAt:new Date(),ledger});
  });
  app.get('/',(req,res)=>res.sendFile(publicDir+'index.html'));
  app.use((req,res)=>res.status(404).json({error:'Not found.'}));
  app.use((err,req,res,next)=>{
    if(err.status===413)return res.status(413).json({error:'Request is too large.'});
    if(err instanceof SyntaxError)return res.status(400).json({error:'Invalid JSON.'});
    if(err.name==='MongoServerError'||err.name.startsWith('Mongo')){console.error('Database request failed:',err.name);return res.status(503).json({error:'Database unavailable. Refresh before retrying your change.'});}
    res.status(400).json({error:err.message||'Unable to process request.'});
  });
  return app;
}
