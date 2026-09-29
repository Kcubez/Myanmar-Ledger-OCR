const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function fixture(sequence){
 const keys=[];
 class FakeAI {
   constructor({apiKey, httpOptions}) {
     assert.equal(httpOptions.retryOptions.attempts, 1);
     this.models = { generateContent: async () => {
       keys.push(apiKey);
       const item = sequence.shift();
       if (item instanceof Error) throw item;
       return {text:'{}'};
     }};
   }
 }
 const sandbox = {
   exports: {}, console: {error(){}}, Error, clearTimeout,
   setTimeout: (fn,ms) => setTimeout(fn,ms < 4000 ? 0 : ms),
   require() { return {GoogleGenAI:FakeAI}; },
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/extract/shared.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 return {keys,run:()=>sandbox.exports.extractWithKeyRotation({keys:['project-a','project-b'],model:'test',parts:[],parse:JSON.parse})};
}
test('503 retries same project once before rotating',async()=>{const f=fixture([new Error('503 overloaded'),new Error('503 overloaded'),{}]);await f.run();assert.deepEqual(f.keys,['project-a','project-a','project-b']);});
test('quota rotates without overload retry',async()=>{const f=fixture([new Error('429 quota'),{}]);await f.run();assert.deepEqual(f.keys,['project-a','project-b']);});
test('terminal errors do not burn remaining keys',async()=>{const f=fixture([new Error('unsupported image')]);await assert.rejects(f.run());assert.deepEqual(f.keys,['project-a']);});
