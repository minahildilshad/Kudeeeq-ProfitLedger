import express from 'express';
import {connectDatabase} from './src/db.js';
import {createApp} from './src/application.js';
const app=express();
let applicationPromise;
function application(){
  if(!applicationPromise){
    applicationPromise=connectDatabase().then(({db})=>createApp(db)).catch(error=>{applicationPromise=undefined;throw error});
  }
  return applicationPromise;
}
app.use(async(req,res)=>{
  try { const backend=await application();backend(req,res); }
  catch(error){console.error('Application initialization failed:',error.name);res.set('Cache-Control','no-store').status(503).json({error:'Unable to connect to the database. Check deployment settings and database access.'});}
});
export default app;
