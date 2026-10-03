const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const box={exports:{},setTimeout:fn=>fn()};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/session-retry.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
const {retrySessionLookup}=box.exports;
const failure={statusCode:500,body:{code:'FAILED_TO_GET_SESSION'}};
test('wrapped session failure retries once and recovers',async()=>{let n=0;const session={user:{id:'a'}};assert.equal(await retrySessionLookup(async()=>{if(++n===1)throw failure;return session;}),session);assert.equal(n,2);});
test('persistent failure fails closed after two attempts',async()=>{let n=0;await assert.rejects(retrySessionLookup(async()=>{n++;throw failure;}));assert.equal(n,2);});
test('missing session stays missing and unauthorized errors are not retried',async()=>{let n=0;assert.equal(await retrySessionLookup(async()=>{n++;return null;}),null);assert.equal(n,1);n=0;await assert.rejects(retrySessionLookup(async()=>{n++;throw {statusCode:401};}));assert.equal(n,1);});
