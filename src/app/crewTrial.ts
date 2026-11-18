/**
 * The crew trial's run (plan N4.0): the same view drawn in phases, without the crew, with her crew, with both, and with
 * both under one knob changed at a time, each measured for a few seconds, so the crew's share of the frame can be read
 * off the tablet as the difference between phases. Pure: the phases, the clock through them and the result's lines;
 * crewTrialRun.ts measures on the page.
 */
import { frameStats, msText, percentile, type FrameStats } from './bench';
import { CROWD, type CrewOverride } from './crewLevels';
import { CREW_SIZE } from './crew';

/** One phase: how many crews are drawn, and what is overridden. */
export interface TrialPhase {
  readonly name: string;
  readonly crews: 0 | 1 | 2;
  readonly override: CrewOverride;
}

/** The phases, in order. */
export const TRIAL_PHASES: readonly TrialPhase[] = [
  { name: 'no crew (sea and ship)', crews: 0, override: {} },
  { name: `her crew (${CREW_SIZE})`, crews: 1, override: {} },
  { name: `both crews (${2 * CREW_SIZE})`, crews: 2, override: {} },
  { name: 'both, every man every frame', crews: 2, override: { everyFrame: true } },
  { name: 'both, all at crowd level', crews: 2, override: { level: CROWD } },
  { name: 'both, no crew shadows', crews: 2, override: { shadows: false } },
];
/** Each phase settles this long before it is measured, s (a change of level costs a rebuild), and is measured this long. */
export const TRIAL_SETTLE_SECONDS = 2;
export const TRIAL_MEASURE_SECONDS = 8;
const PHASE_SECONDS = TRIAL_SETTLE_SECONDS + TRIAL_MEASURE_SECONDS;
/** The crew's share of the frame (implementation plan, Budgets): both crews, animation and drawing, ms. */
export const CREW_BUDGET_MS = 4;
const PERCENT = 100;

/** Where the run is `t` seconds after it started: the phase (its index; the phases' length once done) and whether it is being measured. */
export function trialAt(t: number): { phase: number; measuring: boolean } {
  const phase = Math.max(0, Math.floor(t / PHASE_SECONDS));
  return { phase: Math.min(phase, TRIAL_PHASES.length), measuring: phase < TRIAL_PHASES.length && t - phase * PHASE_SECONDS >= TRIAL_SETTLE_SECONDS };
}

/** The whole run's length, s. */
export const TRIAL_SECONDS = TRIAL_PHASES.length * PHASE_SECONDS;

/** What one phase measured, frame by frame. */
export interface PhaseSamples {
  readonly frames: number[];
  /** The page's own work each frame, ms. */
  readonly work: number[];
  /** The crew's part of it (placing, levels, Actors' updates), ms. */
  readonly crew: number[];
  readonly draws: number[];
}

export const emptySamples = (): PhaseSamples => ({ frames: [], work: [], crew: [], draws: [] });

const median = (v: readonly number[]) => percentile([...v].sort((a, b) => a - b), 1 / 2);

/** One line of the result per phase, then what they say about the crew's share. */
export function trialLines(samples: readonly PhaseSamples[]): string[] {
  const stats: FrameStats[] = samples.map((s) => frameStats(s));
  const lines = ['phase · frame median / 95% · on time · page work median · crew work median · draws'];
  samples.forEach((s, i) => {
    const f = stats[i]!;
    lines.push(`${TRIAL_PHASES[i]!.name} · ${msText(f.median)} / ${msText(f.p95)} · ${Math.round(f.onTime * PERCENT)}% · ${msText(f.workMedian)} · ${msText(median(s.crew))} · ${Math.round(median(s.draws))}`);
  });
  const none = stats[0], both = stats[2];
  if (none && both && samples[2]) {
    const work = both.workMedian - none.workMedian, late = Math.round((none.onTime - both.onTime) * PERCENT);
    lines.push(`both crews add ${msText(work)} of page work (budget ${CREW_BUDGET_MS} ms for animation and drawing) and ${Math.max(0, late)}% more late frames`);
  }
  return lines;
}
