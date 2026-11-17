/**
 * The sea drawn (plan N1.3): one mesh of tiles around the eye (seaGrid.ts), displaced in its vertex stage by the
 * simulated waves (seaWaves.ts, seaMaterial.ts). Each frame it chooses the tiles the camera can see and hands the
 * shader the waves of that moment. Its own origin follows the eye in steps, so the shader's numbers stay small.
 */
import { Box3, BufferGeometry, Float32BufferAttribute, Frustum, Matrix4, Mesh, Vector3, type PerspectiveCamera, type Vector4 } from 'three/webgpu';
import type { SkyLight } from '@futuremagic/sky';
import type { SeaState } from '../sim/sea/sea';
import { SEA } from './materials';
import { SEA_INPUTS, SEA_TILE_ATTRIBUTE, SEA_TILE_STRIDE, TILE_AT } from './seaMaterial';
import { SEA_MAX_TILES, SEA_TILE_CELLS, seaDropAtReach, seaReach, seaTiles } from './seaGrid';
import { SEA_WAVE_STRIDE, fillSeaWaves, seaWaveTable } from './seaWaves';

/** The sea's origin moves in steps of this, m: the shader measures from it, so its numbers stay within a few km. */
const ORIGIN_STEP = 1024;
/** The sea after the sky (drawn first, at the far plane) and before anything that floats on it. */
const SEA_ORDER = 0;

/** Numbers per vertex position. */
const XYZ = 3;

/** One tile of the grid: (cells + 1)² vertices whose position is their (column, 0, row), two triangles a cell. */
function tileGrid(cells: number): BufferGeometry {
  const side = cells + 1, pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) pos.push(i, 0, j);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * side + i, b = a + 1, c = a + side, d = c + 1;
    // Every cell split along the same diagonal, so a cell of the coarser grid is two cells' worth of this one.
    idx.push(a, c, d, a, d, b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, XYZ));
  g.setIndex(idx);
  return g;
}

export class SeaView {
  /** The sea: it goes in with the Stage after the warm-up has built its shader. */
  readonly mesh: Mesh;
  /** Tiles drawn in the last frame. */
  tilesDrawn = 0;
  private readonly table = seaWaveTable();
  private readonly frustum = new Frustum();
  private readonly box = new Box3();
  private readonly viewProj = new Matrix4();
  private readonly origin = new Vector3();

  constructor() {
    const grid = tileGrid(SEA_TILE_CELLS);
    grid.setAttribute(SEA_TILE_ATTRIBUTE, SEA_INPUTS.tiles);
    this.mesh = new Mesh(grid, SEA.make());
    this.mesh.name = 'sea';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = SEA_ORDER;
  }

  /**
   * Once per frame, before drawing: the sea at time `t` (s of the shared clock), seen by `camera`, lit by `light`
   * with `gain` on its lights as the scene's lights carry it (the sky rig's RIG_GAIN).
   */
  show(sea: SeaState, t: number, camera: PerspectiveCamera, light: SkyLight, gain: number): void {
    const I = SEA_INPUTS, cam = camera.position;
    this.origin.set(Math.round(cam.x / ORIGIN_STEP) * ORIGIN_STEP, 0, Math.round(cam.z / ORIGIN_STEP) * ORIGIN_STEP);
    this.mesh.position.copy(this.origin);
    const ox = this.origin.x, oz = this.origin.z;

    const table = fillSeaWaves(sea, t, ox, oz, this.table);
    const wave = I.wave.array as Vector4[], more = I.more.array as Vector4[];
    for (let i = 0; i < table.count; i++) {
      const at = i * SEA_WAVE_STRIDE;
      wave[i]!.fromArray(table.wave, at);
      more[i]!.fromArray(table.more, at);
    }
    I.count.value = table.count;
    I.lift.value = table.lift;
    I.eye.value.set(cam.x - ox, cam.y, cam.z - oz);

    // The tiles the camera can see, with room for the waves and the earth's curve.
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj, camera.coordinateSystem, camera.reversedDepth);
    const room = table.extent, low = -room - seaDropAtReach(cam.y), high = room + table.lift;
    const visible = (x: number, z: number, size: number) => {
      this.box.min.set(x - room, low, z - room);
      this.box.max.set(x + size + room, high, z + size + room);
      return this.frustum.intersectsBox(this.box);
    };
    const tiles = I.tiles.array as Float32Array;
    let n = 0;
    seaTiles(cam, seaReach(cam.y), visible, (x, z, size, level) => {
      if (n >= SEA_MAX_TILES) return;
      const at = n++ * SEA_TILE_STRIDE;
      tiles[at + TILE_AT.x] = x - ox;
      tiles[at + TILE_AT.z] = z - oz;
      tiles[at + TILE_AT.size] = size;
      tiles[at + TILE_AT.level] = level;
    });
    // One tile alone is drawn twice: a mesh drawn once has another shader than one drawn many times (three's key).
    if (n === 1) { tiles.copyWithin(SEA_TILE_STRIDE, 0, SEA_TILE_STRIDE); n = 2; }
    I.tiles.needsUpdate = true;
    I.tiles.clearUpdateRanges();
    I.tiles.addUpdateRange(0, n * SEA_TILE_STRIDE);
    this.mesh.count = n;
    this.tilesDrawn = n;

    const sun = light.lightIntensity * gain, sky = light.hemiIntensity * gain;
    I.sunDir.value.set(...light.lightDir);
    I.sun.value.set(light.lightColor[0] * sun, light.lightColor[1] * sun, light.lightColor[2] * sun);
    I.sky.value.set(light.skyColor[0] * sky, light.skyColor[1] * sky, light.skyColor[2] * sky);
    I.horizon.value.set(...light.fogColor);
    I.haze.value = light.fogDensity;
  }
}
