/**
 * The crew trial on the page (`?crew`, plan N4.0): a button starts it (`?crew&trial` starts it at once), it runs the
 * phases of crewTrial.ts one after another and shows the result on the screen, large enough to read off the tablet.
 */
import { TRIAL_PHASES, TRIAL_SECONDS, emptySamples, trialAt, trialLines, type PhaseSamples, type TrialPhase } from './crewTrial';
import { MS_PER_SECOND } from '../sim/units';
import { makeButton } from './button';

/** What the page tells the trial about itself. */
export interface TrialProbe {
  /** Whether the page has settled (its quality level chosen): the trial waits until then. */
  readonly settled: () => boolean;
  /** One line on what is drawn and how. */
  readonly about: () => string;
  /** One line on the shaders (none built on the render path is the rule). */
  readonly shaders: () => string;
}

declare global {
  interface Window {
    /** The trial's result as text once it has finished (the headless check reads it). */
    __nautaTrial?: string;
  }
}

export class CrewTrialRun {
  private start = -1;
  private last = 0;
  private wanted: boolean;
  private done = false;
  private samples: PhaseSamples[] = [];

  /** `el`: where the trial writes; `auto`: start as soon as the page has settled. */
  constructor(private readonly el: HTMLElement, private readonly probe: TrialProbe, auto: boolean) {
    this.wanted = auto;
    el.style.display = 'block';
    this.idle('crew trial · measures the frame without the crew, with hers and with both, about a minute');
  }

  /** At the start of every frame: the phase to draw, or null when no trial runs (draw as the knobs say). */
  phaseAt(now: number): TrialPhase | null {
    if (!this.wanted || this.done) return null;
    if (this.start < 0) {
      if (!this.probe.settled()) { this.el.textContent = 'crew trial · waiting for the quality level'; return null; }
      this.start = now; this.last = now;
      this.samples = TRIAL_PHASES.map(emptySamples);
    }
    const t = (now - this.start) / MS_PER_SECOND, at = trialAt(t);
    if (at.phase >= TRIAL_PHASES.length) { this.report(); return null; }
    if (at.measuring) this.samples[at.phase]!.frames.push(now - this.last);
    this.last = now;
    this.el.textContent = `crew trial · ${Math.floor(t)} of ${TRIAL_SECONDS} s · ${TRIAL_PHASES[at.phase]!.name}${at.measuring ? '' : ' (settling)'}`;
    return TRIAL_PHASES[at.phase]!;
  }

  /** At the end of every frame: the page's work, the crew's part of it, ms, and the draws. */
  measured(now: number, work: number, crew: number, draws: number): void {
    if (this.start < 0 || this.done) return;
    const at = trialAt((now - this.start) / MS_PER_SECOND);
    const s = this.samples[at.phase];
    if (!at.measuring || !s || s.work.length >= s.frames.length) return;
    s.work.push(work); s.crew.push(crew); s.draws.push(draws);
  }

  private report(): void {
    this.done = true;
    const text = [`CREW TRIAL · ${this.probe.about()}`, ...trialLines(this.samples), this.probe.shaders()].join('\n');
    window.__nautaTrial = text;
    this.idle(text, 'Run again');
  }

  /** Shows `text` and a button that starts the trial. */
  private idle(text: string, label = 'Run the crew trial'): void {
    this.el.textContent = text;
    this.el.append('\n', makeButton(label, () => { this.wanted = true; this.done = false; this.start = -1; this.el.textContent = 'crew trial · starting'; }));
  }
}
