/**
 * The brig furnished (pure, plan N2.6): every fitting that stands on her, set out on her plan (plan.ts) from the
 * table in rules/fittings.ts. The guns behind their ports with their gear between them, the wheel, binnacle and
 * capstan, the pumps, the stove under its chimney, the bell, the boats on the skids and the gig at the stern
 * davits, the anchors at the catheads, hammock nettings along the rails, buckets, the bitts and fife rails, mess
 * tables, cots and chests, and the casks in the hold. One list, ship space; the drawing
 * (render/ship/furnishings.ts) draws each as an instance in her moving frame.
 *
 * Drawn with her and not here: the carronades with their breechings (render/ship/ship.ts), her lanterns (rooms.ts),
 * and the rig's small parts, the pin rails and every belaying pin, deadeyes, blocks and coils (rig.ts, N3.6).
 */
import {
  BUCKETS, CASK, CASK_CLEAR, CATTED, COCKPIT_CHESTS, COT_CABINS, COT_OFF_SIDE, FACING, GUN_GEAR,
  FIFE_MODELS, GUN_INBOARD, HOLD_BARRELS, HOLD_BUTTS, HOLD_PASSAGE, ON_CENTRELINE, BELFRY, MESS_TABLES, MODEL, NETTINGS, PUMPS, SKIDS,
  GEAR_CLEAR, SOLID, STERN_DAVITS, STOW_GAP, TABLE_OFF_SIDE, TABLE_TOP, type ModelName,
} from '../rules/fittings';
import { BERTH_HEADROOM, BODY, BREAKS, HOLD_FLOOR, LEAST_PASSAGE, LOAD_WATERLINE, RAILS, WAIST_DRIFT, type Level } from '../rules/ships';
import { HULL_AFT, hullHalfBreadth, sideTop, weatherDeck } from './hull';
import { berthDeck, floorsUnder, insideBreadth, rectCentre, spacesById, type Obstacle, type Overhead, type Rect, type ShipPlan } from './plan';
import { shipY, shipZ } from './section';

/** One fitting on her: its model, where its origin stands (ship space), and how it is turned. */
export interface Furnishing {
  readonly model: ModelName;
  /** Which level it is on, so a view can leave out what cannot be seen. */
  readonly level: Level;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * How it is turned, applied in this order: `spin` about its own up axis (rad), then `lean` about her athwart axis,
   * +x (rad; + lifts its forward end, tipping its top aft), then `turn` about her up axis (rad; 0: the model's front
   * aft, rules/fittings.ts FACING). Most fittings only turn.
   */
  readonly spin: number;
  readonly lean: number;
  readonly turn: number;
}

/** A quarter turn, rad. */
const QUARTER = Math.PI / 2;
/** The steps her inside is checked at up a cask's side. */
const CASK_SIDE_CHECKS = 8;
/** A length this small is none, m. */
const EPSILON = 1e-9;

/** One fitting at a place on her plan: m forward of the mainmast, m across, height above her base. */
function at(model: ModelName, level: Level, along: number, across: number, height: number, turn = 0, lean = 0, spin = 0): Furnishing {
  return { model, level, x: across, y: shipY(height), z: shipZ(along), spin, lean, turn };
}

/** Whether a tub standing by her side (its width along her) would stand where a man stands to work: a crew place on deck. */
function crowdsAPlace(plan: ShipPlan, model: ModelName, along: number, across: number): boolean {
  const [part] = SOLID[model], reach = LEAST_PASSAGE / 2 + GEAR_CLEAR;
  const halfAlong = part!.x[1] + reach, halfAcross = part!.z[1] + reach;
  return plan.places.some((p) => p.space === 'deck' && Math.abs(p.along - along) < halfAlong && Math.abs(p.across - across) < halfAcross);
}

/**
 * The long sixes behind their ports (not at the chase port, where one is shifted only to fire ahead; the carronades
 * are drawn with her, render/ship/ship.ts), and each gun's gear in the gap forward of it.
 */
