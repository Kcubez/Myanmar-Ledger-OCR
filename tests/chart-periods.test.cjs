const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const box={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chart-periods.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
test('calendar weeks sum movement, preserve final unknown balance, and do not add missing weeks',()=>{
 const rows=[{date:'2026-08-04',incoming:2,outgoing:1,balance:null},{date:'2026-08-03',incoming:5,outgoing:2,balance:10},{date:'2026-08-24',incoming:1,outgoing:0,balance:11}];
 const result=box.exports.weeklyStock(rows);
 assert.equal(result.length,2);assert.equal(result[0].incoming,7);assert.equal(result[0].outgoing,3);assert.equal(result[0].balance,null);assert.equal(result[1].date,'2026-08-24');assert.equal(rows[0].date,'2026-08-04');
});
