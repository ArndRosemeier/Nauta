/**
 * How the game is played, as the controls card shows it (Arnd 2026-11-18: "its not really clear how to play this"):
 * one list for a desk (the mouse and the keys) and one for a tablet (the fingers). Pure data: each row is what to
 * press, as the player's own keys (settings.ts) or a gesture in words, and what it does; the card on the page is
 * controlsCard.ts. The guided first match (N7.4) teaches the same, step by step.
 */
import type { KeyAction } from './settings';
import type { WordKey } from './words';

/** What to press: the player's keys for these actions, or a gesture of the mouse or the fingers in words. */
export type ControlHow = { readonly keys: readonly KeyAction[] } | { readonly gesture: WordKey };

export interface ControlRow {
  readonly how: readonly ControlHow[];
  readonly does: WordKey;
}

export interface ControlSection {
  readonly title: WordKey;
  readonly rows: readonly ControlRow[];
}

const keys = (...k: KeyAction[]): ControlHow => ({ keys: k });
const gesture = (g: WordKey): ControlHow => ({ gesture: g });

/** On a desk: the mouse free or taken (mouse.ts), the walking keys, the fan by click, the order keys most used. */
export const DESK_CONTROLS: readonly ControlSection[] = [
  {
    title: 'ctlLooking',
    rows: [
      { how: [gesture('ctlClickSea')], does: 'ctlTakeMouse' },
      { how: [gesture('ctlDrag')], does: 'ctlDragLook' },
      { how: [keys('forward', 'left', 'back', 'right')], does: 'ctlWalk' },
      { how: [keys('glass'), gesture('ctlWheel')], does: 'ctlGlass' },
    ],
  },
  {
    title: 'ctlOrders',
    rows: [
      { how: [gesture('ctlClickMan')], does: 'ctlFanDesk' },
      { how: [gesture('ctlRightClick')], does: 'ctlBack' },
      { how: [keys('fan')], does: 'keyFan' },
      { how: [keys('midshipman')], does: 'ctlMidshipman' },
      { how: [keys('steer')], does: 'keySteer' },
      { how: [keys('tack', 'wear')], does: 'ctlAbout' },
      { how: [keys('battle', 'plain', 'all', 'shorten')], does: 'ctlSail' },
      { how: [keys('quarters')], does: 'fanQuarters' },
      { how: [keys('fire')], does: 'keyFire' },
      { how: [keys('reports')], does: 'keyReports' },
      { how: [gesture('ctlEsc')], does: 'ctlPause' },
    ],
  },
];

/** On a tablet: the two thumbs, two fingers for the glass, a tap on a man, Fire! by the thumb, the rose. */
export const TOUCH_CONTROLS: readonly ControlSection[] = [
  {
    title: 'ctlLooking',
    rows: [
      { how: [gesture('ctlThumb')], does: 'ctlThumbHow' },
      { how: [gesture('ctlDragElse')], does: 'ctlLookTouch' },
      { how: [gesture('ctlSpread')], does: 'ctlGlassTouch' },
    ],
  },
  {
    title: 'ctlOrders',
    rows: [
      { how: [gesture('ctlTapMan')], does: 'ctlFanTouch' },
      { how: [gesture('ctlTapMid')], does: 'ctlMidTouch' },
      { how: [gesture('fire')], does: 'ctlFireTouch' },
      { how: [gesture('ctlRose')], does: 'ctlPause' },
    ],
  },
];
