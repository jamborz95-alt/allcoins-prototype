import test from 'node:test';
import assert from 'node:assert/strict';

function validCharacterName(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 24 && /^[A-Za-z][A-Za-z0-9_]*$/.test(value.trim());
}
function validAmount(value) {
  return /^[1-9]\d{0,14}$/.test(String(value ?? ''));
}
function validUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

test('accepts roleplay character names and rejects malformed names', () => {
  assert.equal(validCharacterName('Alex_River'), true);
  assert.equal(validCharacterName('ab'), false);
  assert.equal(validCharacterName('1Alex'), false);
  assert.equal(validCharacterName('Alex River'), false);
});
test('AC amounts are positive integer strings only', () => {
  assert.equal(validAmount('100'), true);
  assert.equal(validAmount('1'), true);
  assert.equal(validAmount('0'), false);
  assert.equal(validAmount('-5'), false);
  assert.equal(validAmount('1.5'), false);
});
test('idempotency and account identifiers must be UUIDs', () => {
  assert.equal(validUuid('a5e6eaf0-7b42-4ad5-9b36-cd01a98b7b2d'), true);
  assert.equal(validUuid('not-a-uuid'), false);
});
