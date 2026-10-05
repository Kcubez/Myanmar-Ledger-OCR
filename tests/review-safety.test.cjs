const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-ts.cjs');
const { validateReportPatch } = load('lib/report-patch-validation.ts');
const { reportRevision } = load('lib/report-revision.ts');
const { hasLedgerContent } = load('lib/extraction-content.ts');
const { inventoryScope } = load('lib/inventory-scope.ts');
const revision = 'a'.repeat(64);

test('money edits reject the entire payload on invalid money or enum', () => {
  for (const amount of [-1, 1.5, null, '', 'bad', '1foo', true, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateReportPatch({ expectedRevision: revision, revenue: [{ method: 'CASH', amount }] }));
  }
  assert.throws(() => validateReportPatch({ expectedRevision: revision, revenue: [{ method:'CASH',amount:20 }, { method:'UNKNOWN',amount:10 }] }));
  assert.throws(() => validateReportPatch({ expectedRevision: revision, expense:[{category:'BAD',amount:0}] }));
  assert.throws(() => validateReportPatch({ expectedRevision: revision, status:'CONFIRMED' }));
  assert.doesNotThrow(() => validateReportPatch({ expectedRevision: revision, expense:[{category:'WAGES',amount:0,name:'Driver'}] }));
  assert.throws(() => validateReportPatch({ expectedRevision: revision, fuel:[{date:'2026-02-30'}] }));
  assert.throws(() => validateReportPatch({ expectedRevision: revision, brick:[{qty:'0.001'}] }));
});
test('revision is order independent and detects sibling edits and deletions', () => {
  const report = { status:'CONFIRMED', revenueLines:[], expenseLines:[{id:'b',amount:10n},{id:'a',amount:20n}], maintenanceLines:[],fuelEntries:[],brickEntries:[] };
  const before = reportRevision(report);
  assert.equal(before, reportRevision({...report,expenseLines:[...report.expenseLines].reverse()}));
  assert.notEqual(before, reportRevision({...report,expenseLines:[{id:'b',amount:11n},{id:'a',amount:20n}]}));
  assert.notEqual(before, reportRevision({...report,expenseLines:[]}));
});
test('empty expense cannot replace live values; explicit zero remains valid', () => {
  assert.equal(hasLedgerContent('expense',{header:{total:'300'},wages:[]}),false);
  assert.equal(hasLedgerContent('expense',{header:{},wages:[{name:'Driver',amount:''}]}),false);
  assert.equal(hasLedgerContent('expense',{header:{operation:'0'},wages:[]}),true);
  assert.equal(hasLedgerContent('expense',{header:{},wages:[{name:'Driver',amount:'၅၀၀'}]}),true);
  assert.equal(hasLedgerContent('maintenance',[{vehicle:'Truck',amount:'250000',part:'Engine'}]),true);
  assert.equal(hasLedgerContent('maintenance',[{vehicle:'Truck',amount:'',part:'Engine'}]),false);
});
test('approval persistence rejects empty expense before deleting live rows',async()=>{
  const {persistLines}=load('lib/persist-ledger.ts',{'./extract':{amountFrom:value=>Number(String(value).replaceAll(',',''))}});
  let deleted=false;
  await assert.rejects(persistLines({expenseLine:{deleteMany:async()=>{deleted=true;}}},'r','expense',{lines:{header:{},wages:[]}},new Date()),/No readable ledger rows/);
  assert.equal(deleted,false);
});
test('wages-only subtotal persists once, and unreadable maintenance cannot delete live rows', async () => {
  const { persistLines } = load('lib/persist-ledger.ts', {
    './extract': { amountFrom: value => Number(String(value).replaceAll(',', '')) },
  });
  let expenseRows = [];
  let maintenanceDeleted = false;
  const tx = {
    expenseLine: {
      deleteMany: async () => {},
      createMany: async ({ data }) => { expenseRows = data; },
    },
    maintenanceLine: { deleteMany: async () => { maintenanceDeleted = true; } },
    dailyReport: { update: async () => {} },
  };
  await persistLines(tx, 'report', 'expense', {
    lines: { header: { total: '500,000', business_drawing: '', personal_drawing: '', operation: '500,000' }, wages: [{ name: 'Workers', amount: '500,000' }] },
  }, new Date());
  assert.equal(expenseRows.length, 1);
  assert.equal(expenseRows[0].category, 'WAGES');
  assert.equal(Number(expenseRows[0].amount), 500000);
  await assert.rejects(
    persistLines(tx, 'report', 'maintenance', { lines: [{ vehicle: 'Truck', amount: '', part: 'Engine' }] }, new Date()),
    /No readable ledger rows/,
  );
  assert.equal(maintenanceDeleted, false);
});
test('inventory scopes isolate variants and do not narrow shared fuel by vehicle', () => {
  assert.equal(inventoryScope('cement',JSON.stringify(['cement','Alpha','bags'])).particular,'Alpha');
  assert.equal(inventoryScope('fuel',JSON.stringify(['fuel','','gal'])).particular,undefined);
  assert.throws(() => inventoryScope('cement',JSON.stringify(['brick','One star','Nos'])));
  assert.throws(() => inventoryScope(undefined,'invalid'));
});
test('setup is retired and account creation still accepts authenticated admins', async () => {
  let options;
  load('lib/auth.ts', {'better-auth': { betterAuth: config => { options=config; return {}; } },'better-auth/adapters/prisma':{prismaAdapter:()=>({})},'better-auth/plugins':{admin:()=>({})},'./prisma':{prisma:{}} });
  assert.equal(options.emailAndPassword.disableSignUp,true);
  const create = options.databaseHooks.user.create.before;
  assert.equal(await create({},null),false);
  assert.equal(await create({},{path:'/sign-up/email',context:{session:{user:{role:'user'}}}}),false);
  assert.equal(await create({},{path:'/admin/create-user',context:{session:{user:{role:'admin'}}}}),undefined);
});
