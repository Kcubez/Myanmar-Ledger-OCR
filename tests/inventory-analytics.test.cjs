const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const box={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/inventory-analytics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
const {stockSeries}=box.exports;
const base={date:'2026-09-01',category:'fuel',unit:'gal',particular:'Truck',position:0,incoming:null,outgoing:3,balance:91};
test('fuel shares tank, sums movements but uses last physical balance per day',()=>{
 const [g]=stockSeries([{...base,position:1,particular:'Supplier',incoming:108,outgoing:null,balance:199},base]);
 assert.equal(g.days[0].balance,199);assert.equal(g.days[0].incoming,108);assert.equal(g.days[0].outgoing,3);
});
test('variants and units stay separate, latest missing balance stays unknown',()=>{
 const groups=stockSeries([{...base,category:'cement',particular:'Alpha',unit:'bags'}, {...base,category:'cement',particular:'DR',unit:'bags'},base,{...base,date:'2026-09-03',balance:null}]);
 assert.equal(groups.length,3);const fuel=groups.find(g=>g.label.startsWith('Fuel'));
 assert.equal(fuel.days.length,2);assert.equal(fuel.days.at(-1).balance,null);
});
