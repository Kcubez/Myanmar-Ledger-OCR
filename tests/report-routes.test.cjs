const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-ts.cjs');
const response = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
const { reportRevision } = load('lib/report-revision.ts');

function editFixture({ fail = false, errorCode } = {}) {
  let state = { id:'report',date:new Date('2026-09-21T00:00:00.000Z'),status:'CONFIRMED',revenueLines:[{id:'old',method:'CASH',amount:100n}],expenseLines:[],maintenanceLines:[],fuelEntries:[],brickEntries:[] };
  let writes = 0;
  const prisma = {dailyReport:{findUnique:async()=>state},$transaction:async (run,opts)=>{
    assert.equal(opts.isolationLevel,'Serializable');
    assert.equal(opts.maxWait,5000);
    assert.equal(opts.timeout,30000);
    const draft = {...state,revenueLines:[...state.revenueLines]};
    const updated = await run({
      dailyReport:{findUnique:async()=>draft,update:async({data})=>{if(fail){const error=new Error('commit failed');if(errorCode)error.code=errorCode;throw error;}Object.assign(draft,data);return draft;}},
      revenueLine:{deleteMany:async()=>{writes++;draft.revenueLines=[];},createMany:async({data})=>{draft.revenueLines=data;},aggregate:async()=>({_sum:{amount:draft.revenueLines.reduce((sum,r)=>sum+r.amount,0n)}})},
      expenseLine:{aggregate:async()=>({_sum:{amount:0n}})},fuelEntry:{aggregate:async()=>({_sum:{inGal:0,outGal:0}})},
    });
    state=draft;return updated;
  }};
  const route=load('app/api/reports/[date]/route.ts',{'next/server':response,'../../../../lib/prisma':{prisma},'../../../../lib/require-owner':{requireOwner:async()=>({})},'../../../../lib/reports':{parseDateParam:value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(`${value}T00:00:00.000Z`):null}});
  return { act:body=>route.PATCH({json:async()=>body},{params:Promise.resolve({date:'2026-09-21'})}), state:()=>state,writes:()=>writes };
}
test('stale editor cannot overwrite a sibling update',async()=>{
  const f=editFixture();const revision=reportRevision(f.state());f.state().revenueLines[0].amount=150n;
  const result=await f.act({expectedRevision:revision,revenue:[{method:'CASH',amount:200}]});
  assert.equal(result.status,409);assert.equal(f.writes(),0);assert.equal(f.state().revenueLines[0].amount,150n);
});
test('invalid replacement cannot delete any existing row',async()=>{
  const f=editFixture();const result=await f.act({expectedRevision:reportRevision(f.state()),revenue:[{method:'CASH',amount:'not money'}]});
  assert.equal(result.status,400);assert.equal(f.writes(),0);
});
test('valid edit commits and persistence failures leave original rows intact',async()=>{
  const good=editFixture();assert.equal((await good.act({expectedRevision:reportRevision(good.state()),revenue:[{method:'CASH',amount:200}]})).status,200);
  assert.equal(good.state().revenueLines[0].amount,200n);
  const bad=editFixture({fail:true});await assert.rejects(bad.act({expectedRevision:reportRevision(bad.state()),revenue:[]}),/commit failed/);
  assert.equal(bad.state().revenueLines[0].amount,100n);
});
test('report replacement rejects a report-level date move',async()=>{
  const f=editFixture();
  const result=await f.act({expectedRevision:reportRevision(f.state()),reportDate:'2026-09-22'});
  assert.equal(result.status,400);
  assert.equal(f.state().date.toISOString().slice(0,10),'2026-09-21');
});
test('an expired transaction returns a retryable response without changing rows',async()=>{
  const f=editFixture({fail:true,errorCode:'P2028'});
  const result=await f.act({expectedRevision:reportRevision(f.state()),revenue:[{method:'CASH',amount:200}]});
  assert.equal(result.status,503);
  assert.equal(f.state().revenueLines[0].amount,100n);
});

function approvalFixture(status='CONFIRMED',pending=false,fail=false){
  const events=[];let deleted=false;
  const prisma={$transaction:async(run,opts)=>{
    assert.equal(opts.isolationLevel,'Serializable');
    const value=await run({dailyReport:{findFirst:async({where})=>where.status.in.includes(status)?{id:'r',status}:null,delete:async()=>{if(fail)throw new Error('failed');deleted=true;},update:async()=>{}},pendingUpload:{findMany:async()=>pending?[{id:'u',status:'DRAFT'}]:[]},telegramMessage:{findMany:async()=>[{chatId:'1',botReplyMessageId:9}],updateMany:async()=>{}}});
    events.push('commit');return value;
  }};
  const route=load('app/api/approvals/route.ts',{'next/server':response,'../../../lib/prisma':{prisma},'../../../lib/require-owner':{requireOwner:async()=>({session:{user:{id:'owner'}}})},'../../../lib/pending-uploads':{legacyPendingWhere:{status:{in:['PENDING','NEEDS_REVIEW']}}},'../../../lib/reports':{},'../../../lib/telegram/notify':{finalizeReportMessages:async args=>{assert.equal(args.recipients[0].botReplyMessageId,9);events.push('notify');}}});
  return {act:()=>route.POST({json:async()=>({reportId:'r',action:'reject'})}),events,deleted:()=>deleted};
}
test('legacy rejection never deletes an approved report',async()=>{const f=approvalFixture();assert.equal((await f.act()).status,409);assert.equal(f.deleted(),false);assert.equal(f.events.length,0);});
test('legacy rejection is blocked by an unsubmitted replacement',async()=>{const f=approvalFixture('PENDING',true);assert.equal((await f.act()).status,409);assert.equal(f.deleted(),false);});
test('legacy rejection notifies only after a successful commit',async()=>{
  const f=approvalFixture('PENDING');assert.equal((await f.act()).status,200);assert.deepEqual(f.events,['commit','notify']);
  const bad=approvalFixture('PENDING',false,true);assert.equal((await bad.act()).status,409);assert.equal(bad.events.length,0);
});
