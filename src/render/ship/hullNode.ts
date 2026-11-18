// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * Her hull for shaders (plan N2.4): the outside of her planking's half-breadth at any place along her and height,
 * and the deck at her side along her, read from a small texture made from her lines (sim/ship/hull.ts). The sea's cut
 * uses it to leave out the water inside her hull (seaCut.ts).
 */
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RGFormat } from 'three/webgpu';
import { step, texture, vec2 } from 'three/tsl';
import { PLANKING } from '../../sim/rules/ships';
import { filtered } from '../dataTexture';
import { HULL_AFT, HULL_FORE, HULL_HIGH, HULL_LOW, hullHalfBreadth, sheer } from '../../sim/ship/hull';
import { shipY, shipZ } from '../../sim/ship/section';

/**
 * The texture's texels along her and up (about 7 cm by 6 cm), in half floats (millimetres at her breadth): the sea's
 * cut must meet her planking within half its thickness, or a sliver of water shows inside or of nothing outside.
 */
const ALONG = 512;
const UP = 128;
/** Numbers per texel. */
const RG = 2;

const Z0 = shipZ(HULL_FORE), Z1 = shipZ(HULL_AFT), Y0 = shipY(HULL_LOW), Y1 = shipY(HULL_HIGH);

/** R: her half-breadth outside her planking, m; G: the deck's height at her side, ship space. */
function makeHullTexture(): DataTexture {
  const data = new Uint16Array(ALONG * UP * RG);
  for (let i = 0; i < ALONG; i++) {
    const along = -(Z0 + ((Z1 - Z0) * i) / (ALONG - 1));
    const deck = DataUtils.toHalfFloat(shipY(sheer(along)));
    for (let j = 0; j < UP; j++) {
      const h = HULL_LOW + ((HULL_HIGH - HULL_LOW) * j) / (UP - 1), half = hullHalfBreadth(along, h);
      const k = (j * ALONG + i) * RG;
      data[k] = DataUtils.toHalfFloat(half > 0 ? half + PLANKING.side : 0);
      data[k + 1] = deck;
    }
  }
  const t = new DataTexture(data, ALONG, UP, RGFormat, HalfFloatType);
  return filtered(t, LinearFilter);
}
const HULL_TEXTURE = makeHullTexture();

/**
 * Her half-breadth outside her planking (m) and the deck's height at her side (ship space), at ship-space z and y
 * (float nodes). Read at its one level, so compute passes can read it too (the wake's, wakeMap.ts).
 */
export function hullAt(z, y) {
  const u = z.sub(Z0).div(Z1 - Z0), t = texture(HULL_TEXTURE, vec2(u, y.sub(Y0).div(Y1 - Y0))).level(0);
  // Beyond her ends she has no breadth: the texture's edge, clamped, would carry her transom's breadth on along her
  // axis for ever (a point far astern, high in her frame as she pitches, would be cut out of the sea).
  return { half: t.r.mul(step(0, u)).mul(step(u, 1)), deck: t.g };
}
