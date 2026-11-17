/**
 * The sky over the sea and the light it throws: sun, moon, stars and clouds through the day, and the light rig both
 * games share (@futuremagic/sky/rig SkyRig: physical albedos, the sky as fill through the environment map, the
 * brighter sky under a low sun, eye adaptation, cloud shadows, the grade over the day). Nauta adds only its own
 * settings and the clock; its own light (lanterns below deck) will go in `local` when it comes.
 */
import type { DirectionalLight, HemisphereLight, Scene, WebGPURenderer } from 'three/webgpu';
import type { SkyLight } from '@futuremagic/sky';
import { SkyRig } from '@futuremagic/sky/rig';
import { SKY } from './materials';
import { HOURS_PER_DAY, MINUTES_PER_HOUR } from '../sim/units';

/** Metres up to the clouds: they pass overhead as the ship sails. */
const CLOUD_HEIGHT = 1500;
/** The star field's seed (the same stars every night). */
const STAR_SEED = 1805;
/** The exposure AgX needs on top of the rig's for the same mid-grey as MasterWorld's graded curve (its own `agx` setting). */
const AGX_EXPOSURE = 1.5;
/** Below her deck the eye opens to the dim light that comes down the hatch and from the lantern: this much more exposure. */
const BELOW_EXPOSURE = 3;

export class SkyView extends SkyRig {
  /** How far the eye is below a deck, 0..1 (the ship's view sets it): the eye adapts to the dark there. */
  below = 0;

  /** `dayMinutes`: real minutes a game day takes; 0 stops the clock. Call `update` once before the warm-up. */
  constructor(renderer: WebGPURenderer, scene: Scene, sun: DirectionalLight, hemi: HemisphereLight, hour: number, dayMinutes: number) {
    super(renderer, scene, sun, hemi, { dome: SKY.make(), hour, dayMinutes, starSeed: STAR_SEED, cloudHeight: CLOUD_HEIGHT, exposure: AGX_EXPOSURE });
    // The sun is the directional light, with its shadows: its disc in the environment map would light every shadow
    // again from the sky (on her deck the shade of the bulwark was as bright as the sunlit planks, plan N2.0).
    this.envU.showSunDisc!.value = 0;
  }

  /** Below deck: the sky's grade gives way to the lantern's, and the eye opens (it adapts over a moment, SkyRig). */
  protected override local(_dt: number, _light: SkyLight): void {
    this.inside = this.below;
    this.renderer.toneMappingExposure *= 1 + (BELOW_EXPOSURE - 1) * this.below;
  }

  /** The clock as `14:05`. */
  get clock(): string {
    const m = Math.floor(this.hour * MINUTES_PER_HOUR);
    return `${String(Math.floor(m / MINUTES_PER_HOUR) % HOURS_PER_DAY).padStart(2, '0')}:${String(m % MINUTES_PER_HOUR).padStart(2, '0')}`;
  }
}
