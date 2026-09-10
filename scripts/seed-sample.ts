import { seedSample } from './sample-data';
import { pool } from '../lib/db';

async function main(){try {
  const result=await seedSample();
  console.log(`${result.created?'Created':'Already exists'}: ${process.env.APP_ORIGIN||'http://localhost:3000'}/projects/${result.id}`);
}catch(error){console.error('Sample creation failed:',(error as Error).message);process.exitCode=1;}
finally{await pool().end();}}
void main();
