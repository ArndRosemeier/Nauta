/**
 * The computer captain (pure, implementation plan N7.1): he commands one ship of a duel with the same orders a player
 * gives (orders.ts), from what a captain could see (sight.ts), at one of three levels of skill (rules/captain.ts).
 * The host of a match asks him each step (`captainOrders`) and steps his orders with the players'; most steps he gives
 * none. He keeps nothing of his own between steps: everything he goes by is in the match's state (what his ship has
 * been told is his memory), so any machine that hosts the match can ask him on, and the same state gives the same
 * orders on every machine.
 *
 * Every `look` seconds of his level he looks round and gives what the moment calls for, in this order:
 * - **Strike** when his first lieutenant says she is beaten (N6.4: "a computer captain strikes by that rule"), a better
 *   captain fighting on a little first (`strikeAfter`, N7.5a); he gives it again when asked back, `STRIKE_AGAIN` seconds later.
 * - **Her life:** hands to the pumps once the water passes his mark, a fire party at the first fire (a green captain
 *   waits until it has taken hold), the wreckage cut away, the carpenter's crew plugging first when holes let the sea in.
 * - **Her masts:** a spar in danger (its stays shot away, its mast aback; design thread 2026-11-18), he fills or bears
 *   away when his level sees to it (`saveMast`: the master at once, the green one late), and steers by nothing else that look.
 * - **The guns:** beat to quarters inside his range for it; round shot at her hull, grape at her deck close in, chain at
 *   her rigging (a master, when she holds the weather position, until he is at his range); open fire inside his range, cease beyond it, so the
 *   guns stand loaded for when it counts. A master holds the side for his word and gives it each step it is due, as
 *   her roll passes level.
 * - **Canvas:** plain sail to close from afar (seasoned and master), battle sail to fight.
 * - **The helm** (helm.ts): closing for the weather position and her stern, then a broadside laid on her at his range.
 *
 * An order she would refuse is not given (a dry run of `giveOrder` against what she has been told by then).
 */
import { giveOrder, goingAbout, type Order, type OrderMoment, type ShipOrders } from '../orders';
import { founderTonnes } from '../damage/flood';
import { ASK_AGAIN, BEATEN } from '../rules/end';
import type { AimName, ShotKind } from '../rules/guns';
import { angleDiff } from '@futuremagic/core';
import {
  BEAR_AWAY_MOST, CHAIN_INSIDE, HYSTERESIS, PLAIN_UP_TO, SKILL, STRIKE_AGAIN, WINDWARD_OF, WORD_READY, WORD_STILL, WORD_STILL_RATE,
  type Skill, type SkillRow,
} from '../rules/captain';
import type { MatchSetup, SimState } from '../state';
import { foeOf } from '../foes';
import { STEP_SECONDS, STEPS_PER_SECOND } from '../units';
import { helmOrder, stationOrder, wantedHeading } from './helm';
import { sideIndex, sightOf, type Sight } from './sight';

/** Where the gun captains lay for each shot: round at her hull, grape at her deck, chain at her rigging. */
const AIM_FOR: Readonly<Record<ShotKind, AimName>> = { round: 'hull', grape: 'deck', chain: 'rigging' };

/**
 * Whether this step is one of his looks round: every `look` seconds from the match's first step, the second ship's
 * captain half a look later (two captains of a level never act in the same step, so both cannot strike in it).
 */
function looks(state: SimState, ship: number, row: SkillRow): boolean {
  const every = Math.round(row.look * STEPS_PER_SECOND);
  return (state.tick + ship * Math.round(every / 2)) % every === 0;
}

