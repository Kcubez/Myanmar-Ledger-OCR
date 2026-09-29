const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const filename = path.resolve(file);
  const sandbox = { exports: {}, require(name) {
    if (name === '@google/genai') return {};
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name + '.ts'));
    return require(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return sandbox.exports;
}
const { parseExpenseResponse, operationIsWageSubtotal } = load('lib/extract/expense.ts');
// Manually transcribed amounts from expense_21sep2026.jpg, not an OCR accuracy test.
const source = { date: '21/9/2026', total: '1,500,000', business_drawing: '800,000', personal_drawing: '200,000', operation: '500,000', wages: Array.from({length:8}, (_,i) => ({name:`Labour ${i+1}`,amount:i===6?'150,000':'50,000'})) };
test('source expense: labour subtotal is counted once, source preserved', () => {
  const r = parseExpenseResponse(JSON.stringify(source));
  assert.equal(operationIsWageSubtotal(r.data), true);
  assert.equal(r.data.operation, '500,000');
  assert.equal(r.data.wages.length, 8);
  assert.equal(r.unreadable_fields.includes('sum_mismatch'), false);
});
test('separate operating expense remains additive', () => {
  const r = parseExpenseResponse(JSON.stringify({...source,total:'2,000,000'}));
  assert.equal(operationIsWageSubtotal(r.data), false);
  assert.equal(r.unreadable_fields.includes('sum_mismatch'), false);
});
test('mismatched labour subtotal requires review', () => {
  const r = parseExpenseResponse(JSON.stringify({...source,wages:source.wages.slice(1)}));
  assert.equal(r.unreadable_fields.includes('sum_mismatch'), true);
  assert.ok(r.confidence <= .55);
});
test('missing wage amount is flagged', () => {
  const r = parseExpenseResponse(JSON.stringify({...source,wages:[{name:'Driver',amount:''}]}));
  assert.equal(r.unreadable_fields.includes('wages[0].amount'), true);
});
test('fuel continuation arithmetic: 321 - 5 = 316; mismatch stays unchanged', () => {
  const { parseFuelResponse } = load('lib/extract/fuel.ts');
  const r = parseFuelResponse(JSON.stringify({rows:[{balance_gal:'321 gal'},{out_gal:'5 gal',balance_gal:'316 gal'},{out_gal:'3 gal',balance_gal:'310 gal'}]}));
  assert.equal(r.data.rows[1].balance_ok, true);
  assert.equal(r.data.rows[2].balance_ok, false);
  assert.equal(r.data.rows[2].balance_gal, '310 gal');
});
