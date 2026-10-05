const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('app/api/telegram/webhook/route.ts','utf8');
function load(start,end,globals){
 const code=source.slice(source.indexOf(start),end ? source.indexOf(end,source.indexOf(start)) : undefined);
 const sandbox={...globals,exports:{},console:{error(){}}};
 vm.runInNewContext(ts.transpileModule(code+'\nexports.run='+start.match(/function (\w+)/)[1]+';',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 return sandbox.exports.run;
}
test('submit keeps a persistent waiting message with no submit button',async()=>{
 const edits=[];
 const run=load('async function handleSubmitterConfirm(',null,{
 prisma:{dailyReport:{findUnique:async()=>({status:'CONFIRMED',telegramMessages:[{id:'upload',chatId:'7',botReplyMessageId:12}]})},pendingUpload:{findUnique:async()=>({id:'upload',status:'PENDING'})},telegramMessage:{update:async()=>{}}, $transaction:async run=>run({pendingUpload:{findUnique:async()=>({id:'upload',status:'DRAFT'}),update:async()=>{}},telegramMessage:{findUnique:async()=>({status:'extracted'}),update:async()=>{}}})},
 waitingForApprovalMessage:'Waiting for dashboard approval',
 editTelegramMessage:async args=>{edits.push(args);return true;},answerCallbackQuery:async()=>{},
 });
 await run('token',7,12,'query','report');
 assert.equal(edits.length,1);assert.equal(edits[0].messageId,12);assert.equal(edits[0].text,'Waiting for dashboard approval');assert.equal(edits[0].replyMarkup.inline_keyboard.length,0);
});
test('download failure replaces processing even when database failure logging fails',async()=>{
 const updates=[];
 const run=load('async function processPhoto(','async function extractByType(',{
 prisma:{telegramMessage:{updateMany:async()=>{throw new Error('database offline');}}},downloadTelegramFile:async()=>null,
 });
 await run('token',['key'],'model','7',1,'photo','expense',async text=>updates.push(text));
 assert.equal(updates.length,1);assert.match(updates[0],/download/);
});
test('submitter rejection changes only the staged upload and removes preview actions',async()=>{
 const edits=[];
 const run=load('async function handleSubmitterReject(',null,{
  prisma:{dailyReport:{findUnique:async()=>({telegramMessages:[{id:'upload',chatId:'7',botReplyMessageId:12}]})},$transaction:async fn=>fn({pendingUpload:{findUnique:async()=>({id:'upload',status:'DRAFT'}),update:async args=>assert.equal(args.data.status,'REJECTED')},telegramMessage:{findUnique:async()=>({status:'extracted'}),update:async args=>assert.equal(args.data.status,'rejected')}})},
  answerCallbackQuery:async()=>{},editTelegramMessage:async args=>{edits.push(args);return true;},editMessageButtons:async()=>{},submitterRejectedMessage:'Rejected',
 });
 await run('token',7,12,'query','report');
 assert.equal(edits.length,1);assert.equal(edits[0].text,'Rejected');assert.equal(edits[0].replyMarkup.inline_keyboard.length,0);
});
