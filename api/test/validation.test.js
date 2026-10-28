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

function validJobCode(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(value);
}
function validInventoryItem(itemCode, quantity, metadata) {
  return typeof itemCode === 'string' &&
    /^[a-z][a-z0-9_]{1,47}$/.test(itemCode) &&
    Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000 &&
    metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata);
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

test('job codes must be safe lowercase identifiers', () => {
  assert.equal(validJobCode('mechanic'), true);
  assert.equal(validJobCode('taxi_driver'), true);
  assert.equal(validJobCode('Mechanic'), false);
  assert.equal(validJobCode('two words'), false);
  assert.equal(validJobCode(''), false);
});

test('inventory input accepts bounded item quantities and object metadata', () => {
  assert.equal(validInventoryItem('water_bottle', 3, {}), true);
  assert.equal(validInventoryItem('water_bottle', 0, {}), false);
  assert.equal(validInventoryItem('water_bottle', 1001, {}), false);
  assert.equal(validInventoryItem('Water', 1, {}), false);
  assert.equal(validInventoryItem('water_bottle', 1, []), false);
});
