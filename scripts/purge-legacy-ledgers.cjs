// Explicitly retired Fuel/Brick only. Inventory (including fuel/brick categories) stays intact.
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT (SELECT count(*) FROM inventory_entry)::int AS inventory, (SELECT count(*) FROM revenue_line)::int AS revenue, (SELECT count(*) FROM expense_line)::int AS expense, (SELECT count(*) FROM maintenance_line)::int AS maintenance');
    const counts = {};
    for (const table of ['fuel_entry', 'brick_entry']) counts[table] = (await client.query(`DELETE FROM ${table}`)).rowCount;
    counts.pending_upload = (await client.query("DELETE FROM pending_upload WHERE mode IN ('fuel','brick')")).rowCount;
    counts.source_image = (await client.query("DELETE FROM source_image WHERE ledger_type IN ('FUEL','BRICK')")).rowCount;
    await client.query("UPDATE telegram_message SET status='retired' WHERE ledger_type IN ('FUEL','BRICK')");
    await client.query('UPDATE daily_report SET total_fuel_in=0, total_fuel_out=0 WHERE total_fuel_in IS DISTINCT FROM 0 OR total_fuel_out IS DISTINCT FROM 0');
    const after = await client.query('SELECT (SELECT count(*) FROM inventory_entry)::int AS inventory, (SELECT count(*) FROM revenue_line)::int AS revenue, (SELECT count(*) FROM expense_line)::int AS expense, (SELECT count(*) FROM maintenance_line)::int AS maintenance');
    if (JSON.stringify(before.rows) !== JSON.stringify(after.rows)) throw new Error('Active ledger counts changed');
    await client.query(process.argv.includes('--apply') ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ applied: process.argv.includes('--apply'), removed: counts, preserved: after.rows[0] }));
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
