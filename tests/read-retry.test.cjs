const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = { exports: {}, Error, setTimeout: callback => callback() };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/read-retry.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const { retryRead } = sandbox.exports;
test('connection failures retry once, then return recovered data', async () => {
  let attempts = 0;
  assert.equal(await retryRead(async () => { if (++attempts === 1) throw new Error('timeout exceeded when trying to connect'); return 42; }), 42);
  assert.equal(attempts, 2);
});
test('persistent failure is bounded and other errors are not retried', async () => {
  for (const [message, expected] of [['timeout exceeded when trying to connect', 2], ['Invalid query', 1]]) {
    let attempts = 0;
    await assert.rejects(retryRead(async () => { attempts++; throw new Error(message); }), { message });
    assert.equal(attempts, expected);
  }
});
