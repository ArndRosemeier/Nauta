/**
 * The seats of a room in its waiting room (docs/design/scenarios.md, stage 6c): each ship a person commands with her
 * side and navy and who sits in her. The host chooses: a tap on a seat gives it to the next person in the room, and to
 * nobody after the last; a guest only sees them.
 */
import type { DuelSession } from '../net/duel';
import { makeButton } from './button';
import { make } from './dom';
import { NAVY_WORDS, SIDE_LETTERS } from './scenarioDialog';
import type { WordKey } from './words';

type Say = Readonly<Record<WordKey, string>>;

/** A person of the room in words: you, or "A player" and his place among the others. */
function personWords(s: DuelSession, id: number, say: Say): string {
  if (id === s.me) return say.commandYou;
  return `${say.commandPlayer} ${s.people.filter((p) => p.id !== s.me).findIndex((p) => p.id === id) + 1}`;
}

/** The seats as rows; `again` is called when the host has changed one (the session's own change also redraws the room). */
export function seatRows(s: DuelSession, say: Say, again: () => void): HTMLElement {
  const rows = make('div', 'room-seats');
  for (const seat of s.seatList) {
    const name = seat.captain === null ? say.seatFree : personWords(s, seat.captain, say);
    const what = [`${say.seatShip} ${seat.ship + 1}`, ...(seat.side === null ? [] : [`${say.side} ${SIDE_LETTERS[seat.side]}`]), ...(seat.navy ? [say[NAVY_WORDS[seat.navy]]] : [])].join(' · ');
    const row = make('div', 'room-seat');
    row.append(make('span', 'room-about', what));
    if (s.role === 'host') {
      const b = makeButton(name, () => {
        const ids = s.people.map((p) => p.id), at = seat.captain === null ? -1 : ids.indexOf(seat.captain);
        if (s.assign(seat.ship, at + 1 < ids.length ? ids[at + 1]! : null)) again();
      });
      b.className = 'nt-button';
      row.append(b);
    } else row.append(make('span', '', name));
    rows.append(row);
  }
  return rows;
}
