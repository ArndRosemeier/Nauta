/**
 * The slice's standpoints as a row of buttons at the foot of the screen (plan N2.0): a finger moves the eye to the
 * waist, behind a gun, up by the shrouds, below on the berth deck, into the main top, or into a boat alongside.
 */
import { STANDPOINTS, type Standpoint } from './standpoints';

/** Shows the row; `chosen` is called with the standpoint a button names, and the button stays marked. */
export function showStandpoints(first: Standpoint, chosen: (s: Standpoint) => void): void {
  const bar = document.createElement('nav');
  bar.id = 'standpoints';
  const buttons = STANDPOINTS.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.name;
    b.addEventListener('click', () => {
      for (const o of buttons) o.classList.toggle('on', o === b);
      chosen(s);
    });
    b.classList.toggle('on', s === first);
    bar.append(b);
    return b;
  });
  document.body.append(bar);
}
