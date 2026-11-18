/**
 * The reports sheet (Arnd, 2026-11-18: "an optional Report modal (hideable) where all reports go"): every line the men
 * have said this match, newest first, each with the match's clock and the man's rank, a cry in the signal colour. It
 * opens from the Reports tag under the compass rose (hidden by the settings' "Reports button") or its key (R by
 * default), in the one sheet frame (sheet.ts), over the running match; the ✕, a tap beside it, Escape or the key
 * again closes it. While open it follows the log, at most four times a second (ui-style.md "Cost").
 */
import { makeButton } from './button';
import { keyCap, make, onKeyPress } from './dom';
import { clockWords } from './orderReport';
import { openSheet, type Sheet } from './sheet';
import type { SettingsStore } from './settingsStore';
import type { ReportLog } from './speech/reportLog';
import { words } from './words';

/** Fewest milliseconds between two redrawings of the open sheet. */
const REDRAW_EVERY_MS = 250;

export class ReportsPanel {
  readonly button: HTMLButtonElement;
  private sheet: Sheet | null = null;
  private stop: (() => void) | null = null;
  private timer = 0;

  constructor(private readonly log: ReportLog, private readonly store: SettingsStore) {
    this.button = makeButton('', () => this.toggle());
    this.button.className = 'nt-pill';
    this.button.id = 'reports-button';
    document.body.append(this.button);
    store.watch((s, before) => {
      this.button.replaceChildren(words(s.language).reports, keyCap(s.keys.reports));
      this.button.style.display = s.reportsButton ? '' : 'none';
      if (this.sheet && before && before.language !== s.language) this.reopen();
    });
    onKeyPress(() => this.store.now.keys.reports, () => this.toggle());
  }

  /** Opens the sheet, or closes it when open. */
  toggle(): void {
    if (this.sheet) this.sheet.shut();
    else this.open();
  }

  private reopen(): void {
    this.sheet?.shut();
    this.open();
  }

  private open(): void {
    const say = words(this.store.now.language);
    this.sheet = openSheet('reports-sheet', say.reports, say.close, () => {
      this.stop?.();
      this.stop = null;
      window.clearTimeout(this.timer);
      this.timer = 0;
      this.sheet = null;
    });
    this.fill();
    this.stop = this.log.watch(() => {
      if (!this.timer) this.timer = window.setTimeout(() => { this.timer = 0; this.fill(); }, REDRAW_EVERY_MS);
    });
  }

  /** The log's lines into the open sheet. */
  private fill(): void {
    if (!this.sheet) return;
    const say = words(this.store.now.language), lines = this.log.all;
    if (lines.length === 0) {
      this.sheet.body.replaceChildren(make('p', 'nt-note', say.noReports));
      return;
    }
    const list = make('ol', 'reports-list');
    for (const l of lines) {
      const li = make('li', l.say.kind === 'cry' ? 'cry' : '');
      li.append(make('span', 'reports-at nt-value', clockWords(l.tick)), make('span', 'reports-rank', l.rank), make('span', 'reports-words', l.words));
      list.append(li);
    }
    this.sheet.body.replaceChildren(list);
  }
}
