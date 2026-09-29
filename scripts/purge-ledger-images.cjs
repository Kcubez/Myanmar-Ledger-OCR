// Explicitly scoped cleanup. Default is read-only; --delete removes ledger images.
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
const bucket = 'ledger-images';
const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Storage configuration missing');
async function api(path, method, body) {
  const res = await fetch(`${base}/storage/v1/${path}`, { method, headers: {
    apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
  }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Storage ${method} failed: ${res.status}`);
  return res.json();
}
async function list(prefix) {
  const files = [];
  for (let offset = 0;; offset += 100) {
    const rows = await api(`object/list/${bucket}`, 'POST', { prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    for (const row of rows) {
      const path = `${prefix}/${row.name}`;
      if (!row.id) files.push(...await list(path));
      else if (/\.(jpg|jpeg|png|webp)$/i.test(path)) files.push(path);
    }
    if (rows.length < 100) break;
  }
  return files;
}
(async () => {
  const files = await list('reports');
  console.log(JSON.stringify({ bucket, prefix: 'reports/', imageCount: files.length, mode: process.argv.includes('--delete') ? 'delete' : 'dry-run' }));
  if (!process.argv.includes('--delete')) return;
  for (let i = 0; i < files.length; i += 100) await api(`object/${bucket}`, 'DELETE', { prefixes: files.slice(i, i + 100) });
  const remaining = await list('reports');
  if (remaining.length) throw new Error(`Cleanup incomplete: ${remaining.length} images remain`);
  const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await client.connect();
  try {
    const cleared = await client.query('UPDATE source_image SET storage_path = NULL, thumbnail_path = NULL WHERE storage_path LIKE $1 OR thumbnail_path LIKE $1', [`${bucket}/reports/%`]);
    console.log(JSON.stringify({ deleted: files.length, remaining: 0, metadataPathsCleared: cleared.rowCount }));
  } finally { await client.end(); }
})().catch(() => { console.error('Cleanup failed. Check connectivity/configuration; no credentials printed. Safe to rerun.'); process.exitCode = 1; });
