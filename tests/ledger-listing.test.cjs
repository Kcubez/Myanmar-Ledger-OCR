const { test } = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('@prisma/client/runtime/client');
const load = require('./load-ts.cjs');
const {tableRequest}=load('lib/table-page.ts');
function fixture(total){
  const queries=[];
  const prisma={$queryRaw:async sql=>{queries.push(sql);return queries.length===1?[{total:BigInt(total)}]:[];}};
  const listing=load('lib/ledger-listing.ts',{'../generated/prisma/client':{Prisma:{sql:runtime.sqltag,empty:runtime.empty}},'./prisma':{prisma}});
  return {...listing,queries};
}
test('deleted last pages clamp to the last remaining page and retain search',async()=>{
  const f=fixture(11);const result=await f.entryPage('wage',{gte:null,lte:null},{page:100,query:'Driver'});
  assert.equal(result.page,2);assert.equal(result.total,11);assert.equal(result.query,'Driver');
  assert.match(f.queries[1].text,/LIMIT 10 OFFSET/);assert.equal(f.queries[1].values.at(-1),10);
});
test('empty result still has page one and zero offset',async()=>{
  const f=fixture(0);const result=await f.dailyPage('expense',{gte:null,lte:null},{page:99,query:'missing'});
  assert.equal(result.page,1);assert.equal(result.total,0);assert.equal(f.queries[1].values.at(-1),0);
});
test('search text and variant values are bound parameters, never SQL fragments',async()=>{
  const f=fixture(1);const query="' OR 1=1 --";
  await f.entryPage('inventory',{gte:new Date('2026-09-01'),lte:new Date('2026-10-01')},{page:1,query},'cement',JSON.stringify(['cement','Alpha','bags']));
  assert.equal(f.queries[0].text.includes(query),false);
  assert.ok(f.queries[0].values.includes('%'+query+'%'));assert.ok(f.queries[0].values.includes('Alpha'));
  assert.match(f.queries[0].text,/CONFIRMED/);
});
test('wages and daily expense have independent page and search URL fields',()=>{
  const params={page:'3',query:'2026',wagePage:'2',wageQuery:'Driver'};
  assert.equal(tableRequest(params).page,3);assert.equal(tableRequest(params,'wage').page,2);
  assert.equal(tableRequest(params,'wage').query,'Driver');assert.equal(tableRequest({page:'-1'}).page,1);
});
test('search input state uses the same 100-character bound as server pagination', () => {
  const query = 'x'.repeat(101);
  assert.equal(tableRequest({ query }).query.length, 100);
});
