/**
 * Plain data to bytes and back, and a hash of it (implementation plan N3.1): what the simulation's state, orders and
 * events travel and are compared as. One codec for all of them, with no schema: it walks the value, so a later package
 * that adds a field to `SimState` needs no change here. Pure.
 *
 * **Canonical.** An object's keys are written sorted, so two equal values give the same bytes on every machine
 * whatever order their fields were made in, and the hash of the bytes is the hash of the value.
 *
 * **Exact.** A whole number that fits 32 bits travels as a zigzag varint (one to five bytes); every other number,
 * -0, NaN and the infinities included, as its 8 bytes of IEEE double. Decoding gives back the very same bits.
 *
 * **What it carries:** numbers, strings, booleans, null, arrays and plain objects. A key whose value is `undefined`
 * is left out, as JSON does; anything else (functions, typed arrays, maps, class instances) is refused, so no state
 * can hide in one.
 *
 * **Layout:** the key table (a varint count, then each key as a string), then the value. A value is a tag byte and
 * its body: a string or an array is its varint length and its items, an object its varint count and, per field, the
 * key's varint index in the table and the value.
 */
import { hash32, hashCombine } from '@futuremagic/core';

/**
 * A value the codec carries. The functions take `unknown` and check at run time, since TypeScript lets no interface
 * (`ShipPose`, `SeaState`) stand where an index signature is asked for.
 */
export type Plain = number | string | boolean | null | readonly Plain[] | { readonly [key: string]: Plain | undefined };
type Fields = { readonly [key: string]: unknown };

/** The tag byte before each value. */
const enum Tag { Null, False, True, Int, Double, Text, List, Record }

/** Bits of a byte, and of a varint's byte that carry its number (the top bit says "more follows"). */
const BYTE = 8;
const VARINT_BITS = 7;
const VARINT_MORE = 0x80;
const VARINT_LOW = 0x7f;
/** The bytes of an IEEE double, and of one word the hash reads. */
const DOUBLE_BYTES = 8;
const WORD_BYTES = 4;
/** The largest and smallest whole numbers sent as a varint (32-bit signed). */
const INT_MOST = 0x7fffffff;
const INT_LEAST = -0x80000000;
/** The first size of the writer's buffer, bytes; it doubles when full. */
const FIRST_BUFFER = 1024;
/** Hex digits of one 32-bit lane of the hash. */
const LANE_DIGITS = 8;
const HEX = 16;
/** The two lanes' starting values (each lane a running hashCombine over the words), so a hash is 64 bits. */
const LANE_A = 0x9e3779b9;
const LANE_B = 0x85ebca6b;

/** A growing buffer of bytes. */
class Writer {
  bytes = new Uint8Array(FIRST_BUFFER);
  view = new DataView(this.bytes.buffer);
  length = 0;

  room(n: number): void {
    if (this.length + n <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + n) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
    this.view = new DataView(grown.buffer);
  }

  byte(b: number): void {
    this.room(1);
    this.bytes[this.length++] = b;
  }

  varint(n: number): void {
    let u = n >>> 0;
    while (u > VARINT_LOW) {
      this.byte((u & VARINT_LOW) | VARINT_MORE);
      u >>>= VARINT_BITS;
    }
    this.byte(u);
  }

  double(x: number): void {
    this.room(DOUBLE_BYTES);
    this.view.setFloat64(this.length, x);
    this.length += DOUBLE_BYTES;
  }