function guns(plan: ShipPlan, out: Furnishing[]): void {
  const pinRails = RAILS.filter((r) => r.kind === 'pin rail');
  const underPins = (along: number) => pinRails.some((r) => along >= r.aft && along <= r.fore);
  for (const g of plan.guns) {
    if (g.chase) continue;
    const s = g.side, wall = s > 0 ? g.footprint.starboard : -g.footprint.port;
    const x = s * (wall - GUN_INBOARD[g.gun]);
    if (g.gun !== 'carronade') out.push(at(MODEL.long6, 'weather', g.along, x, weatherDeck(g.along, x), s * QUARTER));
    // The gear goes in the gap forward to the next gun on this side, if there is one.
    const next = plan.guns.filter((o) => o.side === s && !o.chase && o.along > g.along).sort((a, b) => a.along - b.along)[0];
    if (!next) continue;
    const gear = (model: ModelName, along: number, off: number, up: number, turn: number) => {
      const inside = insideBreadth(along, weatherDeck(along, wall) + up);
      const across = s * (inside - off);
      out.push(at(model, 'weather', along, across, weatherDeck(along, across) + up, turn));
    };
    const a = g.along, port = plan.guns.indexOf(g);
    gear(MODEL.garland, a + GUN_GEAR.garland.along, GUN_GEAR.garland.off, 0, QUARTER);
    const tub = port % 2 === 0 ? MODEL.spongeTub : MODEL.matchTub, byTheSide = a + GUN_GEAR.tub.along;
    if (crowdsAPlace(plan, tub, byTheSide, s * (insideBreadth(byTheSide, weatherDeck(byTheSide, wall)) - GUN_GEAR.tub.off))) {
      gear(tub, (a + next.along) / 2, GUN_GEAR.tub.inboard, 0, 0);
    } else gear(tub, byTheSide, GUN_GEAR.tub.off, 0, s * QUARTER);
    if (underPins(a + GUN_GEAR.rammer.along)) {
      gear(MODEL.rammer, a + GUN_GEAR.rammer.along, GUN_GEAR.onDeck.rammer, 0, 0);
      gear(MODEL.handspike, a + GUN_GEAR.handspike.along, GUN_GEAR.onDeck.handspike, 0, 0);
    } else {
      gear(MODEL.rammer, a + GUN_GEAR.rammer.along, GUN_GEAR.rammer.off, GUN_GEAR.rammer.up, 0);
      gear(MODEL.handspike, a + GUN_GEAR.handspike.along, GUN_GEAR.handspike.off, GUN_GEAR.handspike.up, 0);
    }
  }
}

