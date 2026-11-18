/**
 * Hand tool (implementation plan N7.1): one duel between computer captains, printed as a track every few seconds: the
 * range, each ship's heading to the wind, her way, where the other lies off her bow (the angle that decides whether
 * her broadside bears or she is raked), and the hits and guns fired so far. For looking at how the captains manoeuvre.
 *
 *   tsx tools/sim/track.ts <seed> <skill> <skill> [every seconds] [minutes]
 */
import { angleDiff } from '@futuremagic/core';
import { captainOrders, crewedBy } from '../../src/sim/captain/captain.ts';
import { duelStart } from '../../src/sim/start.ts';
import { startMatch, type SimState } from '../../src/sim/state.ts';
import { step } from '../../src/sim/step.ts';
import { apartOnWater, bearingTo, DEGREE, KNOT, STEPS_PER_SECOND } from '../../src/sim/units.ts';
import { meanWind } from '../../src/sim/wind.ts';
import type { Skill } from '../../src/sim/rules/captain.ts';

const [seedText = '1', a = 'seasoned', b = 'seasoned', everyText = '10', minutesText = '40'] = process.argv.slice(2);
const skills = [a, b] as Skill[], every = Number(everyText) * STEPS_PER_SECOND, until = Number(minutesText) * 60 * STEPS_PER_SECOND;
let s: SimState = startMatch(crewedBy(crewedBy(duelStart(Number(seedText)), 0, skills[0]!), 1, skills[1]!));
const fired = [0, 0], hits = [0, 0], raked = [0, 0], bearing = [0, 0], inArc = [0, 0], counts: Record<string, number>[] = [{}, {}];
const dump: { t: number; p: number[]; fired: number[]; hit: number[] }[] = [];
const hitList: { t: number; ship: number; raked: boolean; at: number[] }[] = [];
const BEARS = 30 * DEGREE;
const arc = (me: { heading: number }, line: number) => Math.abs(Math.abs(angleDiff(me.heading, line)) - Math.PI / 2) <= BEARS;
const deg = (x: number) => Math.round(x / DEGREE);
console.log('t(s) range | ship0: hdg-to-wind way off-bow fired hits | ship1: ...  | out masts');
while (!s.fight.end && s.tick < until) {
  const given = [...captainOrders(s, 0, skills[0]!), ...captainOrders(s, 1, skills[1]!)];
  const r = step(s, given);
  for (const o of given) counts[o.ship]![o.kind] = (counts[o.ship]![o.kind] ?? 0) + 1;
  if (process.env.ORDERS) for (const o of given) console.log(`${(s.tick / STEPS_PER_SECOND).toFixed(1).padStart(7)}s ship${o.ship}: ${JSON.stringify(o)}`);
  s = r.state;
  for (const e of r.events) {
    if (e.kind === 'fired') fired[e.ship]!++;
    if (e.kind === 'hit') {
      hits[e.ship]!++;
      const her = s.ships[e.ship]!.motion.pose, o = s.ships[1 - e.ship]!.motion.pose, a = Math.abs(angleDiff(her.heading, bearingTo(her, o)));
      const rk = a < 30 * DEGREE || a > 150 * DEGREE;
      if (rk) raked[e.ship]!++;
      hitList.push({ t: s.tick / STEPS_PER_SECOND, ship: e.ship, raked: rk, at: [her.x, her.z] });
    }
    else if (process.env.ORDERS && e.kind !== 'fired' && e.kind !== 'taken' && e.kind !== 'done' && e.kind !== 'answered') console.log(`${(s.tick / STEPS_PER_SECOND).toFixed(1).padStart(7)}s event ${JSON.stringify(e).slice(0, 140)}`);
  }
  if (process.env.DUMP && s.tick % 15 === 0) dump.push({ t: s.tick / STEPS_PER_SECOND, p: s.ships.flatMap((x) => [x.motion.pose.x, x.motion.pose.z, x.sailing.heading, x.sailing.ahead]), fired: [...fired], hit: [...hits] });
  { const [p, q] = s.ships.map((x) => x.motion.pose); const l01 = bearingTo(p!, q!), l10 = bearingTo(q!, p!); if (arc(p!, l01)) bearing[0]!++; if (arc(q!, l10)) bearing[1]!++; if (arc(q!, l10) && arc(p!, l01)) { inArc[0]!++; } }
  if (s.tick % every === 0) {
    const [p, q] = s.ships.map((x) => x.motion.pose), from = meanWind(s.wind, s.tick / STEPS_PER_SECOND).from;
    const cols = s.ships.map((x, i) => {
      const me = i === 0 ? p! : q!, her = i === 0 ? q! : p!;
      return `${String(deg(angleDiff(x.sailing.heading, from))).padStart(4)}° ${(x.sailing.ahead / KNOT).toFixed(1).padStart(4)}kn her@${String(deg(angleDiff(x.sailing.heading, bearingTo(me, her)))).padStart(4)}° f${String(fired[i]).padStart(3)} h${String(hits[i]).padStart(3)}`;
    });
    console.log(`${String(Math.round(s.tick / STEPS_PER_SECOND)).padStart(5)} ${String(Math.round(apartOnWater(p!, q!))).padStart(5)} | ${cols.join(' | ')} | ${s.ships.map((x) => x.damage.fallen.length).join('/')}`);
  }
}
console.log(`guns bear on her: ${bearing.map((b) => Math.round((100 * b) / s.tick)).join('% / ')}%  (both at once ${Math.round((100 * inArc[0]!) / s.tick)}%)  raked hits taken: ${raked.join(' / ')} of ${hits.join(' / ')}`);
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify({ rows: dump, hits: hitList }));
console.log('orders', JSON.stringify(counts));
console.log(s.fight.end ? `ended ${JSON.stringify(s.fight.end)}` : 'time up');
