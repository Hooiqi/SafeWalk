// Applies supabase/migrations to DATABASE_URL in filename order.
// Intended for a plain local PostgreSQL + PostGIS database (with --shim) and
// for CI. Against a Supabase project use the Supabase CLI instead:
//   supabase link --project-ref <ref> && supabase db push
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase');

export async function applyMigrations(connectionString, { shim = false, seed = false } = {}) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const files = [];
    if (shim) files.push(path.join(root, 'local/supabase-shim.sql'));
    const migrations = (await readdir(path.join(root, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
    files.push(...migrations.map((f) => path.join(root, 'migrations', f)));
    if (seed) files.push(path.join(root, 'seed.sql'));
    for (const file of files) {
      await client.query(await readFile(file, 'utf8'));
    }
    return files.map((f) => path.relative(root, f));
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const applied = await applyMigrations(process.env.DATABASE_URL, { shim: args.has('--shim'), seed: args.has('--seed') });
  console.log(`Applied:\n  ${applied.join('\n  ')}`);
}
