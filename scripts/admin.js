import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {connectDatabase} from '../src/db.js';
import {hashPassword} from '../src/security.js';
let hide=false;
const output=new Writable({write(chunk,encoding,callback){if(!hide)process.stdout.write(chunk);callback();}});
const prompt=createInterface({input:process.stdin,output,terminal:true});
let client;
try {
  const email=(await prompt.question('Admin email: ')).trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email.');
  process.stdout.write('Password (12 to 128 characters, hidden): ');hide=true;
  const password=await prompt.question('');hide=false;process.stdout.write('\n');
  process.stdout.write('Confirm password (hidden): ');hide=true;
  const confirmation=await prompt.question('');hide=false;process.stdout.write('\n');
  if(password!==confirmation)throw Error('Passwords do not match.');
  const passwordHash=await hashPassword(password);
  const connection=await connectDatabase();client=connection.client;const db=connection.db;
  const existing=await db.collection('users').findOne({email});
  if(existing){
    const answer=await prompt.question('This admin exists. Reset its password and sign out its sessions? Type RESET: ');
    if(answer!=='RESET')throw Error('No changes made.');
    await db.collection('users').updateOne({_id:existing._id},{$set:{passwordHash}});
    await db.collection('sessions').deleteMany({userId:existing._id});
  }else await db.collection('users').insertOne({email,passwordHash,createdAt:new Date()});
  console.log('Admin saved. Sign in using this email and password.');
}catch(error){process.stderr.write(`\n${error.message}\n`);process.exitCode=1}
finally{prompt.close();if(client)await client.close()}
