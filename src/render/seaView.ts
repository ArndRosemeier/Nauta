/**
 * The sea drawn (plan N1.3): one mesh of tiles around the eye (seaGrid.ts), displaced in its vertex stage by the
 * simulated waves (seaWaves.ts, seaMaterial.ts). Each frame it chooses the tiles the camera can see and hands the
 * shader the waves of that moment. Its own origin follows the eye in steps, so the shader's numbers stay small.
 */
import { Box3, BufferGeometry, Float32BufferAttribute, Frustum, Matrix4, Mesh, SphereGeometry, Vector3, type PerspectiveCamera, type Vector4 } from 'three/webgpu';
import { smoothstep } from '@futuremagic/core';
import { surfaceAt, seaSample, seaWind, type SeaState } from '../sim/sea/sea';
import type { WaveSet } from '../sim/sea/waves';
import type { WindState } from '../sim/wind';
import { DEEP, SEA } from './materials';
import { SEA_INPUTS, SEA_TILE_ATTRIBUTE, SEA_TILE_STRIDE, TILE_AT, useSeaSky } from './seaMaterial';
import { SEA_MAX_TILES, SEA_TILE_CELLS, seaCellChoices, seaDropAtReach, seaReach, seaTiles, seaTileTriangles } from './seaGrid';
import { SEA_WAVE_STRIDE, WAVE_AT, fillSeaWaves, seaWaveTable } from './seaWaves';
import { SEA_FINE_STRIDE, fillFineWaves, fineTable, slopeVariance } from './seaFine';
import { FOAM_WRAP, foamLevels } from './seaFoam';
import { RIPPLE_REPEATS_SECOND, RIPPLE_TILE } from './seaRipples';
import { drawGusts, type GustMap } from './seaGusts';
import type { SkyView } from './skyView';

/** The sea's origin moves in steps of this, m: the shader measures from it, so its numbers stay within a few km. */
const ORIGIN_STEP = 1024;
/** The sea after the sky (drawn first, at the far plane) and before anything that floats on it. */
const SEA_ORDER = 0;

/** Numbers per vertex position. */
const XYZ = 3;
/** The deep around an eye under water: its sphere's radius (m, inside the sky's dome, beyond what is seen through the murk) and detail. */
const DEEP_RADIUS = 2000;
const DEEP_SEGMENTS = 16;
/** Drawn after the sky and the stars, before the sea's underside. */
const DEEP_ORDER = -10;
/** The foam's pattern drifts with the wind (m per m/s of wind and s), wrapped every FOAM_WRAP m (a whole number of both its tiles). */
const FOAM_DRIFT = 0.03;
/**
 * The ripples' two layers drift at about their own speed (m/s; the slowest ripples run at 0.23 m/s), the first with the
 * wind, the second across it at a third of a turn, so the pattern never slides as one.
 */
const RIPPLE_SPEED = 0.3;
const RIPPLE_SPEED_SECOND = 0.22;
const RIPPLE_TURN_SECOND = (2 * Math.PI) / (2 + 1);
/** The second ripple layer's tile, m. */
const RIPPLE_TILE_SECOND = FOAM_WRAP / RIPPLE_REPEATS_SECOND;
/** The water is stirred grey-green from this wind (m/s) to fully at that one: force 5 to a gale. */
const STIRRED_FROM = 8;
const STIRRED_FULL = 20;
/** Twice the deviation of the surface's height: a tall crest (the significant height is four deviations). */
const CREST_DEVIATIONS = 2;

/**
 * One tile of the grid: the densest grid's (SEA_TILE_CELLS + 1)² vertices, whose position is their (column, 0, row),
 * and the triangles of every grid a quality level may draw (`seaCells`), one after the other: a level picks its run
 * of the index by the draw range, so the shader and the vertices stay the same and nothing is compiled.
 */
function tileGrid(): { geometry: BufferGeometry; runs: Map<number, { start: number; count: number }> } {
  const pos: number[] = [], idx: number[] = [], runs = new Map<number, { start: number; count: number }>();
  for (let j = 0; j <= SEA_TILE_CELLS; j++) for (let i = 0; i <= SEA_TILE_CELLS; i++) pos.push(i, 0, j);
  for (const cells of seaCellChoices()) {
    const tris = seaTileTriangles(cells);
    runs.set(cells, { start: idx.length, count: tris.length });
    idx.push(...tris);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, XYZ));
  g.setIndex(idx);
  return { geometry: g, runs };
}

export class SeaView {
  /** The sea: it goes in with the Stage after the warm-up has built its shader. */
  readonly mesh: Mesh;
  /** The deep around an eye under water: in with the Stage too, shown only while the eye is below the surface. */
  readonly deep: Mesh;
  /** Whether the eye was under the water in the last frame. */
  underWater = false;
  /** Set by the app while the eye is inside a hull: below the waterline there it is dry, not under water. */
  sheltered = false;
  /** Tiles drawn in the last frame. */
  tilesDrawn = 0;
  private readonly table = seaWaveTable();
  private readonly frustum = new Frustum();
  private readonly box = new Box3();
  private readonly viewProj = new Matrix4();
  /** Where the sea's own frame stands (it follows the eye in steps); the ship's sea cut reads it. */
  readonly origin = new Vector3();
  private readonly fine = fineTable();
  private readonly gusts: GustMap;
  private readonly sample = seaSample();
  private readonly coarse = new WeakMap<WaveSet, number>();
  private foamDrift = 0;
  /** Where each ripple layer has drifted to, in its tiles (u, v of the first, then of the second), kept within one. */
  private readonly rippleDrift = [0, 0, 0, 0];

