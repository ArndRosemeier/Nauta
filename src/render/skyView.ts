/**
 * The sky over the sea: sun, moon, stars and clouds through the day (@futuremagic/sky). For now it is the whole
 * picture (plan N0); the light it throws on the sea and the ship comes with them (N1).
 */
import { BoxGeometry, Mesh, type PerspectiveCamera, type Scene, type Sprite, type WebGPURenderer } from 'three/webgpu';
import { CLEAR, moonAt, skyLight, skyPath, starField, type SkyWeather, type Vec3 } from '@futuremagic/sky';
import { MOON_RADIUS, makeStarsNode } from '@futuremagic/sky/node';
import { SKY } from './materials';

/** Metres up to the clouds: they pass overhead as the ship sails. */
const CLOUD_HEIGHT = 1500;
/** The star field's seed (the same stars every night). */
const STAR_SEED = 1805;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Uniforms = Record<string, { value: any }>;

export class SkyView {
  /** Hours 0..24, and whole days since the start. */
  hour: number;
  day = 0;
  weather: SkyWeather = { ...CLEAR };
  /** The dome: it goes in with `stage.add` after the warm-up has compiled its kind. */
  readonly dome: Mesh;
  private readonly stars: Sprite;
  private readonly U: Uniforms;
  private readonly sunDir: Vec3 = [0, 1, 0];
  private time = 0;

  /** `dayMinutes`: real minutes a game day takes; 0 stops the clock. */
  constructor(scene: Scene, private readonly renderer: WebGPURenderer, hour: number, private readonly dayMinutes: number) {
    this.hour = hour;
    const material = SKY.make();
    this.dome = new Mesh(new BoxGeometry(1, 1, 1), material);
    this.dome.name = 'sky';
    this.dome.scale.setScalar(100000);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.U = (material as unknown as { uniforms: Uniforms }).uniforms;
    this.U.cloudHeight.value = CLOUD_HEIGHT;
    const field = starField(STAR_SEED);
    this.stars = makeStarsNode(field.position, field.color, 2, this.U.moonDir, Math.cos(MOON_RADIUS * 1.15));
    this.stars.name = 'stars';
    this.stars.renderOrder = -999;
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    this.update(0, null);
  }

  /** Once per frame. `camera` null: only the sky's own state (the constructor). */
  update(dt: number, camera: PerspectiveCamera | null): void {
    if (this.dayMinutes > 0) {
      this.hour += (dt / 60 / this.dayMinutes) * 24;
      if (this.hour >= 24) { this.hour -= 24; this.day++; }
    }
    this.time += dt;
    const sun = skyPath(this.hour, this.sunDir);
    const moon = moonAt(this.hour, this.day * 24 + this.hour, sun);
    const L = skyLight(sun, moon, this.weather), wx = this.weather, U = this.U;
    U.sunPosition.value.set(sun[0], sun[1], sun[2]);
    U.cloudCoverage.value = wx.cover; U.cloudDensity.value = wx.density; U.cloudDark.value = wx.dark;
    U.overcast.value = L.overcast; U.skyFog.value = L.skyFog;
    U.fogCol.value.setRGB(...L.fogColor);
    U.moonDir.value.set(...moon.dir);
    U.moonSun.value.set(...moon.sunSide);
    U.moonBright.value = L.moonBright;
    U.time.value = this.time;
    (this.stars.material as { opacity: number }).opacity = L.stars;
    this.renderer.toneMappingExposure = L.exposure;
    if (camera) { this.dome.position.copy(camera.position); this.stars.position.copy(camera.position); }
  }

  /** The clock as `14:05`. */
  get clock(): string {
    const m = Math.floor(this.hour * 60);
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
}
