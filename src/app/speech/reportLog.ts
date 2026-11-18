/**
 * The report log (Arnd, 2026-11-18: "an optional Report modal (hideable) where all reports go"): every line the men
 * have said this match, shown or not, newest first, with the match's clock. Pure; the reports sheet
 * (app/reportsPanel.ts) shows it. Kept to the last `LOG_MOST` lines.
 */
import type { Said } from './bubbles';

/** The most lines the log keeps: a long fight's worth of what matters. */
export const LOG_MOST = 300;

/** A line in the log: when (the match's tick), who and what. */
export interface Logged extends Said {
  readonly tick: number;
}

export class ReportLog {
  private lines: Logged[] = [];
  private readonly listeners = new Set<() => void>();

  /** The lines, newest first. */
  get all(): readonly Logged[] {
    return this.lines;
  }

  /** Lines said at the match's tick `tick`. */
  record(said: readonly Said[], tick: number): void {
    if (said.length === 0) return;
    this.lines = [...said.map((s) => ({ ...s, tick })).reverse(), ...this.lines].slice(0, LOG_MOST);
    for (const fn of this.listeners) fn();
  }

  /** Everything forgotten (a new match). */
  clear(): void {
    this.lines = [];
    for (const fn of this.listeners) fn();
  }

  /** Called when a line is added or the log is cleared; returns how to stop. */
  watch(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
