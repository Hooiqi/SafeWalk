import pg from 'pg';

// timestamptz -> ISO string is handled by pg (Date). bigint (log ids) stays a string.

export function createPool(config) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  // PostGIS lives in the "extensions" schema, which Supabase already puts on
  // the search_path of the postgres role (the local test shim does the same).
  return pool;
}

/** Run fn inside a transaction, rolling back on error. */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