/** Beaten (and fought on as long as his level does): strike the colours, and again when his first lieutenant asks back. */
function strikeOrder(sight: Sight, row: SkillRow, look: boolean): Order | null {
  const told = sight.own.told, ship = sight.ship;
  if (!sight.beaten || told.struck) return null;
  // Fighting on serves him only while she is not going down under him.
  if (sight.beatenFor < row.strikeAfter && sight.water < BEATEN.water * founderTonnes()) return null;
  const since = told.strike === null ? Infinity : sight.tick - told.strike;
  if (since === Math.round(STRIKE_AGAIN * STEPS_PER_SECOND)) return { kind: 'strike', ship };
  return look && since > Math.round(ASK_AGAIN * STEPS_PER_SECOND) ? { kind: 'strike', ship } : null;
}

/** The orders for her life his level calls for now. */
function lifeOrders(sight: Sight, row: SkillRow): Order[] {
  const told = sight.own.told, ship = sight.ship, out: Order[] = [];
  if (told.pumps === null && sight.water >= row.pumpsAt) out.push({ kind: 'pumps', ship });
  if (told.fires === null && sight.fire > 0 && sight.fire >= row.fireAt) out.push({ kind: 'fires', ship });
  if (told.wreckage === null && sight.wreckage > 0) out.push({ kind: 'wreckage', ship });
  if (row.plugAt > 0 && told.carpenter !== 'plug' && sight.leaks >= row.plugAt) out.push({ kind: 'plug', ship });
  return out;
}

/**
/** Whether a spar has been in danger long enough for his level to see to it (`saveMast`). */
const saving = (sight: Sight, row: SkillRow): boolean => sight.dangerFor !== null && sight.dangerFor >= row.saveMast;

/**
 * Saving a mast in danger: fill, if a mast is laid aback or she is hove
 * to; else bear away a point once the helm is over for the last (the points add up while she is still aback), no
 * farther than `BEAR_AWAY_MOST` off the wind.
 */
function saveOrder(sight: Sight): Order | null {
  const told = sight.own.told, ship = sight.ship, s = sight.own.sailing;
  if (told.hove || told.backed.some(Boolean) || s.backed.some(Boolean)) return { kind: 'fill', ship };
  // In stays her fore yards are kept aback to bring her round: she fills soonest by coming round.
  if (goingAbout(told) || s.steer.turn !== 0) return null;
  const helmOver = !told.acts.some((a) => a.kind === 'helm'), off = Math.abs(angleDiff(s.heading, sight.windFrom));
  return helmOver && off < BEAR_AWAY_MOST ? { kind: 'away', ship } : null;
}

/** The shot he wants loaded: grape close in, chain at a ship holding the weather position while closing to his range (a master), round shot else; each kept a fifth beyond its range. */
function wantedShot(sight: Sight, row: SkillRow, told: ShipOrders): ShotKind {
  const keep = (kind: ShotKind) => (told.shot === kind ? HYSTERESIS : 1);
  if (row.grape > 0 && sight.range < row.grape * keep('grape')) return 'grape';
  // Chain to cripple her as he closes, beyond his fighting range: inside it round shot does more (N7.5a).
  if (row.chain && sight.enemy.masts > 0 && -sight.windward > WINDWARD_OF && sight.range < CHAIN_INSIDE * keep('chain') && sight.range > row.range * HYSTERESIS / keep('chain')) return 'chain';
  return 'round';
}

/** The gunnery orders his level calls for now: quarters, the shot and where to lay it, how they fire. */
function gunOrders(sight: Sight, row: SkillRow): Order[] {
  const told = sight.own.told, ship = sight.ship, out: Order[] = [];
  if (!told.quarters && sight.range < row.quarters) out.push({ kind: 'quarters', ship });
  const shot = wantedShot(sight, row, told);
  if (told.shot !== shot) out.push({ kind: 'shot', ship, shot });
  const aim = shot === 'round' ? row.roundAt : AIM_FOR[shot];
  if (told.aim !== aim) out.push({ kind: 'aim', ship, at: aim });
  const inRange = sight.range < row.open * (told.firing === 'cease' ? 1 : HYSTERESIS);
  const mode = !inRange ? 'cease' : row.word ? 'hold' : 'bear';
  if ((told.quarters || out.length > 0) && told.firing !== mode) out.push({ kind: mode, ship });
  return out;
}

