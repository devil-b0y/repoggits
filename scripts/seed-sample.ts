import { seedSample } from './sample-data';
import { pool } from '../lib/db';

async function main(){try {
  const result=await seedSample({refresh:process.argv.includes('--refresh')});
  console.log(`${result.created?'Created':'updated' in result&&result.updated?'Updated':'Already exists'}: /projects/${result.id}`);
}catch(error){console.error('Sample creation failed:',(error as Error).message);process.exitCode=1;}
finally{await pool().end();}}
void main();
