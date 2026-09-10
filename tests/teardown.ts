import { pool, schemaName } from '../lib/db';
export default async function teardown(){
  const schema=schemaName();
  if(!/^repoggits_test_(?:dev_)?\d+$/.test(schema))throw new Error('Refusing to remove a non-test schema.');
  await pool().query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool().end();
}