/** On the weather deck: the helm, capstan, pumps, chimney, bell, the boats on the skids, the stern davits with the gig, the anchors, nettings and buckets. */
function weatherFittings(out: Furnishing[]): void {
  const onDeck = (model: ModelName, along: number, across: number, turn = 0) => out.push(at(model, 'weather', along, across, weatherDeck(along, across), turn));
  onDeck(MODEL.wheel, ON_CENTRELINE.wheel, 0, FACING.forward);
  onDeck(MODEL.binnacle, ON_CENTRELINE.binnacle, 0, FACING.forward);
  onDeck(MODEL.capstan, ON_CENTRELINE.capstan, 0);
  for (const s of [1, -1]) onDeck(MODEL.pump, PUMPS.along, s * PUMPS.across, s > 0 ? 0 : Math.PI);
  onDeck(MODEL.chimney, ON_CENTRELINE.stove, 0, FACING.forward);
  onDeck(MODEL.bell, BELFRY.along, BELFRY.across, FACING.starboard);
  // The boats on the gallows' chocks: the cutter to port, the jolly boat to starboard, their bows forward.
  for (const g of SKIDS.gallows) onDeck(MODEL.gallows, g, 0);
  const skid = Math.max(...SKIDS.gallows.map((g) => weatherDeck(g, 0))) + SKIDS.chocks;
  out.push(at(MODEL.cutter, 'weather', SKIDS.boats, -SKIDS.across, skid, FACING.forward));
  out.push(at(MODEL.jolly, 'weather', SKIDS.boats, SKIDS.across, skid, FACING.forward));
  // The stern davits on the taffrail, the gig hanging athwart her from them.
  const taffrail = HULL_AFT + STERN_DAVITS.inFromEnd, rail = sideTop(taffrail);
  out.push(at(MODEL.davits, 'weather', taffrail, 0, rail, FACING.aft));
  out.push(at(MODEL.gig, 'weather', taffrail - STERN_DAVITS.reach, 0, rail - STERN_DAVITS.gigBelow, FACING.starboard));
  // The bowers catted and fished: the ring at the cathead, the shank laid aft and down along her bow and swung in
  // to follow her side, the stock upright against her, the inner arm on the bill board. The model stands on its
  // crown, so its origin is the crown: found from the ring by walking down the shank (twice, as her side curves).
  const ringAlong = CATTED.along, ringUp = sideTop(ringAlong) - CATTED.below;
  const ringOut = hullHalfBreadth(ringAlong, sideTop(ringAlong)) + CATTED.out;
  const run = Math.sin(CATTED.lean) * CATTED.height, crownUp = ringUp - Math.cos(CATTED.lean) * CATTED.height;
  let swing = 0;
  for (let k = 0; k < 2; k++) {
    const crownAlong = ringAlong - run * Math.cos(swing);
    swing = Math.asin(Math.min(1, (hullHalfBreadth(crownAlong, crownUp) + CATTED.out - ringOut) / run));
  }
  const crownAlong = ringAlong - run * Math.cos(swing), crownOut = ringOut + run * Math.sin(swing);
  for (const s of [1, -1]) out.push(at(MODEL.anchor, 'weather', crownAlong, s * crownOut, crownUp, s * swing, -CATTED.lean));
  // Hammock nettings along her rails, tile by tile, each turned and leaned to follow the rail: aft of the waist, in
  // it, and forward of it, as many whole tiles as each run holds, in its middle; none where her side comes down at a break.
  const runs = [[NETTINGS.aft, BREAKS.quarterdeck], [BREAKS.quarterdeck + WAIST_DRIFT, BREAKS.forecastle - WAIST_DRIFT], [BREAKS.forecastle, NETTINGS.fore]] as const;
  for (const [from, to] of runs) for (let n = Math.floor((to - from) / NETTINGS.tile + EPSILON), k = 0; k < n; k++) {
    const a0 = (from + to - n * NETTINGS.tile) / 2 + k * NETTINGS.tile, a1 = a0 + NETTINGS.tile, mid = (a0 + a1) / 2, tile = NETTINGS.tile;
    for (const s of [1, -1]) {
      const x0 = insideBreadth(a0, sideTop(a0)), x1 = insideBreadth(a1, sideTop(a1));
      if (x0 <= 0 || x1 <= 0) continue;
      const turn = s * Math.atan2(x1 - x0, tile), lean = Math.atan2(sideTop(a1) - sideTop(a0), tile);
      out.push(at(MODEL.netting, 'weather', mid, s * insideBreadth(mid, sideTop(mid)), sideTop(mid), -turn, lean));
    }
  }
  for (const s of [1, -1]) for (const x of BUCKETS.across) onDeck(MODEL.bucket, BUCKETS.along, s * x);
  // The bitts and the fore fife rail, each rail's front face on the plan's fife rail, toward the men who haul there.
  for (const r of RAILS) if (r.kind === 'fife rail') onDeck(FIFE_MODELS[r.id]!, r.at, 0, r.toward > 0 ? FACING.forward : FACING.aft);
}

