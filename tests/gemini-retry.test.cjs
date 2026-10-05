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
     this.models = { generateContent: async ({config}) => {
       keys.push(apiKey);
       const item = sequence.shift();
       if (item === 'stall') return new Promise((resolve, reject) => config.abortSignal.addEventListener('abort', () => { keys.push('aborted'); reject(new Error('aborted')); }));
       if (item instanceof Error) throw item;
       return {text:'{}'};
     }};
   }
 }
 const sandbox = {
   exports: {}, console: {error(){}}, Error, clearTimeout, AbortController,
   setTimeout,
   require() { return {GoogleGenAI:FakeAI}; },
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/extract/shared.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 return {keys,run:(options={})=>sandbox.exports.extractWithKeyRotation({keys:['project-a','project-b'],model:'test',parts:[],parse:JSON.parse,...options})};
}
test('503 retries the same key once with backoff before succeeding',async()=>{const f=fixture([new Error('503 overloaded'),{}]);const retries=[];await f.run({retryDelayMs:()=>0,onRetry:(info)=>retries.push(info)});assert.deepEqual(f.keys,['project-a','project-a']);assert.deepEqual(retries.map(({slot,retry})=>({slot,retry})),[{slot:1,retry:1}]);});
test('503 tries every configured key after one same-key retry',async()=>{const f=fixture(Array.from({length:10},()=>new Error('503 overloaded')));await assert.rejects(f.run({keys:['project-a','project-b','project-c','project-d','project-e'],retryDelayMs:()=>0}));assert.deepEqual(f.keys,['project-a','project-a','project-b','project-b','project-c','project-c','project-d','project-d','project-e','project-e']);});
test('overall deadline aborts a stalled request without trying more keys',async()=>{const f=fixture(['stall']);await assert.rejects(f.run({totalTimeoutMs:20}));assert.deepEqual(f.keys,['project-a','aborted']);});
test('quota rotates without overload retry',async()=>{const f=fixture([new Error('429 quota'),{}]);await f.run();assert.deepEqual(f.keys,['project-a','project-b']);});
test('terminal errors do not burn remaining keys',async()=>{const f=fixture([new Error('unsupported image')]);await assert.rejects(f.run());assert.deepEqual(f.keys,['project-a']);});