  /** Where each grid's triangles stand in the index, by cells along a tile's side. */
  private readonly runs: Map<number, { start: number; count: number }>;

  /** The sky's light rig must exist: the sea reflects its environment map. */
  constructor(sky: SkyView) {
    useSeaSky(sky.envTexture);
    const { geometry: grid, runs } = tileGrid();
    this.runs = runs;
    grid.setAttribute(SEA_TILE_ATTRIBUTE, SEA_INPUTS.tiles);
    this.mesh = new Mesh(grid, SEA.make());
    this.mesh.name = 'sea';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = SEA_ORDER;
    this.deep = new Mesh(new SphereGeometry(DEEP_RADIUS, DEEP_SEGMENTS, DEEP_SEGMENTS), DEEP.make());
    this.deep.name = 'deep';
    this.deep.frustumCulled = false;
    this.deep.renderOrder = DEEP_ORDER;
    this.deep.visible = false;
    this.gusts = { data: SEA_INPUTS.gusts.image.data as Uint8Array, x0: 0, z0: 0 };
    this.setCells(SEA_TILE_CELLS);
  }

  /** Draws every tile with `cells` along its side (the quality level's `seaCells`): a uniform and a draw range, no compile. */
  setCells(cells: number): void {
    const run = this.runs.get(cells);
    if (!run) throw new Error(`the sea's grid has no run of ${cells} cells a side (seaCellChoices)`);
    this.mesh.geometry.setDrawRange(run.start, run.count);
    SEA_INPUTS.spacing.value = SEA_TILE_CELLS / cells;
  }

  /**
   * Once per frame, before drawing: the sea at time `t` (s of the shared clock) under the wind `wind` (its gusts)
   * blowing at `speed` m/s on the mean, seen by `camera`, lit by `sky`; `dt` is the time since the last frame (s).
   */
  show(sea: SeaState, wind: WindState, speed: number, t: number, dt: number, camera: PerspectiveCamera, sky: SkyView): void {
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
    let variance = 0;
    for (let i = 0; i < table.count; i++) variance += table.wave[i * SEA_WAVE_STRIDE + WAVE_AT.height]! ** 2 / 2;
    I.crest.value = Math.max(CREST_DEVIATIONS * Math.sqrt(variance), Number.EPSILON);

    // The fine waves, the foam's levels and its drift, the gusts.
    const fine = fillFineWaves(sea, t, ox, oz, this.fine);
    const fw = I.fine.array as Vector4[], fm = I.fineMore.array as Vector4[];
    for (let i = 0; i < fine.count; i++) {
      fw[i]!.fromArray(fine.wave, i * SEA_FINE_STRIDE);
      fm[i]!.fromArray(fine.more, i * SEA_FINE_STRIDE);
    }
    I.fineCount.value = fine.count;
    I.fineExcess.value = fine.excess;
    I.ripples.value = fine.ripples;
    const levels = foamLevels(table, speed);
    I.foamLevel.value = levels.level;
    I.foamRamp.value = levels.ramp;
    const blowing = seaWind(sea, t);
    this.foamDrift = (this.foamDrift + speed * FOAM_DRIFT * dt) % FOAM_WRAP;
    I.foamDrift.value.set(
      (ox - this.foamDrift * Math.cos(blowing.toward)) % FOAM_WRAP,
      (oz - this.foamDrift * Math.sin(blowing.toward)) % FOAM_WRAP,
    );
    // A pattern that moves along d shows at p − d·s: the first layer reads (x, z), the second (z, −x).
    const d = this.rippleDrift, a = blowing.toward, b = a + RIPPLE_TURN_SECOND;
    const s1 = (RIPPLE_SPEED * dt) / RIPPLE_TILE, s2 = (RIPPLE_SPEED_SECOND * dt) / RIPPLE_TILE_SECOND;
    d[0] = (d[0]! - s1 * Math.cos(a)) % 1;
    d[1] = (d[1]! - s1 * Math.sin(a)) % 1;
    d[2] = (d[2]! - s2 * Math.sin(b)) % 1;
    d[3] = (d[3]! + s2 * Math.cos(b)) % 1;
    I.rippleDrift.value.fromArray(d);
    I.stirred.value = smoothstep(STIRRED_FROM, STIRRED_FULL, speed);
    drawGusts(wind, t, cam.x, cam.z, speed, this.coarseOf(sea, t), this.gusts);
    I.gustCorner.value.set(this.gusts.x0 - ox, this.gusts.z0 - oz);
    I.gusts.needsUpdate = true;

    // Under the water: the deep around the eye, and the sea's underside.
    this.underWater = !this.sheltered && cam.y < surfaceAt(sea, cam.x, cam.z, t, this.sample).height;
    this.deep.visible = this.underWater;
    this.deep.position.copy(cam);

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

    I.sunDir.value.copy(sky.lightDirection);
    I.sun.value.set(sky.sunColor.r, sky.sunColor.g, sky.sunColor.b);
    I.skyLight.value = sky.skyStrength;
    I.haze.value = sky.light.fogDensity;
  }

  /** The slope the simulated waves of the sea's newest wind carry, with the swell's (for how a gust roughens the rest). */
  private coarseOf(sea: SeaState, t: number): number {
    let newest = sea.seaLayers[0]!;
    for (const l of sea.seaLayers) if (l.start <= t) newest = l;
    let c = this.coarse.get(newest.waves);
    if (c === undefined) {
      c = slopeVariance(newest.waves) + slopeVariance(sea.seaSwell);
      this.coarse.set(newest.waves, c);
    }
    return c;
  }
}
