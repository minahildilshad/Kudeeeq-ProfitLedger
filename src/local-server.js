import {connectDatabase} from './db.js';
import {createApp} from './application.js';
try {
  const {client,db}=await connectDatabase();
  const server=createApp(db).listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Kundeeeq ready at ${process.env.APP_ORIGIN||'http://localhost:3000'}`));
  let closing=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
    if(closing)return;closing=true;
    server.close(async()=>{await client.close();process.exit(0)});
    setTimeout(()=>process.exit(1),10000).unref();
  });
} catch(error) { console.error('Startup failed:',error.message);process.exitCode=1; }
