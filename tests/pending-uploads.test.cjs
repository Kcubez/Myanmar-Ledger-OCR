const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture({ fail = false, legacy = 0, newer = 0, mode = "expense", sheetKind = "fuel", submitted = true } = {}) {
  let state = { total: 100, status: 'CONFIRMED', upload: 'PENDING', writes: 0 };
  const prisma = { async $transaction(run) {
    const draft = { ...state };
    const result = await run({
      pendingUpload: {
        async findUnique() { return { id:'u', reportId:'r', status:draft.upload, mode, createdAt:new Date(), payload:{sheetKind}, report:{date:new Date()} }; },
        async count({where}) { if(mode === "inventory") assert.equal(where.payload.equals, sheetKind); return newer; },
        async update({data}) { draft.upload = data.status; },
      },
      dailyReport: { async count() { return legacy; }, async update({data}) { draft.status = data.status; } },
      telegramMessage: { async findUnique() { return { status: submitted ? 'approval_requested' : 'extracted' }; }, async update() { if (fail) throw new Error('write failed'); } },
      draft,
    });
    state = draft;
    return result;
  }};
  const sandbox = {exports:{}, require(name) {
    if(name==='./prisma') return {prisma};
    if(name==='./extract') return {isLedgerType: () => true};
    if(name==='./persist-ledger') return {persistLines: async tx => {tx.draft.total=200;tx.draft.writes++;}};
    throw new Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pending-uploads.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
  return { act: approved => sandbox.exports.resolveUpload('u',approved), state:()=>state };
}
test('approved values stay live until explicit upload approval',async()=>{const f=fixture();assert.equal(f.state().total,100);await f.act(true);assert.equal(f.state().total,200);assert.equal(f.state().status,'CONFIRMED');});
test('rejecting new upload preserves approved data',async()=>{const f=fixture();await f.act(false);assert.equal(f.state().total,100);assert.equal(f.state().writes,0);assert.equal(f.state().upload,'REJECTED');});
test('approval rollback preserves old totals',async()=>{const f=fixture({fail:true});await assert.rejects(f.act(true),/write failed/);assert.equal(f.state().total,100);assert.equal(f.state().upload,'PENDING');});
test('repeat approval cannot apply twice',async()=>{const f=fixture();await f.act(true);await assert.rejects(f.act(true),/already reviewed/);assert.equal(f.state().writes,1);});
test('an old PENDING upload cannot bypass the submitter confirmation',async()=>{const f=fixture({submitted:false});await assert.rejects(f.act(true),/not submitted/);assert.equal(f.state().writes,0);});
test('older replacement cannot overwrite a newer approved version',async()=>{const f=fixture({newer:1});await assert.rejects(f.act(true),/newer upload/);assert.equal(f.state().total,100);});
test('legacy pending data must be reviewed explicitly first',async()=>{const f=fixture({legacy:1});await assert.rejects(f.act(true),/existing pending report/);assert.equal(f.state().total,100);});

test('inventory approval checks newer sheets of the same kind and preserves rejection state',async()=>{
 const old=fixture({mode:'inventory',newer:1});await assert.rejects(old.act(true),/newer inventory/);assert.equal(old.state().total,100);
 const pending=fixture({mode:'inventory'});await pending.act(false);assert.equal(pending.state().writes,0);
 const accepted=fixture({mode:'inventory'});await accepted.act(true);assert.equal(accepted.state().writes,1);
});
