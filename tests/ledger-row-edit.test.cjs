const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-ts.cjs');
const { inventoryPatch, wagePatch, changeInventoryRow, changeWageRow, expectedRowRevision } = load('lib/ledger-row-edit.ts');
const { inventoryRowRevision, wageRowRevision } = load('lib/row-revision.ts');

test('inventory validates precision, rejects omitted quantities, preserves blank and remark', () => {
  const valid = { particular: 'Truck', remark: ' Delivery ', quantityIn: null, quantityOut: 1.234, balance: 0 };
  assert.equal(inventoryPatch(valid).remark, 'Delivery');
  assert.equal(inventoryPatch(valid).quantityIn, null);
  for (const value of [undefined, -1, '2', 1.2345, Infinity, 100_000_000_000]) assert.throws(() => inventoryPatch({ ...valid, balance: value }));
  assert.throws(() => wagePatch({ name: 'Worker', amount: 1.5 }));
  assert.throws(() => expectedRowRevision('outdated'));
});

test('fuel edit checks following rows without changing any recorded balance', async () => {
  const rows = [
    { id:'a', reportId:'r', sheetKind:'fuel', position:0, category:'fuel', particular:'Tank', remark:null, unit:'gal', balance:100, quantityIn:0, quantityOut:0, balanceOk:null },
    { id:'b', reportId:'r', sheetKind:'fuel', position:1, category:'fuel', particular:'Truck', remark:null, unit:'gal', balance:90, quantityIn:0, quantityOut:10, balanceOk:null },
  ];
  const tx = { inventoryEntry: {
    findFirst: async ({ where }) => { assert.equal(where.report.status, 'CONFIRMED'); return rows.find(r => r.id === where.id); },
    update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data),
    findMany: async () => rows,
  } };
  await changeInventoryRow(tx, 'a', inventoryPatch({ particular:'Tank', remark:'Correction', quantityIn:0, quantityOut:0, balance:110 }), inventoryRowRevision(rows[0]));
  assert.equal(rows[1].balance, 90);
  assert.equal(rows[1].balanceOk, false);
  assert.equal(rows[0].balanceOk, null);
});

test('wage changes recalculate total including other expense categories in same transaction', async () => {
  const row = { id:'w', reportId:'r', category:'WAGES', name:'Worker', amount:50n };
  let savedTotal;
  const tx = { expenseLine: {
    findFirst: async ({ where }) => { assert.equal(where.category, 'WAGES'); assert.equal(where.report.status, 'CONFIRMED'); return row; },
    update: async ({ data }) => Object.assign(row, data),
    delete: async () => { row.amount = 0n; },
    aggregate: async () => ({ _sum: { amount: row.amount + 800n } }),
  }, dailyReport: { update: async ({ data }) => { savedTotal = data.totalExpense; } } };
  await changeWageRow(tx, 'w', wagePatch({ name:'Worker', amount:70 }), wageRowRevision(row));
  assert.equal(savedTotal, 870n);
  await changeWageRow(tx, 'w', null, wageRowRevision(row));
  assert.equal(savedTotal, 800n);
});

test('stale inventory and wage editors cannot overwrite a newer row', async () => {
  const inventory = { id:'i', reportId:'r', sheetKind:'materials', position:0, category:'cement', particular:'Alpha', remark:null, unit:'bags', quantityIn:1, quantityOut:0, balance:1, balanceOk:null };
  const inventoryRevision = inventoryRowRevision(inventory);
  inventory.remark = 'Edited in another tab';
  let inventoryUpdates = 0;
  await assert.rejects(changeInventoryRow({ inventoryEntry: {
    findFirst: async () => inventory,
    update: async () => { inventoryUpdates++; },
    delete: async () => { inventoryUpdates++; },
  } }, 'i', inventoryPatch({ particular:'Alpha', remark:'Stale save', quantityIn:1, quantityOut:0, balance:1 }), inventoryRevision), /changed in another tab/);
  assert.equal(inventoryUpdates, 0);

  const wage = { id:'w', reportId:'r', category:'WAGES', name:'Worker', amount:50n };
  const wageRevision = wageRowRevision(wage);
  wage.amount = 60n;
  let wageUpdates = 0;
  await assert.rejects(changeWageRow({ expenseLine: {
    findFirst: async () => wage,
    update: async () => { wageUpdates++; },
    delete: async () => { wageUpdates++; },
  } }, 'w', wagePatch({ name:'Worker', amount:70 }), wageRevision), /changed in another tab/);
  assert.equal(wageUpdates, 0);
});

test('missing or unapproved row cannot be mutated', async () => {
  const revision = 'a'.repeat(64);
  await assert.rejects(changeInventoryRow({ inventoryEntry: { findFirst: async () => null } }, 'missing', null, revision));
  await assert.rejects(changeWageRow({ expenseLine: { findFirst: async () => null } }, 'missing', null, revision));
});
