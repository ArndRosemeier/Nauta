// @ts-nocheck -- three's TSL typings infer vector widths poorly for this much shader math; checked by rendering it (npm run shot).
/**
 * The sea's shader (plan N1.3). The vertex stage places one tile of the grid (seaGrid.ts) and displaces it by the
 * simulated waves exactly as `seaAt` does (seaWaves.ts), sliding its vertices onto the coarser grid in the outer
 * part of its range and letting waves fade that the grid there cannot hold; the earth's curve then takes the far sea
 * down to a true horizon. The fragment stage is a plain stand-in until the sea material (N1.4): the sky's colour
 * reflected by angle, a sun glint, a dark body of water, and haze toward the horizon's colour.
 */
import { FrontSide, InstancedBufferAttribute, MeshBasicNodeMaterial, Vector3, Vector4 } from 'three/webgpu';
import {
  Fn, Loop, attribute, clamp, cos, cross, dot, exp, float, length, max, mix, mod, normalize, positionGeometry, pow, reflect,
  sin, smoothstep, uniform, uniformArray, varyingProperty, vec2, vec3,
} from 'three/tsl';
import { EARTH_RADIUS } from './earth';
import { SEA_LOD_RANGE, SEA_MAX_TILES, SEA_MORPH_START, SEA_TILE_CELLS, SEA_WAVE_FULL_CELLS, SEA_WAVE_GONE_CELLS } from './seaGrid';
import { SEA_DRAWN_WAVES, SEA_WAVE_STRIDE } from './seaWaves';

/** Numbers per tile in the tile list: corner x and z from the sea's origin (m), side (m), level (read as x, y, z, w). */
export const SEA_TILE_STRIDE = 4;
/** Where each number of a tile sits in its entry. */
export const TILE_AT = { x: 0, z: 1, size: 2, level: 3 } as const;
/** The name of the sea mesh's per-tile attribute. */
export const SEA_TILE_ATTRIBUTE = 'tile';

/** Water seen straight down: the colour of deep open sea under a white light (linear RGB). */
const DEEP = [0.004, 0.022, 0.035];
/** How much of the light falling on it the water's body sends back up (a stand-in for light scattered inside it). */
const BODY_LIGHT = 0.25;
/** Reflectance of water looked at straight down (Fresnel at normal incidence, n = 1.33). */
const FRESNEL_DOWN = 0.02;
/** Schlick's power of the Fresnel falloff. */
const FRESNEL_POWER = 5;
/** How sharp the sun's glint is (a Phong power), and how bright for the stand-in. */
const GLINT_POWER = 600;
const GLINT = 6;
/** How the reflected sky goes from the horizon's colour to the zenith's with the height of the reflected ray. */
const SKY_CURVE = 0.5;
/** A turn, rad. */
const TURN = 2 * Math.PI;

/** What the sea's shader reads, written each frame by SeaView. */
export const SEA_INPUTS = {
  /**
   * Per tile: corner x and z from the sea's origin, side, level (seaGrid.ts `seaTiles`). The sea's mesh carries it
   * as its geometry's `tile` attribute: three uploads a geometry's attributes when they change, not a node's.
   */
  tiles: new InstancedBufferAttribute(new Float32Array(SEA_MAX_TILES * SEA_TILE_STRIDE), SEA_TILE_STRIDE),
  /** Per wave: kx, kz, phase now at the origin, height; and reach, |k| (seaWaves.ts). */
  wave: uniformArray(Array.from({ length: SEA_DRAWN_WAVES }, () => new Vector4()), 'vec4'),
  more: uniformArray(Array.from({ length: SEA_DRAWN_WAVES }, () => new Vector4()), 'vec4'),
  count: uniform(0, 'int'),
  lift: uniform(0),
  /** The eye from the sea's origin: x and z, and its height over the calm sea (m). */
  eye: uniform(new Vector3()),
  /** Light: the direction toward the key light, its colour times strength, the sky's fill, the horizon's colour. */
  sunDir: uniform(new Vector3(0, 1, 0)),
  sun: uniform(new Vector3()),
  sky: uniform(new Vector3()),
  horizon: uniform(new Vector3()),
  /** How thick the air's haze is, per m. */
  haze: uniform(0),
};
if (SEA_WAVE_STRIDE !== SEA_TILE_STRIDE) throw new Error('the wave and tile lists are read as vec4');

