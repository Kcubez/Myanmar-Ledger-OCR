const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const dates = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/date-filter.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, dates);

// Run the actual route with an isolated in-memory database adapter. No real data.
function fixture({ failUpdate = false, unauthorized = false } = {}) {
  let state = { entries: 3, total: 100n };
  let transactions = 0;
  let deletedWhere;
  let reportWhere;
  const prisma = {
    async $transaction(run, options) {
      transactions++;
      assert.equal(options.isolationLevel, 'Serializable');
      const draft = { ...state };
      const ledger = {
        async deleteMany({ where }) { deletedWhere = where; const count = draft.entries; draft.entries = 0; return { count }; },
        async groupBy() { return []; },
      };
      const result = await run({
        dailyReport: {
          async findMany({ where }) { reportWhere = where; return [{ id: 'report-1' }]; },
          async update({ data }) {
            if (failUpdate) throw new Error('Simulated database failure');
            draft.total = data.totalRevenue ?? data.totalExpense ?? data.totalFuelIn;
          },
        },
        revenueLine: ledger, expenseLine: ledger, fuelEntry: ledger, brickEntry: ledger, inventoryEntry: ledger, maintenanceLine: ledger,
      });
      state = draft;
      return result;
    },
  };
  const source = fs.readFileSync('app/api/ledger-entries/route.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
    if (name.endsWith('/date-filter')) return dates.exports;
    if (name.endsWith('/inventory-scope')) return require('./load-ts.cjs')('lib/inventory-scope.ts');
    if (name.endsWith('/prisma')) return { prisma };
    if (name.endsWith('/require-owner')) return { requireOwner: async () => unauthorized ? { error: { status: 401 } } : {} };
    throw new Error(`Unexpected module: ${name}`);
  } };
  vm.runInNewContext(compiled, sandbox);
  return { invoke: body => sandbox.exports.DELETE({ json: async () => body }), state: () => state, transactions: () => transactions, deletedWhere: () => deletedWhere, reportWhere: () => reportWhere };
}
for (const kind of ['revenue', 'expense', 'fuel']) {
  test(`${kind}: deletion and totals commit together`, async () => {
    const f = fixture();
    const result = await f.invoke({ kind });
    assert.equal(result.body.deleted, 3);
    assert.equal(f.state().entries, 0);
    assert.equal(Number(f.state().total), 0);
  });
  test(`${kind}: total failure rolls back entries`, async () => {
    const f = fixture({ failUpdate: true });
    await assert.rejects(f.invoke({ kind }), /Simulated database failure/);
    assert.deepEqual(f.state(), { entries: 3, total: 100n });
  });
}
test('invalid kind and unauthorized requests never open transactions', async () => {
  const invalid = fixture();
  assert.equal((await invalid.invoke({ kind: 'invalid' })).status, 400);
  assert.equal(invalid.transactions(), 0);
  const denied = fixture({ unauthorized: true });
  assert.equal((await denied.invoke({ kind: 'revenue' })).status, 401);
  assert.equal(denied.transactions(), 0);
});

test('row dates override report dates; legacy dates and exclusive boundary work', () => {
  const start = new Date('2026-09-09T00:00:00Z');
  const end = new Date('2026-09-10T00:00:00Z');
  const clause = dates.exports.entryDateWhere({ gte: start, lt: end });
  const matches = (row) => clause.OR.some(branch => {
    const value = branch.report ? row.reportDate : row.date;
    if (branch.report && row.date !== null) return false;
    if (!value) return false;
    const range = branch.report ? branch.report.date : branch.date;
    return (!range.gte || value >= range.gte) && (!range.lt || value < range.lt);
  });
  const reportDate = new Date('2026-09-07T00:00:00Z');
  assert.equal(matches({date:start,reportDate}), true);
  assert.equal(matches({date:reportDate,reportDate:start}), false);
  assert.equal(matches({date:end,reportDate:start}), false);
  assert.equal(matches({date:null,reportDate:start}), true);
  assert.equal(matches({date:null,reportDate}), false);
});

for (const kind of ['inventory', 'maintenance']) {
  test(`${kind}: bulk deletion stays in confirmed reports and retains totals`, async () => {
    const f = fixture();
    const response = await f.invoke({ kind, ...(kind === 'inventory' ? { category: 'fuel' } : {}), gte: '2026-09-01', lte: '2026-10-01' });
    assert.equal(response.body.deleted, 3);
    assert.equal(f.reportWhere().status, 'CONFIRMED');
    assert.equal(f.reportWhere().date.lt.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(f.deletedWhere().reportId.in[0], 'report-1');
    assert.equal(f.deletedWhere().category, kind === 'inventory' ? 'fuel' : undefined);
    assert.equal(f.state().total, 100n);
  });
}
test('invalid category cannot silently expand deletion to every product', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ kind: 'inventory', category: 'unknown' })).status, 400);
  assert.equal(f.transactions(), 0);
});
test('variant deletion uses the same product, particular, and unit scope', async () => {
  const f=fixture();
  assert.equal((await f.invoke({kind:'inventory',category:'cement',variant:JSON.stringify(['cement','Alpha','bags'])})).status,200);
  assert.equal(f.deletedWhere().particular,'Alpha');
  assert.equal(f.deletedWhere().unit,'bags');
  const invalid=fixture();assert.equal((await invalid.invoke({kind:'inventory',variant:'invalid'})).status,400);assert.equal(invalid.transactions(),0);
});
