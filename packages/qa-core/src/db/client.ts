import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>['db'];

/** Open a pooled drizzle client. Caller owns `pool.end()`. */
export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
