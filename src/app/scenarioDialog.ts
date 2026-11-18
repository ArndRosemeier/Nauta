/**
 * The scenario's part of the setup dialog (docs/design/scenarios.md, stage 1): a way to start from (the old Fight
 * alone, a room for a friend, Watch a battle, a fleet action), the ships with the side, the navy and the captain of each,
 * the navy of each side, and a line saying what cannot be run yet. It edits a `Scenario` (sim/scenario.ts) and hands
 * every new one to `change`; the menu draws the match's other terms (wind, hour, length, seed) under it. No state of its
 * own: the menu draws it again with the scenario it gets back.
 */
import {
  addShip, MOST_SHIPS, LEAST_SHIPS, MOST_SIDES, NAVIES, navyOfShip, PRESET_NAMES, PRESETS, removeShip, setCommand, setNavy, setSide, setSideNavy, sidesIn,
  type Command, type Limit, type PresetName, type Scenario,
} from '../sim/scenario';
import { SKILLS, type Offered } from '../sim/rules/captain';
import { make } from './dom';
import { makeButton } from './button';
import { choice, choiceRow, row } from './settingsPanel';
import type { WordKey } from './words';

type Say = Readonly<Record<WordKey, string>>;

const PRESET_WORDS: Readonly<Record<PresetName, WordKey>> = { alone: 'presetAlone', room: 'presetRoom', watch: 'presetWatch', fleets: 'presetFleets' };
const SKILL_WORDS: Readonly<Record<Offered, WordKey>> = { green: 'skillGreen', seasoned: 'skillSeasoned', master: 'skillMaster' };
export const NAVY_WORDS: Readonly<Record<(typeof NAVIES)[number], WordKey>> = { british: 'british', french: 'french' };
/** What each limit says (scenario.ts `limitOf`). */
export const LIMIT_WORDS: Readonly<Record<Limit, WordKey>> = { 'one side': 'limitOneSide', 'too close': 'limitTooClose', 'host ship': 'limitHostShip' };

/** The letters the sides go by. */
export const SIDE_LETTERS = ['A', 'B', 'C', 'D'];
/** A captain's choices in the order of their buttons: you, a player who joins, a computer at each skill. */
const COMMANDS: readonly Command[] = [{ kind: 'you' }, { kind: 'player' }, ...SKILLS.map((skill): Command => ({ kind: 'computer', skill }))];

const commandIndex = (c: Command): number => (c.kind === 'you' ? 0 : c.kind === 'player' ? 1 : 2 + SKILLS.indexOf(c.skill));

/** The scenario's parts for the dialog (the ways to start from; the ships and the sides): each edit calls `change` with the new scenario. */
export function scenarioParts(say: Say, sc: Scenario, change: (to: Scenario) => void): { presets: HTMLElement; ships: HTMLElement } {
  const commandWord = (c: Command) => (c.kind === 'you' ? say.commandYou : c.kind === 'player' ? say.commandPlayer : say[SKILL_WORDS[c.skill]]);
  const same = PRESET_NAMES.findIndex((n) => JSON.stringify(PRESETS[n]) === JSON.stringify(sc));
  const presets = choiceRow(say.startFrom, null, PRESET_NAMES.map((n) => say[PRESET_WORDS[n]]), same, (i) => change(PRESETS[PRESET_NAMES[i]!]!));
  presets.classList.add('scn-presets');

  const ships = make('div', 'scn-ships');
  sc.ships.forEach((s, i) => {
    const card = make('div', `scn-ship side-${s.side}`);
    const no = make('span', 'scn-no', String(i + 1));
    const side = choice(say.side, SIDE_LETTERS.slice(0, MOST_SIDES), s.side, (k) => change(setSide(sc, i, k)));
    side.classList.add('scn-side');
    const navy = choice(say.yourNavy, NAVIES.map((n) => say[NAVY_WORDS[n]]), NAVIES.indexOf(navyOfShip(sc, i)), (k) => change(setNavy(sc, i, NAVIES[k]!)));
    const command = choice(say.captain, COMMANDS.map(commandWord), commandIndex(s.command), (k) => change(setCommand(sc, i, COMMANDS[k]!)));
    command.classList.add('scn-command');
    const out = makeButton('✕', () => change(removeShip(sc, i)));
    out.className = 'nt-close scn-out';
    out.setAttribute('aria-label', say.removeShip);
    out.disabled = sc.ships.length <= LEAST_SHIPS;
    card.append(no, side, navy, out, command);
    ships.append(card);
  });
  const add = makeButton(say.addShip, () => change(addShip(sc)));
  add.className = 'nt-link scn-add';
  add.disabled = sc.ships.length >= MOST_SHIPS;

  // The navy each side wears, for the sides that have a ship.
  const sides = sidesIn(sc).sort((a, b) => a - b).map((side) => {
    const count = sc.ships.filter((s) => s.side === side).length;
    return row(`${say.side} ${SIDE_LETTERS[side]}`, `${count} ${count === 1 ? say.shipOne : say.shipMany}`, choice(say.yourNavy, NAVIES.map((n) => say[NAVY_WORDS[n]]), NAVIES.indexOf(sc.sideNavies[side]!), (k) => change(setSideNavy(sc, side, NAVIES[k]!))));
  });
  const list = make('div', 'scn-list');
  list.append(make('div', 'nt-section', say.theShips), ships, add, make('div', 'nt-section', say.theSides), ...sides);
  return { presets, ships: list };
}