export function makeSeaMaterial(): MeshBasicNodeMaterial {
  const I = SEA_INPUTS;
  const m = new MeshBasicNodeMaterial({ side: FrontSide, fog: false });
  m.name = 'sea';

  const vNormal = varyingProperty('vec3', 'vSeaNormal'), vToEye = varyingProperty('vec3', 'vSeaToEye');
  m.positionNode = Fn(() => {
    // --- Where this vertex lies on the calm sea, slid onto the coarser grid by how far it is from the eye.
    const tile = attribute(SEA_TILE_ATTRIBUTE, 'vec4');
    const index = positionGeometry.xz;
    const size = tile.z, cell = size.div(SEA_TILE_CELLS);
    const plain = tile.xy.add(index.mul(cell));
    const range = size.mul(SEA_LOD_RANGE);
    const away = length(vec3(plain.x.sub(I.eye.x), I.eye.y, plain.y.sub(I.eye.z)));
    const morph = clamp(away.sub(range.mul(SEA_MORPH_START)).div(range.mul(1 - SEA_MORPH_START)), 0, 1);
    const calm = tile.xy.add(index.sub(mod(index, 2).mul(morph)).mul(cell)).toVar();
    // The grid's cell here: a wave shorter than a few of these is faded out, not drawn as noise.
    const span = cell.mul(morph.add(1));

    // --- The waves, summed as seaAt sums them (src/sim/sea/sea.ts), each weighted by how well the grid holds it.
    const h = float(0).toVar(), sx = float(0).toVar(), sz = float(0).toVar(), hx = float(0).toVar(), hz = float(0).toVar();
    const xx = float(0).toVar(), xz = float(0).toVar(), zz = float(0).toVar();
    Loop({ start: 0, end: I.count, type: 'int', condition: '<' }, ({ i }) => {
      const w = I.wave.element(i), more = I.more.element(i);
      const fade = smoothstep(SEA_WAVE_GONE_CELLS, SEA_WAVE_FULL_CELLS, float(TURN).div(more.y.mul(span)));
      const th = w.x.mul(calm.x).add(w.y.mul(calm.y)).add(w.z);
      const sn = sin(th), cs = cos(th), a = w.w.mul(fade), q = more.x.mul(fade);
      const qs = q.mul(sn), qc = q.mul(cs), as = a.mul(sn);
      h.addAssign(a.mul(cs));
      sx.subAssign(w.x.mul(qs));
      sz.subAssign(w.y.mul(qs));
      hx.subAssign(w.x.mul(as));
      hz.subAssign(w.y.mul(as));
      xx.subAssign(w.x.mul(w.x).mul(qc));
      xz.subAssign(w.x.mul(w.y).mul(qc));
      zz.subAssign(w.y.mul(w.y).mul(qc));
    });
    const flat = vec2(calm.x.add(sx), calm.y.add(sz));
    const fromEye = flat.sub(I.eye.xz);
    // The earth's curve (earth.ts `earthDrop`): the sea falls away from the eye to a true horizon.
    const drop = dot(fromEye, fromEye).div(2 * EARTH_RADIUS);
    const placed = vec3(flat.x, h.add(I.lift).sub(drop), flat.y);
    // The surface's normal from its tangents along calm x and calm z, as `seaAt` gives it.
    const along = vec3(xx.add(1), hx, xz), across = vec3(xz, hz, zz.add(1));
    vNormal.assign(normalize(cross(across, along)));
    vToEye.assign(I.eye.sub(placed));
    return placed;
  })();

  // --- A stand-in look until the sea material (N1.4).
  m.colorNode = Fn(() => {
    const n = normalize(vNormal), v = normalize(vToEye), far = length(vToEye);
    const fresnel = float(FRESNEL_DOWN).add(float(1 - FRESNEL_DOWN).mul(pow(float(1).sub(max(dot(n, v), 0)), FRESNEL_POWER)));
    const r = reflect(v.negate(), n);
    const skySeen = mix(I.horizon, I.sky, pow(max(r.y, 0), SKY_CURVE));
    const body = vec3(...DEEP).mul(I.sun.mul(max(dot(n, I.sunDir), 0)).add(I.sky)).mul(BODY_LIGHT);
    const glint = I.sun.mul(pow(max(dot(r, I.sunDir), 0), GLINT_POWER)).mul(GLINT);
    const lit = mix(body, skySeen, fresnel).add(glint);
    return mix(lit, I.horizon, float(1).sub(exp(far.mul(I.haze).negate())));
  })();
  return m;
}
