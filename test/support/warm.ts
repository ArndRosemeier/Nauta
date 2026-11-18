/**
 * The match's lazily built tables made before a test is timed. The first step of a match builds the ship's plan, her
 * hull, the walk network and the sea (about 0.7 s); whichever test of a process came first paid for it and was timed
 * for it (docs/CHECKS.md: one test may take 2 s, and CI is slower than a desk). A file that steps a match imports this
 * first, so the cost lies in loading the file, once per process, and not in a test.
 */
import { startMatch } from '../../src/sim/state.ts';
import { step } from '../../src/sim/step.ts';
import { duelStart } from '../../src/sim/start.ts';
import { STEPS_PER_SECOND } from '../../src/sim/units.ts';
import { battery } from '../../src/sim/guns/guns.ts';
import { startCrew, stepCrew } from '../../src/sim/crew/crew.ts';
import { openShip } from '../../src/sim/crew/closures.ts';
import { startSail, startTold } from './crew.ts';
import { brigRoster } from '../../src/sim/crew/roster.ts';
import { musterCrew } from './muster.ts';

let s = startMatch(duelStart(1));
s = { ...s, ships: s.ships.map((x) => ({ ...x, crew: musterCrew() })) };
for (let k = 0; k < STEPS_PER_SECOND; k++) s = step(s).state;
battery();
brigRoster();
startCrew();
// The crew's routes: beating to quarters sends men over the whole walk network.
let crew = startCrew();
for (let tick = 0; tick < STEPS_PER_SECOND; tick++) crew = stepCrew(crew, startTold(), { tick, heel: 0, closures: openShip(), captain: null, canvas: startSail().canvas, quarters: 1 }).crew;
