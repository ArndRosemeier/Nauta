/**
 * The sky over the sea and the light it throws: sun, moon, stars and clouds through the day, and the light rig both
 * games share (@futuremagic/sky/rig SkyRig: physical albedos, the sky as fill through the environment map, the
 * brighter sky under a low sun, eye adaptation, cloud shadows, the grade over the day). Nauta adds only its own
 * settings and the clock; its own light (lanterns below deck) will go in `local` when it comes.
 */
import type { DirectionalLight, HemisphereLight, Scene, WebGPURenderer } from 'three/webgpu';
import { SkyRig } from '@futuremagic/sky/rig';
import { SKY } from './materials';
import { HOURS_PER_DAY, MINUTES_PER_HOUR } from '../sim/units';

/** Metres up to the clouds: they pass overhead as the ship sails. */
const CLOUD_HEIGHT = 1500;
/** The star field's seed (the same stars every night). */
const STAR_SEED = 1805;
/** The exposure AgX needs on top of the rig's for the same mid-grey as MasterWorld's graded curve (its own `agx` setting). */
const AGX_EXPOSURE = 1.5;

export class SkyView extends SkyRig {
  /** `dayMinutes`: real minutes a game day takes; 0 stops the clock. Call `update` once before the warm-up. */
  constructor(renderer: WebGPURenderer, scene: Scene, sun: DirectionalLight, hemi: HemisphereLight, hour: number, dayMinutes: number) {
    super(renderer, scene, sun, hemi, { dome: SKY.make(), hour, dayMinutes, starSeed: STAR_SEED, cloudHeight: CLOUD_HEIGHT, exposure: AGX_EXPOSURE });
  }

  /** The strength lit materials take the sky's environment map at (the scene's environment intensity the rig sets). */
  get skyStrength(): number {
    return this.scene.environmentIntensity;
  }

  /** The clock as `14:05`. */
  get clock(): string {
    const m = Math.floor(this.hour * MINUTES_PER_HOUR);
    return `${String(Math.floor(m / MINUTES_PER_HOUR) % HOURS_PER_DAY).padStart(2, '0')}:${String(m % MINUTES_PER_HOUR).padStart(2, '0')}`;
  }
}