/**
 * Held for his word: whether a master gives it now, the side that bears on her ready enough and her roll passing her
 * steady heel this step (her guns are laid against it, so their bores pass the elevation wanted together), or lying
 * still within `WORD_STILL` of it.
 */
function wordDue(sight: Sight): boolean {
  const told = sight.own.told, pose = sight.own.motion.pose;
  if (!told.quarters || told.firing !== 'hold' || told.word) return false;
  const side = sight.sides[sideIndex(sight.off)];
  if (side.mounted === 0 || side.readyBearing < Math.ceil(WORD_READY * side.mounted)) return false;
  const off = pose.roll - sight.own.motion.heel, next = off + pose.rollRate * STEP_SECONDS;
  return off * next <= 0 || (Math.abs(pose.rollRate) < WORD_STILL_RATE && Math.abs(off) < WORD_STILL);
}

/** Plain sail to close from afar, battle sail to fight (his level's range, in winds up to `PLAIN_UP_TO`). */
function canvasOrder(sight: Sight, row: SkillRow): Order | null {
  const told = sight.own.told;
  if (told.hove || told.canvas === 'bare' || told.canvas === 'all') return null;
  const far = row.plainBeyond > 0 && sight.force <= PLAIN_UP_TO && sight.range > row.plainBeyond * (told.canvas === 'plain' ? 1 / HYSTERESIS : 1);
  const want = far ? 'plain' : 'battle';
  return told.canvas === want ? null : { kind: 'sail', ship: sight.ship, canvas: want };
}

/** The match's start with `ship`'s gun crews drilled as a computer captain at `skill` keeps them (rules/captain.ts `drill`). */
export function crewedBy(setup: MatchSetup, ship: number, skill: Skill): MatchSetup {
  return { ...setup, ships: setup.ships.map((s, i) => (i === ship ? { ...s, drill: SKILL[skill].drill } : s)) };
}

/**
 * The orders the computer captain of `ship`, at `skill`, gives in the step of `state` (most steps none). The duel's
 * enemy is the nearest ship of another side (foes.ts; in a duel the other ship), and he gives nothing with none or after the fight's end.
 */
export function captainOrders(state: SimState, ship: number, skill: Skill): Order[] {
  if (state.fight.end || !state.ships[ship] || foeOf(state.ships, ship) === null) return [];
  const row = SKILL[skill], own = state.ships[ship]!.told, look = looks(state, ship, row);
  const strikeDue = own.strike !== null && !own.struck;
  const word = row.word && own.quarters && own.firing === 'hold' && !own.word;
  if (!look && !strikeDue && !word) return [];
  const sight = sightOf(state, ship, skill);
  const wanted: (Order | null)[] = [strikeOrder(sight, row, look)];
  if (look) {
    wanted.push(...lifeOrders(sight, row), ...gunOrders(sight, row), canvasOrder(sight, row));
    // Saving a mast comes before where he wants her head: the helm waits until she is out of danger.
    if (saving(sight, row)) wanted.push(saveOrder(sight));
    else {
      const want = wantedHeading(sight, skill);
      wanted.push(helmOrder(sight, want.heading), stationOrder(sight, skill, want));
    }
  }
  if (word && wordDue(sight)) wanted.push({ kind: 'fire', ship });
  return taken(sight, wanted);
}

/** The orders she would take, in turn, each tried against what she has been told by the ones before it. */
function taken(sight: Sight, wanted: readonly (Order | null)[]): Order[] {
  const now: OrderMoment = { tick: sight.tick, wind: sight.wind, force: sight.force };
  let told = sight.own.told;
  const out: Order[] = [];
  for (const order of wanted) {
    if (!order) continue;
    const answer = giveOrder(told, sight.own.sailing, order, now);
    if (answer.refused) continue;
    told = answer.told;
    out.push(order);
  }
  return out;
}
