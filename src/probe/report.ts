/**
 * The probe's report (plan N0.5): sections of labelled rows, written as plain text that can be copied off a tablet
 * and pasted into a message. Pure.
 */
import { MS_PER_SECOND } from '../sim/units';

/** One line of the report: what was asked, and the answer. */
export type Row = readonly [label: string, value: string];

export interface Section {
  readonly title: string;
  readonly rows: readonly Row[];
}

/** Bytes in a KiB; each larger unit is this many of the one before. */
const KIB = 1024;
const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
/** Space between the longest label of a section and its values. */
const GAP = 2;
/** Significant digits of a time in the report: plenty for a frame budget. */
const MS_DIGITS = 3;

/** The whole report: a heading line, then each section with its labels lined up. */
export function formatReport(heading: string, sections: readonly Section[]): string {
  const parts = [heading];
  for (const s of sections) {
    const width = Math.max(0, ...s.rows.map(([label]) => label.length)) + GAP;
    parts.push(`\n== ${s.title} ==`, ...s.rows.map(([label, value]) => `${label.padEnd(width)}${value}`));
  }
  return parts.join('\n') + '\n';
}

/** The middle value (the mean of the two middle ones for an even count); NaN for none. */
export function medianOf(values: readonly number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The display's refresh rate from the times between animation frames, ms: the median, so a hitch does not count. */
export function hzFromIntervals(intervalsMs: readonly number[]): number {
  return MS_PER_SECOND / medianOf(intervalsMs);
}

/** A size in bytes as people read it: `512 B`, `64 KiB`, `1.5 GiB`. */
export function formatBytes(bytes: number): string {
  let v = bytes, u = 0;
  while (v >= KIB && u < BYTE_UNITS.length - 1) { v /= KIB; u++; }
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${BYTE_UNITS[u]}`;
}

export const yesNo = (b: boolean): string => (b ? 'yes' : 'no');

/** Milliseconds for the report, to MS_DIGITS significant digits. */
export function formatMs(ms: number): string {
  return Number.isFinite(ms) ? `${ms.toPrecision(MS_DIGITS)} ms` : 'not measured';
}
