/**
 * Test bodies for the light rig (`?rig`, plan N1.5): three matte balls of known albedo floating ahead of the
 * captain, so the light on canvas, oak and tar can be judged through the day and next to MasterWorld's.
 */
import { BufferAttribute, Group, Mesh, SphereGeometry } from 'three/webgpu';
import { TEST_BODY } from './materials';

/** The balls' albedos (linear): sailcloth, weathered oak, tar. */
const ALBEDOS: readonly (readonly [number, number, number])[] = [[0.6, 0.57, 0.5], [0.22, 0.16, 0.1], [0.04, 0.035, 0.03]];
/** A ball's radius and the space between their centres, metres. */
const RADIUS = 0.5;
const SPACING = 1.4;
/** How far ahead of the captain they float and how far below the eye, metres. */
const AHEAD = 6;
const BELOW_EYE = 0.8;
/** The sphere's segments around and from pole to pole. */
const SEGMENTS_AROUND = 48;
const SEGMENTS_UP = 24;

/** The balls in a row across the view along `yaw` (the look's turn, radians) from an eye at `eye` metres. */
export function makeTestBodies(yaw: number, eye: number): Group {
  const group = new Group();
  group.name = 'test bodies';
  const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
  ALBEDOS.forEach((albedo, i) => {
    const g = new SphereGeometry(RADIUS, SEGMENTS_AROUND, SEGMENTS_UP);
    // Only the kind's attributes (position, normal, colour): another would change the shader's key, and it would be
    // built anew instead of the warmed one.
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count, colour = new Float32Array(n * albedo.length);
    for (let v = 0; v < n; v++) colour.set(albedo, v * albedo.length);
    g.setAttribute('color', new BufferAttribute(colour, albedo.length));
    const ball = new Mesh(g, TEST_BODY.make());
    const across = (i - (ALBEDOS.length - 1) / 2) * SPACING;
    ball.position.set(fwdX * AHEAD - fwdZ * across, eye - BELOW_EYE, fwdZ * AHEAD + fwdX * across);
    group.add(ball);
  });
  return group;
}
