import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {connectDatabase} from '../src/db.js';
import {compute} from '../src/ledger.js';
let client;
try{
 const path=process.argv[2];if(!path)throw Error('Usage: npm run restore -- path/to/backup.json');
 const backup=JSON.parse(await readFile(path,'utf8'));
 if(backup.format!=='kundeeeq-ledger-v1'||!Array.isArray(backup.ledger?.entries)||backup.ledger.entries.length>10000)throw Error('Unsupported backup.');
 const entries=backup.ledger.entries;
 if(new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('Backup has duplicate transaction IDs.');
 compute(entries);
 const prompt=createInterface({input:process.stdin,output:process.stdout});
 const answer=await prompt.question(`Restore ${entries.length} records? This replaces ALL current ledger records. Make a fresh backup first. Type RESTORE: `);prompt.close();
 if(answer!=='RESTORE')throw Error('Restore cancelled.');
 const connection=await connectDatabase();client=connection.client;
 const current=await connection.db.collection('ledger').findOne({_id:'main'});
 const write=await connection.db.collection('ledger').updateOne({_id:'main',version:current.version},{$set:{entries,version:current.version+1},$push:{history:{$each:[{at:new Date(),action:'restore',version:current.version+1,count:entries.length}],$slice:-1000}}});
 if(write.modifiedCount!==1)throw Error('Ledger changed during restore. No restore was applied.');
 console.log('Ledger restored. Refresh all open devices.');
}catch(error){console.error('Restore failed:',error.message);process.exitCode=1}
finally{if(client)await client.close()}
