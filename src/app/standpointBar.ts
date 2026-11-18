/**
 * Her standpoints as a row of buttons at the foot of the screen (plan N2.0, N2.4): a finger moves the eye to the
 * quarterdeck, the waist, behind a gun, the bow, the main top, the berth deck, the captain's cabin, the hold, a boat
 * alongside, or out to 50 m and 500 m off.
 */
import { STANDPOINTS, type Standpoint } from './standpoints';
import { makeButton } from './button';

/** Shows the row; `chosen` is called with the standpoint a button names, and the button stays marked. */
export function showStandpoints(first: Standpoint, chosen: (s: Standpoint) => void): void {
  const bar = document.createElement('nav');
  bar.id = 'standpoints';
  const buttons = STANDPOINTS.map((s) => {
    const b = makeButton(s.name, () => {
      for (const o of buttons) o.classList.toggle('on', o === b);
      chosen(s);
    });
    b.classList.toggle('on', s === first);
    bar.append(b);
    return b;
  });
  document.body.append(bar);
}