/** On the berth deck: the stove, the mess tables, cots and chests in the cabins, and chests in the cockpit. */
function berthFittings(plan: ShipPlan, out: Furnishing[]): void {
  const spaces = spacesById(plan);
  const stove = ON_CENTRELINE.stove;
  out.push(at(MODEL.stove, 'berth', stove, 0, berthDeck(stove), FACING.aft));
  // Mess tables athwart her, from her side toward the middle, both sides: the outboard end a hand off her side, so no
  // corner is left between the table and her side that a man could get into but not out of.
  const halfTable = SOLID[MODEL.table][0]!.z[1];
  for (const along of MESS_TABLES.along) {
    for (const s of [1, -1]) {
      const floor = berthDeck(along), outer = insideBreadth(along, floor + TABLE_TOP) - TABLE_OFF_SIDE;
      out.push(at(MODEL.table, 'berth', along, s * Math.max(outer - halfTable, MESS_TABLES.inner + halfTable), floor, FACING.starboard));
    }
  }
  // A cot along her side in each cabin, a chest under it.
  for (const id of COT_CABINS) {
    const sp = spaces.get(id)!, along = (sp.aft + sp.fore) / 2, floor = berthDeck(along);
    const s = sp.starboard > 0 ? 1 : -1;
    const across = s * (insideBreadth(along, floor + BERTH_HEADROOM / 2) - COT_OFF_SIDE);
    out.push(at(MODEL.cot, 'berth', along, across, floor));
    out.push(at(MODEL.chest, 'berth', along, across, floor, FACING.starboard));
  }
  const cockpit = spaces.get('cockpit')!;
  for (const along of COCKPIT_CHESTS) {
    const floor = berthDeck(along), across = Math.max(cockpit.port, -insideBreadth(along, floor) + COT_OFF_SIDE);
    out.push(at(MODEL.chest, 'berth', along, across, floor, FACING.port));
  }
}

/**
 * Whether a cask of `radius` whose middle is at `across` and whose foot is at `floor` keeps clear of her inside at
 * `along`: standing, as wide as its radius all the way up; `lying` on its bilge, a circle `high` across.
 */
function caskFits(along: number, across: number, floor: number, radius: number, high: number, lying = false): boolean {
  for (let k = 0; k <= CASK_SIDE_CHECKS; k++) {
    const h = floor + (high * k) / CASK_SIDE_CHECKS, up = h - floor - radius;
    const wide = lying ? Math.sqrt(Math.max(0, radius * radius - up * up)) : radius;
    if (Math.abs(across) + wide + CASK_CLEAR > insideBreadth(along, h)) return false;
  }
  return true;
}

/**
 * What the casks keep out of in the hold: what is in the way there (a ladder's foot, the pump well, the masts), not
 * the casks themselves, and the floor a man crosses from a door in the hold to where he stands to use it.
 */
function holdWays(plan: ShipPlan): Rect[] {
  const c = HOLD_PASSAGE.clear, spaces = spacesById(plan), reach = HOLD_PASSAGE.half + c;
  const inWay = plan.obstacles.filter((o) => o.level === 'hold' && !o.fitting).map((r) => ({ aft: r.aft - c, fore: r.fore + c, port: r.port - c, starboard: r.starboard + c }));
  const doors = plan.ways.filter((w) => w.kind === 'door' && [w.from, w.to].some((e) => spaces.get(e.space)!.level === 'hold'));
  return [...inWay, ...doors.map((w) => ({
    aft: Math.min(w.from.along, w.to.along) - reach, fore: Math.max(w.from.along, w.to.along) + reach,
    port: Math.min(w.from.across, w.to.across) - reach, starboard: Math.max(w.from.across, w.to.across) + reach,
  }))];
}

/** Whether a cask's plan, from `aft` to `fore` and `across` ± `radius`, keeps out of the ways. */
function clearOfWays(ways: readonly Rect[], aft: number, fore: number, across: number, radius: number): boolean {
  if (Math.abs(across) - radius < HOLD_PASSAGE.half) return false;
  return !ways.some((w) => fore > w.aft && aft < w.fore && across + radius > w.port && across - radius < w.starboard);
}

/**
 * In the hold, either side of the passage down her middle: water butts lying fore and aft in tiers on the shingle
 * of the main hold, each upper butt in the hollow of two below; barrels standing in the fore hold.
 */
