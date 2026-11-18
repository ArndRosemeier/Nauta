/**
 * The spyglass (plan N3.8): raised to the eye by its button or by spreading two fingers, it magnifies the view into a
 * round field; spread or pinch the fingers to draw it out or in, pinch it right in to lower it. Held in the hands, it
 * is never quite still: the hands tremble a little, and on a rolling deck they keep the glass on what is seen only as
 * fast as they can follow, so the slow lift of her roll is taken out and its quicker part sways the view.
 *
 * Pure: the input (glassInput.ts) raises, lowers and draws it out; the page reads how far it is raised, its
 * magnification, the aim it trembles to (`aim`), and the ship view asks it how it holds against her motion (`hold`,
 * render/ship/shipView.ts `Steadying`).
 */
import { Rng } from '@futuremagic/core';
import type { Look } from './look';

/** The glass's magnification: the least it is drawn in to, where it starts, and the most it is drawn out to (a ship's day glass of 1800 gave 10 to 20 times). */
export const GLASS_POWER = { least: 4, start: 10, most: 20 } as const;
/** Raising it to the eye or lowering it takes this long, s. */
const RAISE_SECONDS = 0.45;
/**
 * How quickly the hands follow her motion with the glass, s: the tilt of her deck that changes slower than this is
 * taken out, quicker motion sways the view. Her roll of 6 s or so is followed to within about a tenth of its swing.
 */
const HOLD_SECONDS = 0.1;
/** The hands' tremble: two slow wanderings each way, rad (true angle, so the glass magnifies it) at Hz. */
const TREMBLE = [{ rad: 0.0006, hz: 0.7 }, { rad: 0.00025, hz: 2.3 }] as const;
/** Spread the fingers by this share to raise the glass. */
const PINCH_RAISE = 1.2;
/** Pinching in below the least magnification by this share lowers the glass. */
const PINCH_LOWER = 0.8;
/** A turn, rad. */
const TURN = 2 * Math.PI;
/** The look's two axes the tremble moves: yaw and pitch. */
const AXES = 2;

export class Spyglass {
  /** Whether it is wanted at the eye (it is raised or lowered over `RAISE_SECONDS`). */
  up: boolean;
  /** How far it is raised now, 0..1. */
  raised: number;
  /** How far it is drawn out: its magnification once raised. */
  power: number = GLASS_POWER.start;
  /** Her pitch and roll as the hands follow them (null until the first frame), rad. */
  private followed: [number, number] | null = null;
  /** The pinch's start: whether it was up and its power then. */
  private pinched: { up: boolean; power: number } | null = null;
  private time = 0;
  private readonly phases: number[];

  /** `power`: raised from the start, drawn out so far (`?glass=12`); null: lowered. */
  constructor(seed: number, power: number | null = null) {
    const rng = new Rng(seed);
    this.phases = Array.from({ length: TREMBLE.length * AXES }, () => rng.float() * TURN);
    this.up = power !== null;
    this.raised = this.up ? 1 : 0;
    if (power !== null) this.power = clampPower(power);
  }

  /** Raises it, or lowers it when it is up. */
  toggle(): void {
    this.up = !this.up;
  }

  /** Two fingers put down: a pinch starts from how the glass is now. */
  pinchStart(): void {
    this.pinched = { up: this.up, power: this.power };
  }

  /** The two fingers now `ratio` times as far apart as when they came down: raise it, draw it out or in, or lower it. */
  pinch(ratio: number): void {
    const p = this.pinched;
    if (!p) return;
    if (!p.up) {
      if (ratio >= PINCH_RAISE) { this.up = true; this.pinched = { up: true, power: this.power / ratio }; }
      return;
    }
    const power = p.power * ratio;
    if (power < GLASS_POWER.least * PINCH_LOWER) { this.up = false; this.pinched = null; return; }
    this.power = clampPower(power);
  }

  /** The fingers lifted. */
  pinchEnd(): void {
    this.pinched = null;
  }

  /** Drawn out (`factor` > 1) or in, while it is up (the mouse wheel). */
  draw(factor: number): void {
    if (this.up) this.power = clampPower(this.power * factor);
  }

  /** Once a frame: raised or lowered toward where it is wanted, and its tremble's clock. */
  step(dt: number): void {
    this.time += dt;
    const k = dt / RAISE_SECONDS;
    this.raised = this.up ? Math.min(1, this.raised + k) : Math.max(0, this.raised - k);
  }

  /** How much the view is magnified now: 1 lowered, its power raised, eased between while it is raised or lowered. */
  get magnification(): number {
    const r = this.raised, eased = r * r * (2 + 1 - 2 * r);
    return 1 + (this.power - 1) * eased;
  }

  /** The look as the glass points it: the captain's look and the hands' tremble, as far as it is raised. */
  aim(look: Look): Look {
    if (this.raised <= 0) return look;
    const off = [0, 0];
    TREMBLE.forEach((t, i) => {
      for (let a = 0; a < AXES; a++) off[a]! += t.rad * Math.sin(this.time * t.hz * TURN + this.phases[i * AXES + a]!);
    });
    return { yaw: look.yaw + off[0]! * this.raised, pitch: look.pitch + off[1]! * this.raised };
  }

  /**
   * Her pitch and roll now (rad) followed by the hands over the frame's `dt` s: what of her tilt they do not take
   * out of the glass (render/ship/shipView.ts `Steadying`). Called every frame, raised or not, so the hands are with
   * her motion when it comes up.
   */
  hold(pitch: number, roll: number, dt: number): [number, number] {
    const f = (this.followed ??= [pitch, roll]), k = dt > 0 ? 1 - Math.exp(-dt / HOLD_SECONDS) : 0;
    f[0] += (pitch - f[0]) * k;
    f[1] += (roll - f[1]) * k;
    return [pitch - f[0], roll - f[1]];
  }
}

/** A magnification held to what the glass can be drawn to. */
const clampPower = (p: number): number => Math.min(GLASS_POWER.most, Math.max(GLASS_POWER.least, p));
