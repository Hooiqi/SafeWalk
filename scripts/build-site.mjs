// Builds the whole SafeWalk website into ./site, ready to upload to a static
// host (Netlify, Cloudflare Pages):
//
//   /              landing page (apps/landing)
//   /app/          student app, Flutter web (apps/mobile)
//   /dashboard/    security dashboard (apps/dashboard)
//   /t/<token>     trusted-contact tracking page (apps/tracking, files in /tracking/)
//
// Usage:  node scripts/build-site.mjs [deploy/site.json]
// The JSON holds only public values (server URL, Supabase URL, publishable key).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.resolve(root, process.argv[2] ?? 'deploy/site.json');
if (!existsSync(configPath)) {
  console.error(`Missing ${path.relative(root, configPath)}. Copy deploy/site.example.json to deploy/site.json and fill it in.`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
for (const key of ['API_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
  if (!cfg[key] || cfg[key].includes('YOUR-') || cfg[key].includes('...')) {
    console.error(`deploy/site.json: fill in ${key}`);
    process.exit(1);
  }
}
if (/^sb_secret_|service_role/.test(cfg.SUPABASE_ANON_KEY)) {
  console.error('SUPABASE_ANON_KEY must be the publishable (anon) key, never the secret key.');
  process.exit(1);
}
const api = cfg.API_URL.replace(/\/$/, '');
const tiles = cfg.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function run(cmd, args, { cwd = root, env = {} } = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}${cwd !== root ? `   (in ${path.relative(root, cwd)})` : ''}`);
  const res = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(' ')}`);
    process.exit(res.status ?? 1);
  }
}

// Values set here win over any local apps/*/.env file (Vite gives the
// process environment priority), so localhost settings never leak in.
run('npm', ['run', 'build', '-w', '@safewalk/landing'], { env: { VITE_APP_URL: '/app/', VITE_DASHBOARD_URL: '/dashboard/' } });
run('npm', ['run', 'build', '-w', '@safewalk/dashboard'], {
  env: { VITE_BASE: '/dashboard/', VITE_API_URL: api, VITE_SUPABASE_URL: cfg.SUPABASE_URL, VITE_SUPABASE_ANON_KEY: cfg.SUPABASE_ANON_KEY, VITE_TILE_URL: tiles },
});
run('npm', ['run', 'build', '-w', '@safewalk/tracking'], { env: { VITE_BASE: '/tracking/', VITE_API_URL: api, VITE_TILE_URL: tiles } });

const defines = {
  API_URL: api,
  SUPABASE_URL: cfg.SUPABASE_URL,
  SUPABASE_ANON_KEY: cfg.SUPABASE_ANON_KEY,
  TILE_URL: tiles,
  FIREBASE_API_KEY: cfg.FIREBASE_API_KEY ?? '',
  FIREBASE_APP_ID: cfg.FIREBASE_APP_ID ?? '',
  FIREBASE_SENDER_ID: cfg.FIREBASE_SENDER_ID ?? '',
  FIREBASE_PROJECT_ID: cfg.FIREBASE_PROJECT_ID ?? '',
};
const mobile = path.join(root, 'apps/mobile');
const definesFile = path.join(mobile, 'build', 'site-defines.json');
mkdirSync(path.dirname(definesFile), { recursive: true });
writeFileSync(definesFile, JSON.stringify(defines, null, 2));
run('flutter', ['build', 'web', '--release', '--no-web-resources-cdn', '--base-href', '/app/', `--dart-define-from-file=${definesFile}`], { cwd: mobile });

// Assemble ./site
const site = path.join(root, 'site');
rmSync(site, { recursive: true, force: true });
cpSync(path.join(root, 'apps/landing/dist'), site, { recursive: true });
cpSync(path.join(root, 'apps/dashboard/dist'), path.join(site, 'dashboard'), { recursive: true });
cpSync(path.join(root, 'apps/tracking/dist'), path.join(site, 'tracking'), { recursive: true });
cpSync(path.join(mobile, 'build/web'), path.join(site, 'app'), { recursive: true });

// Netlify and Cloudflare Pages both read these two files.
writeFileSync(
  path.join(site, '_redirects'),
  [
    '# Dashboard and tracking page are single-page apps: every path loads their index.html.',
    '/app            /app/                   301',
    '/dashboard/*    /dashboard/index.html   200',
    '/t/*            /tracking/index.html    200',
    '',
  ].join('\n'),
);
writeFileSync(
  path.join(site, '_headers'),
  [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '/t/*',
    '  Referrer-Policy: no-referrer',
    '  X-Robots-Tag: noindex, nofollow',
    '  Cache-Control: no-store',
    '/dashboard/*',
    '  X-Robots-Tag: noindex, nofollow',
    '',
  ].join('\n'),
);

console.log(`\nWebsite ready in ${path.relative(root, site)}${path.sep}`);
console.log('Upload that folder to Netlify (drag and drop) or Cloudflare Pages.');
console.log(`Server settings to match: CORS_ORIGINS=<site address>, TRACKING_PAGE_URL=<site address>/t/`);
