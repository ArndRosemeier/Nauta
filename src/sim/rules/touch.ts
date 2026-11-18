/**
 * How two ships touch (implementation plan N3.12): the numbers of a collision between two hulls and of spars fouling
 * the other's rigging. Pure data, read by sim/ship/touch.ts. None is measured: each is a first proposal, judged by how
 * a collision looks and plays at G3.
 */

/**
 * Places along each side of her outline, as it is found at each height: about 1.3 m apart on her 32 m. Fine enough
 * that a corner of the other's outline cannot slip between two of them unseen (the stem's face is narrower than that
 * only at the very point, where the stem itself is a place).
 */
export const OUTLINE_PLACES = 24;

/**
 * The share of the closing speed that comes back as the two part again. Oak hulls crush and spring little, and the
 * water squeezed out between them takes up much of a blow, so a ship that runs aboard another mostly stays against
 * her and is pushed aside rather than bouncing off.
 */
export const RESTITUTION = 0.15;

/** How hard two sides grinding along each other hold each other back: wet oak on wet oak (0.25 to 0.5), the middle. */
export const FRICTION = 0.35;

/**
 * Each step the share of the overlap the two hulls are pushed out of each other by, and the overlap left alone, m. A
 * share below one and a little slack keep two ships lying together from shaking: what is left is pushed out over the
 * next steps, and the speeds already keep it from growing.
 */
export const PUSH_SHARE = 0.8;
export const PUSH_SLACK = 0.02;

/**
 * Passes over all the places they touch in one step: each pass shares the blow between them better (the blow at one
 * place changes the speed at the others). Four settle a ship lying along another at two or three places.
 */
export const TOUCH_PASSES = 4;

/**
 * A blow this hard (the hulls closing at this speed, m/s, half a knot) is a collision the captain hears and the damage
 * (N6.1) reads; slower, two hulls lying together only grind.
 */
export const STRUCK_SPEED = 0.25;

/** The places along a spar tried against the other's deck, m apart (a yardarm is about a metre). */
export const SPAR_STEP = 1;

/** The spars that foul the other's rigging when they reach over her deck: bowsprit, jib-boom and the yards (ship.md). */
export const FOULING_SPARS: readonly string[] = ['bowsprit', 'jib-boom', 'yard'];
