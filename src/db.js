import { MongoClient } from 'mongodb';
import { attachDatabasePool } from '@vercel/functions';
let connectionPromise;
export function connectDatabase() {
  if(!connectionPromise)connectionPromise=openDatabase().catch(error=>{connectionPromise=undefined;throw error});
  return connectionPromise;
}
async function openDatabase(){
  const uri=process.env.MONGODB_URI;
  if(process.env.NODE_ENV==='production'&&!uri)throw new Error('MONGODB_URI is required in production.');
  const client=new MongoClient(uri||'mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:8000,maxPoolSize:5,minPoolSize:0,maxIdleTimeMS:60000});
  try {
    if(process.env.VERCEL)attachDatabasePool(client);
    await client.connect();
    const db=client.db(process.env.MONGODB_DB||'kundeeeq');
    await db.collection('users').createIndex({email:1},{unique:true});
    await db.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0});
    await db.collection('loginAttempts').createIndex({expiresAt:1},{expireAfterSeconds:0});
    await db.collection('ledger').updateOne({_id:'main'},{$setOnInsert:{version:0,entries:[],history:[]}},{upsert:true});
    return {client,db};
  }catch(error){await client.close();throw error}
}
