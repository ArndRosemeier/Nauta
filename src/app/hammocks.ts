/**
 * How far her hammocks are stowed in the waist's nettings as the drawing shows it (ship.md, "The view from the
 * deck"; plan N2.9): the nettings stand empty, and when she beats to quarters the men bring the hammocks up and stow
 * them, one netting after another; secured from quarters, they take them down again. The match says only whether she
 * is at quarters; how far the stowing has got is the drawing's (render/ship/furnishings.ts `stowHammocks`).
 */

/**
 * How long the stowing takes, s: every netting of the waist filled by the watch below, about as long as the guns take
 * to be cast loose and loaded.
 */
const STOW_SECONDS = 45;

/** Her hammocks' share stowed, 0 (the nettings empty) to 1 (all in), followed frame by frame. */
export class HammocksStowed {
  /** The share stowed; below 0 until the first frame, which finds her as she is. */
  private stowed = -1;

  /** The share stowed after `dt` s, she being at quarters or not. */
  after(quarters: boolean, dt: number): number {
    const want = quarters ? 1 : 0;
    if (this.stowed < 0) this.stowed = want;
    const most = dt / STOW_SECONDS;
    this.stowed += Math.max(-most, Math.min(most, want - this.stowed));
    return this.stowed;
  }
}
