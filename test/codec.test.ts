import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode, hashBytes, hashOf } from '../src/sim/codec.ts';

/** Equal to the bit: -0 stays -0, NaN stays NaN. */
function sameBits(a: unknown, b: unknown, path = ''): void {
  if (typeof a === 'number') {
    assert.equal(typeof b, 'number', path);
    assert.ok(Object.is(a, b), `${path}: ${a} came back as ${String(b)}`);
    return;
  }
  if (a && typeof a === 'object') {
    assert.equal(Array.isArray(a), Array.isArray(b), path);
    const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined).sort();
    assert.deepEqual(Object.keys(b as object).sort(), ka, path);
    for (const k of ka) sameBits((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  assert.equal(b, a, path);
}

test('every kind of plain value comes back bit for bit', () => {
  const value = {
    whole: [0, 1, -1, 63, -64, 64, 300, 0x7fffffff, -0x80000000, 0x80000000, -0x80000001, Number.MAX_SAFE_INTEGER],
    odd: [-0, 0.1, -2.5e-300, 1e300, Number.MIN_VALUE, NaN, Infinity, -Infinity, Math.PI],
    text: ['', 'brig', 'Kapitän, à toi: ⚓'],
    flags: [true, false, null],
    nested: { b: { c: [[1, 2], { d: 'e' }] }, a: [] },
    gone: undefined,
  };
  sameBits(value, decode(encode(value)));
});

test('a number of whole thousandths travels short and comes back the very same bits; one that is not stays a double', () => {
  const places = [8.74, -3.558, 0.001, -0.5, 14.4478, 123456.789, 0.1, 0.7, 1 / 3, 14.44780641152, 2 ** 31 / 1000, 1e-9];
  for (const x of places) assert.ok(Object.is(decode(encode(x)), x), String(x));
  assert.ok(encode(8.74).length < encode(14.44780641152).length, 'thousandths are short');
  assert.ok(Object.is(decode(encode(-0)), -0));
});

test('the bytes do not depend on the order fields were made in, so neither does the hash', () => {
  const a = { x: 1.5, y: [1, { p: 2, q: 3 }], z: 'z' };
  const b = { z: 'z', y: [1, { q: 3, p: 2 }], x: 1.5 };
  assert.deepEqual(encode(a), encode(b));
  assert.equal(hashOf(a), hashOf(b));
  // A field left undefined is the same as a field left out.
  assert.equal(hashOf({ ...a, w: undefined }), hashOf(a));
});

test('a change anywhere changes the hash: one bit of one number, a key, an item', () => {
  const base = { ships: [{ pose: { roll: 0.1, pitch: 0.2 } }, { pose: { roll: 0.3, pitch: 0.4 } }] };
  const h = hashOf(base);
  const nudged = { ships: [base.ships[0], { pose: { roll: 0.3, pitch: 0.4 + Number.EPSILON / 4 } }] };
  assert.notEqual(0.4 + Number.EPSILON / 4, 0.4);
  assert.notEqual(hashOf(nudged), h);
  assert.notEqual(hashOf({ ships: [base.ships[1], base.ships[0]] }), h);
  assert.notEqual(hashOf({ boats: base.ships }), h);
  assert.notEqual(hashOf({ ships: [base.ships[0]] }), h);
  assert.notEqual(hashOf(0), hashOf(-0));
  assert.match(h, /^[0-9a-f]{16}$/);
  // Padding the last word with zeros does not make two lengths alike.
  assert.notEqual(hashBytes(new Uint8Array([1])), hashBytes(new Uint8Array([1, 0])));
});

test('state hiding outside plain data is refused', () => {
  assert.throws(() => encode({ a: new Float64Array(2) }), /not plain data/);
  assert.throws(() => encode({ a: new Map() }), /not plain data/);
  assert.throws(() => encode({ f: () => 1 }), /function/);
  assert.throws(() => encode([undefined]), /undefined/);
});

test('short or broken bytes fail loudly instead of giving a wrong value', () => {
  const bytes = encode({ a: [1.5, 'x'] });
  assert.throws(() => decode(bytes.subarray(0, bytes.length - 1)), RangeError);
  assert.throws(() => decode(new Uint8Array([...bytes, 0])), /left over/);
  assert.throws(() => decode(new Uint8Array([0, 99])), /unknown tag/);
});