function holdFittings(plan: ShipPlan, out: Furnishing[]): void {
  const ways = holdWays(plan);
  const b = CASK.butt, d = 2 * b.radius, half = HOLD_BUTTS.across / 2;
  const rise = Math.sqrt(d * d - half * half);
  for (let room = HOLD_BUTTS.aft; room + HOLD_BUTTS.along <= HOLD_BUTTS.fore + EPSILON; room += HOLD_BUTTS.along) {
    const along = room + HOLD_BUTTS.along / 2, aft = along - b.length / 2, fore = along + b.length / 2;
    for (const s of [1, -1]) {
      // The lowest tier outward from the passage, then each tier in the hollows of the one below where both are there.
      let below: number[] = [];
      for (let k = 0; ; k++) {
        const x = s * (HOLD_PASSAGE.half + b.radius + k * HOLD_BUTTS.across);
        if (!caskFits(along, x, HOLD_FLOOR, b.radius, d, true)) break;
        if (clearOfWays(ways, aft, fore, x, b.radius)) below.push(x);
      }
      for (let tier = 0; tier < HOLD_BUTTS.tiers && below.length; tier++) {
        const floor = HOLD_FLOOR + tier * rise;
        // Lying on her bilge, her head forward and her bung up: the model's bung (+x) spun aft, then its height leaned forward.
        for (const x of below) out.push(at(MODEL.butt, 'hold', aft, x, floor + b.radius, 0, -QUARTER, -QUARTER));
        below = below.slice(1).filter((x, k) => Math.abs(x - below[k]!) < HOLD_BUTTS.across + EPSILON)
          .map((x) => x - s * half).filter((x) => caskFits(along, x, floor + rise, b.radius, d, true) && clearOfWays(ways, aft, fore, x, b.radius));
      }
    }
  }
  const r = CASK.barrel;
  for (let along = HOLD_BARRELS.aft; along <= HOLD_BARRELS.fore; along += HOLD_BARRELS.pitch) {
    for (const s of [1, -1]) {
      for (let k = 0; ; k++) {
        const x = s * (HOLD_PASSAGE.half + r.radius + k * HOLD_BARRELS.pitch);
        if (!caskFits(along, x, HOLD_FLOOR, r.radius, r.length)) break;
        if (clearOfWays(ways, along - r.radius, along + r.radius, x, r.radius)) out.push(at(MODEL.barrel, 'hold', along, x, HOLD_FLOOR));
      }
    }
  }
}

/** Every fitting on her, from her plan. */
export function furnish(plan: ShipPlan): Furnishing[] {
  const out: Furnishing[] = [];
  guns(plan, out);
  weatherFittings(out);
  berthFittings(plan, out);
  holdFittings(plan, out);
  return out;
}

// --- What is in the way (ship.md "Fittings are solid too") ------------------------------------------------------

/** What the fittings put in a man's way: the room of those that stand in it, and of those over his head. */
export interface FittingSolids {
  /** Walked round: from the floor up into a man's way (above BODY.stepUp, under the least headroom). */
  readonly standing: readonly Obstacle[];
  /** Stooped under (or clear over a man's head): wholly above the least headroom over the floor. */
  readonly overhead: readonly Overhead[];
}

/** A point of a model's frame where a fitting stands: turned by its spin, lean and turn (Furnishing), in ship space. */
function placed(f: Furnishing, x: number, y: number, z: number): [number, number, number] {
  const cs = Math.cos(f.spin), ss = Math.sin(f.spin);
  const x1 = x * cs + z * ss, z1 = -x * ss + z * cs;
  const cl = Math.cos(f.lean), sl = Math.sin(f.lean);
  const y2 = y * cl - z1 * sl, z2 = y * sl + z1 * cl;
  const ct = Math.cos(f.turn), st = Math.sin(f.turn);
  return [f.x + x1 * ct + z2 * st, f.y + y2, f.z - x1 * st + z2 * ct];
}

/** A part's room where it stands: its oblong on her plan and its foot and top, m above her base. */
function partRoom(f: Furnishing, p: (typeof SOLID)[ModelName][number]): Rect & { low: number; high: number } {
  let aft = Infinity, fore = -Infinity, port = Infinity, starboard = -Infinity, low = Infinity, high = -Infinity;
  for (const x of p.x) for (const y of p.y) for (const z of p.z) {
    const [sx, sy, sz] = placed(f, x, y, z), along = -sz, h = sy + LOAD_WATERLINE;
    aft = Math.min(aft, along); fore = Math.max(fore, along); port = Math.min(port, sx); starboard = Math.max(starboard, sx);
    low = Math.min(low, h); high = Math.max(high, h);
  }
  return { aft, fore, port, starboard, low, high };
}

