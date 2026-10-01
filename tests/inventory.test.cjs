const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const cache=new Map();
function load(file){
 const filename=path.resolve(file);
 if(cache.has(filename))return cache.get(filename);
 const sandbox={exports:{},require(name){
  if(name==='@google/genai')return {};
  if(name.startsWith('.')){let target=path.resolve(path.dirname(filename),name);return load(fs.existsSync(target+'.ts')?target+'.ts':path.join(target,'index.ts'));}
  return require(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 cache.set(filename,sandbox.exports);return sandbox.exports;
}
const {parseInventoryResponse,inventoryQuantity}=load('lib/extract/inventory.ts');
const {persistLines}=load('lib/persist-ledger.ts');
// Source quantities transcribed from inventory_fuel.jpg, not a live OCR test.
const fuel={date:'29.9.2026',sheetKind:'fuel',rows:[
 ['6E-4110','','3 gal','91 gal'],['5K-3171','','2 gal','89 gal'],['6B-8396','','3 gal','86 gal'],['2A-3899','','3 gal','83 gal'],['5A-8795','','2 gal','81 gal'],['Phone Htet Thar','','20 gal','61 gal'],['Anawarmin','','15 gal','46 gal'],['Loader','','5 gal','41 gal'],['TK Family','108 gal','','149 gal']
].map(([particular,incoming,out,balance])=>({category:'fuel',particular,in:incoming,out,balance}))};
test('fuel daily source: 108 in, 53 out, 149 closing; preserve all nine movements',()=>{
 const r=parseInventoryResponse(JSON.stringify(fuel));
 assert.equal(r.data.rows.length,9);assert.equal(r.data.rows[8].particular,'TK Family');
 assert.equal(r.data.rows.reduce((s,r)=>s+(inventoryQuantity(r.in)??0),0),108);
 assert.equal(r.data.rows.reduce((s,r)=>s+(inventoryQuantity(r.out)??0),0),53);
 assert.equal(inventoryQuantity(r.data.rows.at(-1).balance),149);
 assert.equal(r.data.rows[0].balance_ok,null);assert.ok(r.data.rows.slice(1).every(r=>r.balance_ok));
});
test('materials preserve variants and normalize units without inventing faded cells',()=>{
 const r=parseInventoryResponse(JSON.stringify({date:'30/9/2026',sheetKind:'materials',rows:[
 {category:'sand',particular:'Sand',in:'44 sub',out:'16.2 sub',balance:'260.8 sub'},
 {category:'gravel',particular:'Gravel',in:'12.6 sub',out:'4.4 sub',balance:'18.2 sub'},
 {category:'cement',particular:'Cement D.R',in:'',out:'2 bags',balance:'1075 bags'},
 {category:'cement',particular:'Cement Alpha',in:'',out:'48 bags',balance:'843 bags'},
 {category:'brick',particular:'Brick T.W',in:'',out:'3000',balance:'7800'},
 {category:'brick',particular:'Brick one star',in:'5000',out:'-',balance:'5000'}]}));
 assert.equal(r.data.rows.length,6);assert.deepEqual(Array.from(r.data.rows,r=>r.unit),['sud','sud','bags','bags','Nos','Nos']);
 assert.equal(inventoryQuantity(r.data.rows[0].in),44);assert.equal(inventoryQuantity(r.data.rows[2].in),null);assert.equal(inventoryQuantity(r.data.rows[5].out),0);
});
test('balance mismatch is flagged and never repaired',()=>{const f=structuredClone(fuel);f.rows[8].balance='150 gal';const r=parseInventoryResponse(JSON.stringify(f));assert.ok(r.unreadable_fields.includes('balance_mismatch'));assert.equal(r.data.rows[8].balance,'150 gal');});
test('unknown product or malformed response cannot silently replace a daily sheet',()=>{
 for(const value of ['no json',JSON.stringify({sheetKind:'materials',rows:[{category:'steel'}]}),JSON.stringify({sheetKind:'unknown',rows:[]})])assert.equal(parseInventoryResponse(value).data.rows.length,0);
 assert.equal(inventoryQuantity('မသေချာ'),null);assert.equal(inventoryQuantity('၁၀၈ gal'),108);
});
test('approval replaces only matching daily sheet; repeated retake never appends',async()=>{
 let rows=[{reportId:'today',sheetKind:'materials',particular:'Sand'},{reportId:'yesterday',sheetKind:'fuel',particular:'Old'}];
 const tx={inventoryEntry:{deleteMany:async({where})=>{rows=rows.filter(r=>r.reportId!==where.reportId||r.sheetKind!==where.sheetKind);},createMany:async({data})=>{rows.push(...data);}}};
 const result=parseInventoryResponse(JSON.stringify(fuel));const payload={sheetKind:'fuel',contentDateText:fuel.date,lines:result.data.rows};
 await persistLines(tx,'today','inventory',payload,new Date());await persistLines(tx,'today','inventory',payload,new Date());
 assert.equal(rows.length,11);assert.equal(rows.filter(r=>r.sheetKind==='materials').length,1);assert.equal(rows.at(-1).balance,149);assert.equal(rows.at(-1).position,8);
});
test('Telegram menu offers four active ledgers and hides retired upload modes',()=>{
 const {buildLedgerMenuButtons}=load('lib/telegram/templates.ts');
 const menu=buildLedgerMenuButtons(['inventory','revenue','expense','maintenance','fuel','brick']);
 const callbacks=Array.from(menu.inline_keyboard,row=>row[0].callback_data);
 assert.deepEqual(callbacks,['mode:inventory','mode:revenue','mode:expense','mode:maintenance','action:menu']);
});
