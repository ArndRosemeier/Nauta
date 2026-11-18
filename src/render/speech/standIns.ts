/**
 * Faceless stand-ins (implementation plan N4.5): until the men who speak are drawn (the order fan's officers, N4.4;
 * the crew, N4.3), each voice of my ship speaks from where he would stand, so his bubble hangs over the right place on
 * her: the master at the wheel, the first lieutenant and the boatswain on the quarterdeck, the gunner in the waist,
 * the carpenter at the pumps, the surgeon in the cockpit, the lookout in the main top, the midshipman at the captain's
 * side. They have no mouth to move. A drawn man put in `Speakers` after them speaks instead.
 */
import { Vector3, type Camera, type Object3D } from 'three';
import { heightAt, routeNetwork } from '../../sim/crew/network';
import { placeSpot } from '../../sim/crew/roster';
import { BODY } from '../../sim/rules/ships';
import { shipY, shipZ } from '../../sim/ship/section';
import type { Point3, Speaker, Speakers, Voice } from '../../app/speech/speakers';

/** Where each voice stands: a crew place of the plan and a step from it (m forward, m to starboard), so two at one station stand apart. */
const POSTS: readonly (readonly [Voice, place: string, forward: number, starboard: number])[] = [
  ['master', 'station-wheel', 0, 0],
  ['first lieutenant', 'station-quarterdeck', 0, 0],
  ['boatswain', 'station-quarterdeck', 1.6, -0.8],
  ['gunner', 'station-waist', 0, 0],
  ['carpenter', 'station-pumps', 0, 0],
  ['surgeon', 'station-surgeon', 0, 0],
  ['lookout', 'top-main-s', 0, 0],
];
/** Over a standing man's soles, m: his height and a little over his hat. */
const OVER_SOLES = BODY.height + 0.35;
/** The midshipman at the captain's side: this far to his right and below his eyes, m. */
const BESIDE = 0.8;
const BELOW_EYES = 0.1;

/** A stand-in at a place in her ship space, drawn as nothing. */
function postedStandIn(voice: Voice, ship: number, frame: Object3D, at: Vector3): Speaker {
  const v = new Vector3();
  return {
    voice, ship,
    head(out: Point3): boolean {
      frame.updateWorldMatrix(true, false);
      v.copy(at);
      frame.localToWorld(v);
      out.x = v.x; out.y = v.y; out.z = v.z;
      return frame.visible;
    },
    say: () => {},
    hush: () => {},
  };
}

/** The midshipman beside the captain (the camera). */
function midshipmanStandIn(ship: number, camera: Camera): Speaker {
  const v = new Vector3();
  return {
    voice: 'midshipman', ship,
    head(out: Point3): boolean {
      camera.updateWorldMatrix(true, false);
      v.set(BESIDE, -BELOW_EYES, 0);
      camera.localToWorld(v);
      out.x = v.x; out.y = v.y; out.z = v.z;
      return true;
    },
    say: () => {},
    hush: () => {},
  };
}

/** Puts a stand-in for every voice of ship `ship` (drawn in `frame`, her ship space) into `speakers`, and returns them. */
export function standIns(speakers: Speakers, ship: number, frame: Object3D, camera: Camera): Speaker[] {
  const net = routeNetwork();
  const out = POSTS.map(([voice, place, forward, starboard]) => {
    const spot = placeSpot(place);
    const along = spot.along + forward, across = spot.across + starboard;
    const at = new Vector3(across, shipY(heightAt(net, spot)) + OVER_SOLES, shipZ(along));
    return postedStandIn(voice, ship, frame, at);
  });
  out.push(midshipmanStandIn(ship, camera));
  for (const s of out) speakers.put(s);
  return out;
}