  text(s: string): void {
    const utf8 = encoder.encode(s);
    this.varint(utf8.length);
    this.room(utf8.length);
    this.bytes.set(utf8, this.length);
    this.length += utf8.length;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** The keys of a plain object that carry a value, sorted. */
function keysOf(o: Fields): string[] {
  return Object.keys(o).filter((k) => o[k] !== undefined).sort();
}

/** Whether a number travels as a varint: whole, within 32 bits, and not -0. */
function isInt(x: number): boolean {
  return Number.isInteger(x) && x >= INT_LEAST && x <= INT_MOST && !Object.is(x, -0);
}

/** Every key used anywhere in `value`, into `table` in the order first met (sorted within each object). */
function gatherKeys(value: unknown, table: Map<string, number>, path: string): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) gatherKeys(value[i], table, `${path}[${i}]`);
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${path || 'the value'} is not plain data`);
  const o = value as Fields;
  for (const k of keysOf(o)) {
    if (!table.has(k)) table.set(k, table.size);
    gatherKeys(o[k], table, `${path}.${k}`);
  }
}

function writeValue(w: Writer, value: unknown, table: Map<string, number>, path: string): void {
  switch (typeof value) {
    case 'number':
      if (isInt(value)) {
        w.byte(Tag.Int);
        // Zigzag: small negative numbers stay short.
        w.varint((value << 1) ^ (value >> (BYTE * WORD_BYTES - 1)));
      } else {
        w.byte(Tag.Double);
        w.double(value);
      }
      return;
    case 'string':
      w.byte(Tag.Text);
      w.text(value);
      return;
    case 'boolean':
      w.byte(value ? Tag.True : Tag.False);
      return;
    case 'object':
      if (value === null) { w.byte(Tag.Null); return; }
      if (Array.isArray(value)) {
        w.byte(Tag.List);
        w.varint(value.length);
        for (let i = 0; i < value.length; i++) writeValue(w, value[i], table, `${path}[${i}]`);
        return;
      }
      {
        const o = value as Fields;
        const keys = keysOf(o);
        w.byte(Tag.Record);
        w.varint(keys.length);
        for (const k of keys) {
          w.varint(table.get(k)!);
          writeValue(w, o[k], table, `${path}.${k}`);
        }
      }
      return;
    default:
      throw new TypeError(`${path || 'the value'} is a ${typeof value}, which is not plain data`);
  }
}

/** A value as bytes: the same value always gives the same bytes. */
export function encode(value: unknown): Uint8Array {
  const table = new Map<string, number>();
  gatherKeys(value, table, '');
  const w = new Writer();
  w.varint(table.size);
  for (const k of table.keys()) w.text(k);
  writeValue(w, value, table, '');
  return w.bytes.slice(0, w.length);
}

/** Reads bytes back, failing loudly on anything short or malformed. */
class Reader {
  readonly view: DataView;
  at = 0;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  byte(): number {
    if (this.at >= this.bytes.length) throw new RangeError('the bytes end in the middle of a value');
    return this.bytes[this.at++]!;
  }

  varint(): number {
    let u = 0, shift = 0, b: number;
    do {
      if (shift > BYTE * WORD_BYTES) throw new RangeError('a varint runs past 32 bits');
      b = this.byte();
      u |= (b & VARINT_LOW) << shift;
      shift += VARINT_BITS;
    } while (b & VARINT_MORE);
    return u >>> 0;
  }

  double(): number {
    if (this.at + DOUBLE_BYTES > this.bytes.length) throw new RangeError('the bytes end in the middle of a number');
    const x = this.view.getFloat64(this.at);
    this.at += DOUBLE_BYTES;
    return x;
  }

  text(): string {
    const n = this.varint();
    if (this.at + n > this.bytes.length) throw new RangeError('the bytes end in the middle of a text');
    const s = decoder.decode(this.bytes.subarray(this.at, this.at + n));
    this.at += n;
    return s;
  }
}

function readValue(r: Reader, keys: readonly string[]): Plain {
  const tag = r.byte();
  switch (tag) {
    case Tag.Null: return null;
    case Tag.False: return false;
    case Tag.True: return true;
    case Tag.Int: {
      const u = r.varint();
      return (u >>> 1) ^ -(u & 1);
    }
    case Tag.Double: return r.double();
    case Tag.Text: return r.text();
    case Tag.List: {
      const n = r.varint(), out: Plain[] = [];
      for (let i = 0; i < n; i++) out.push(readValue(r, keys));
      return out;
    }
    case Tag.Record: {
      const n = r.varint(), out: { [key: string]: Plain } = {};
      for (let i = 0; i < n; i++) {
        const k = keys[r.varint()];
        if (k === undefined) throw new RangeError('a field names a key the table does not have');
        out[k] = readValue(r, keys);
      }
      return out;
    }
    default:
      throw new RangeError(`unknown tag ${tag} at byte ${r.at - 1}`);
  }
}

/** Bytes back to the value `encode` made of them: bit for bit the same numbers. */
export function decode(bytes: Uint8Array): Plain {
  const r = new Reader(bytes);
  const keys: string[] = [];
  for (let i = r.varint(); i > 0; i--) keys.push(r.text());
  const value = readValue(r, keys);
  if (r.at !== bytes.length) throw new RangeError(`${bytes.length - r.at} bytes left over after the value`);
  return value;
}

/**
 * A 64-bit hash of bytes as 16 hex digits: two lanes, each a running hashCombine over the bytes taken four at a
 * time (the last word padded with zeros), with the length mixed in. For comparing states between machines, not
 * for security.
 */
export function hashBytes(bytes: Uint8Array): string {
  let a = hash32(LANE_A ^ bytes.length), b = hash32(LANE_B ^ bytes.length);
  for (let i = 0; i < bytes.length; i += WORD_BYTES) {
    let word = 0;
    for (let j = 0; j < WORD_BYTES; j++) word |= (bytes[i + j] ?? 0) << (BYTE * j);
    a = hashCombine(a, word);
    b = hashCombine(b, word ^ LANE_B);
  }
  return a.toString(HEX).padStart(LANE_DIGITS, '0') + b.toString(HEX).padStart(LANE_DIGITS, '0');
}

/** The hash of a value: of its canonical bytes, so equal values hash alike on every machine. */
export function hashOf(value: unknown): string {
  return hashBytes(encode(value));
}
