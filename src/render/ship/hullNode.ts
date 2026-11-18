// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * Her hull for shaders (plan N2.4): the outside of her planking's half-breadth at any place along her and height,
 * and the deck at her side along her, read from a small texture made from her lines (sim/ship/hull.ts). The sea's cut
 * uses it to leave out the water inside her hull (seaCut.ts).
 */
import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu';
import { texture, vec2 } from 'three/tsl';
import { PLANKING } from '../../sim/rules/ships';
import { HULL_AFT, HULL_FORE, HULL_HIGH, HULL_LOW, hullHalfBreadth, sheer } from '../../sim/ship/hull';
import { shipY, shipZ } from '../../sim/ship/section';

/** The texture's texels along her and up, and the widest half-breadth and highest deck it holds, m. */
const ALONG = 256;
const UP = 128;
const MOST_HALF = 5;
/** A byte's largest value. */
const BYTE = 255;
/** Bytes per texel. */
const RGBA = 4;

const Z0 = shipZ(HULL_FORE), Z1 = shipZ(HULL_AFT), Y0 = shipY(HULL_LOW), Y1 = shipY(HULL_HIGH);

/** R: her half-breadth outside her planking over MOST_HALF; G: the deck at her side above her lowest point, over her whole height. */
function makeHullTexture(): DataTexture {
  const data = new Uint8Array(ALONG * UP * RGBA);
  for (let i = 0; i < ALONG; i++) {
    const along = -(Z0 + ((Z1 - Z0) * i) / (ALONG - 1));
    const deck = Math.round((BYTE * (shipY(sheer(along)) - Y0)) / (Y1 - Y0));
    for (let j = 0; j < UP; j++) {
      const h = HULL_LOW + ((HULL_HIGH - HULL_LOW) * j) / (UP - 1), half = hullHalfBreadth(along, h);
      const k = (j * ALONG + i) * RGBA;
      data[k] = half > 0 ? Math.min(BYTE, Math.round((BYTE * (half + PLANKING.side)) / MOST_HALF)) : 0;
      data[k + 1] = deck;
    }
  }
  const t = new DataTexture(data, ALONG, UP, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}
const HULL_TEXTURE = makeHullTexture();

/** Her half-breadth outside her planking (m) and the deck's height at her side (ship space), at ship-space z and y (float nodes). */
export function hullAt(z, y) {
  const t = texture(HULL_TEXTURE, vec2(z.sub(Z0).div(Z1 - Z0), y.sub(Y0).div(Y1 - Y0)));
  return { half: t.r.mul(MOST_HALF), deck: t.g.mul(Y1 - Y0).add(Y0) };
}
