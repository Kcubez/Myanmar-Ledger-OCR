const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const box = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/ledger-row-edit.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box);
const { inventoryPatch, wagePatch, changeInventoryRow, changeWageRow } = box.exports;
test('inventory validates precision, rejects omitted quantities, preserves blank and remark', () => {
  const valid = { particular: 'Truck', remark: ' Delivery ', quantityIn: null, quantityOut: 1.234, balance: 0 };
  assert.equal(inventoryPatch(valid).remark, 'Delivery');
  assert.equal(inventoryPatch(valid).quantityIn, null);
  for (const value of [undefined, -1, '2', 1.2345, Infinity, 100_000_000_000]) assert.throws(() => inventoryPatch({ ...valid, balance: value }));
  assert.throws(() => wagePatch({ name: 'Worker', amount: 1.5 }));
});
test('fuel edit checks following rows without changing any recorded balance', async () => {
  const rows = [{ id:'a', reportId:'r', sheetKind:'fuel', balance:100, quantityIn:0, quantityOut:0 }, { id:'b', reportId:'r', sheetKind:'fuel', balance:90, quantityIn:0, quantityOut:10 }];
  const tx = { inventoryEntry: {
    findFirst: async ({ where }) => { assert.equal(where.report.status, 'CONFIRMED'); return rows.find(r => r.id === where.id); },
    update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data),
    findMany: async () => rows,
  } };
  await changeInventoryRow(tx, 'a', inventoryPatch({ particular:'Tank', remark:'Correction', quantityIn:0, quantityOut:0, balance:110 }));
  assert.equal(rows[1].balance, 90);
  assert.equal(rows[1].balanceOk, false);
  assert.equal(rows[0].balanceOk, null);
});
test('wage changes recalculate total including other expense categories in same transaction', async () => {
  let amount = 50n, savedTotal;
  const tx = { expenseLine: {
    findFirst: async ({ where }) => { assert.equal(where.category, 'WAGES'); assert.equal(where.report.status, 'CONFIRMED'); return { id:'w', reportId:'r' }; },
    update: async ({ data }) => { amount = data.amount; },
    delete: async () => { amount = 0n; },
    aggregate: async () => ({ _sum: { amount: amount + 800n } }),
  }, dailyReport: { update: async ({ data }) => { savedTotal = data.totalExpense; } } };
  await changeWageRow(tx, 'w', wagePatch({ name:'Worker', amount:70 }));
  assert.equal(savedTotal, 870n);
  await changeWageRow(tx, 'w', null);
  assert.equal(savedTotal, 800n);
});
test('missing or unapproved row cannot be mutated', async () => {
  await assert.rejects(changeInventoryRow({ inventoryEntry: { findFirst: async () => null } }, 'missing', null));
  await assert.rejects(changeWageRow({ expenseLine: { findFirst: async () => null } }, 'missing', null));
});
