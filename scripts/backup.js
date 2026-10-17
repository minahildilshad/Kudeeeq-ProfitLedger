import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {connectDatabase} from '../src/db.js';
let client;
try{
 const connection=await connectDatabase();client=connection.client;
 const ledger=await connection.db.collection('ledger').findOne({_id:'main'});
 const directory=resolve(process.argv[2]||'backups');await mkdir(directory,{recursive:true,mode:0o700});
 const file=resolve(directory,`kundeeeq-${new Date().toISOString().replaceAll(':','-')}.json`);
 await writeFile(file,JSON.stringify({format:'kundeeeq-ledger-v1',exportedAt:new Date(),ledger},null,2),{mode:0o600,flag:'wx'});
 console.log(`Ledger backup saved: ${file}`);
}catch(error){console.error('Backup failed:',error.message);process.exitCode=1}
finally{if(client)await client.close()}