/**
 * The casks of the hold, stowed in tiers and rows that touch, as a few oblongs: each stow's whole room, out to her
 * side (what is between the outer casks and her curving side is filled with smaller casks and dunnage; no one goes there).
 */
function stows(plan: ShipPlan, casks: readonly (Rect & { level: Level })[]): (Rect & { level: Level })[] {
  const out = casks.map((c) => ({ ...c }));
  const near = (a: Rect, b: Rect) => a.aft <= b.fore + STOW_GAP && b.aft <= a.fore + STOW_GAP && a.port <= b.starboard + STOW_GAP && b.port <= a.starboard + STOW_GAP;
  for (let joined = true; joined;) {
    joined = false;
    for (let i = 0; i < out.length && !joined; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!, b = out[j]!;
        if (a.level !== b.level || !near(a, b)) continue;
        out[i] = { level: a.level, aft: Math.min(a.aft, b.aft), fore: Math.max(a.fore, b.fore), port: Math.min(a.port, b.port), starboard: Math.max(a.starboard, b.starboard) };
        out.splice(j, 1);
        joined = true;
        break;
      }
    }
  }
  return out.map((c) => {
    const beside = plan.spaces.filter((s) => s.level === c.level && s.aft < c.fore && s.fore > c.aft);
    return c.port > 0 ? { ...c, starboard: Math.max(c.starboard, ...beside.map((s) => s.starboard)) } : { ...c, port: Math.min(c.port, ...beside.map((s) => s.port)) };
  });
}

/** Fittings standing on her rail, whose room her side already bounds: in no one's way beyond it. */
const ON_RAIL: ReadonlySet<ModelName> = new Set([MODEL.netting]);

/** The casks, whose stows are given whole. */
const CASKS = new Set<ModelName>([MODEL.butt, MODEL.barrel]);

/**
 * What every fitting on her puts in a man's way, from the one placement list (furnish) and each model's room
 * (rules/fittings.ts SOLID), by its height over the floor it stands over: under BODY.stepUp it is stepped over and
 * left out; wholly over the least headroom it is overhead; otherwise it stands in the way. Fittings hung outboard of
 * every space (the anchors, the gig) are in no one's way, nor are those standing on her rail (the hammock nettings),
 * where her side already bounds the walk. The plan's obstacles and overheads (plan.ts) are these.
 */
export function fittingSolids(plan: ShipPlan, fittings: readonly Furnishing[] = furnish(plan)): FittingSolids {
  const standing: Obstacle[] = [], overhead: Overhead[] = [], casks: (Rect & { level: Level })[] = [];
  fittings.forEach((f, i) => {
    if (ON_RAIL.has(f.model)) return;
    SOLID[f.model].forEach((p, k) => {
      const r = partRoom(f, p), { along, across } = rectCentre(r);
      const under = floorsUnder(plan, along, across).find((u) => u.space.level === f.level);
      if (!under) return;
      const floor = under.floor, rect = { aft: r.aft, fore: r.fore, port: r.port, starboard: r.starboard };
      if (r.high - floor < BODY.stepUp) return;
      const id = SOLID[f.model].length > 1 ? `${f.model}-${i}-${k}` : `${f.model}-${i}`;
      if (r.low - floor >= BODY.leastHeadroom) overhead.push({ id, level: f.level, ...rect, underside: r.low });
      else if (CASKS.has(f.model)) casks.push({ level: f.level, ...rect });
      else standing.push({ id, level: f.level, ...rect, fitting: true });
    });
  });
  stows(plan, casks).forEach((c, i) => standing.push({ id: `stow-${c.level}-${i}`, ...c, fitting: true }));
  return { standing, overhead };
}
