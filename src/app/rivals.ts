/**
 * The other ships of a match drawn (scenarios of up to eight ships, docs/design/scenarios.md, stage 5): each is a
 * `ShipView` of the same build seen from outside (her index drawn 1 and up; the captain's own is 0), with her fittings,
 * guns and hammocks, posed from the match, her sails and damage as her match has them. Which ship of the match each
 * stands for changes with the match (`assign`): the ships other than the captain's, in the match's order.
 *
 * The page builds them all behind the loading screen (a view shares her meshes' buffers with the others, so a view
 * costs the objects, not the geometry) and shows as many as the match has.
 */
import type { PerspectiveCamera, Vector3 } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { furnish } from '../sim/ship/furnish';
import { shipPlan } from '../sim/ship/plan';
import type { Damage } from '../sim/damage';
import type { SeaState } from '../sim/sea/sea';
import { apartOnWater } from '../sim/units';
import { windAt, type WindState } from '../sim/wind';
import { Furnishings } from '../render/ship/furnishings';
import { GunsView } from '../render/ship/gunsView';
import type { ShipBuild } from '../render/ship/ship';
import { ShipView } from '../render/ship/shipView';
import type { Fittings } from '../render/ship/fittings';
import { gunsSeen } from './gunsSeen';
import { HammocksStowed } from './hammocks';
import { sailsSeen } from './sailsSeen';
import { rudderAngle, sparAngles, type PageMatch } from './pageMatch';
import type { ShotsSeen } from './shotsSeen';

/** One other ship drawn: her view, her fittings and guns (null without the fittings pack) and her hammocks. */
export interface Rival {
  readonly view: ShipView;
  readonly fittings: Furnishings | null;
  readonly guns: GunsView | null;
  readonly hammocks: HammocksStowed;
  /** The match's ship she stands for now; -1: none (hidden). */
  ship: number;
}

/** What a frame gives the rivals. */
export interface RivalsFrame {
  readonly match: PageMatch;
  readonly sea: SeaState;
  readonly wind: WindState;
  readonly seaTime: number;
  readonly dt: number;
  /** Seconds of a jump of the browser checks the sails as drawn catch up with at once. */
  readonly jump: number;
  readonly camera: PerspectiveCamera;
  readonly light: Vector3;
  readonly shots: ShotsSeen | null;
  /** A stand-in damage for ship `i` (`?scars`), or null: the match's own. */
  readonly scarred: (i: number) => Damage | null;
}

export class Rivals {
  readonly all: readonly Rival[];

  private constructor(all: readonly Rival[]) {
    this.all = all;
  }

  /** Builds `count` other ships from `build`, their fittings and guns from `fittings` (null: none). */
  static make(build: ShipBuild, renderer: WebGPURenderer, fittings: Fittings | null, count: number): Rivals {
    return new Rivals(Array.from({ length: count }, (_, k) => {
      const index = k + 1, view = new ShipView(build, index);
      const furnished = fittings ? new Furnishings(renderer, fittings, furnish(shipPlan()), true) : null;
      if (furnished) for (const [zone, draws] of furnished.zones) view.addToZone(zone, draws.group);
      const guns = fittings ? new GunsView(renderer, fittings, furnish(shipPlan()), index) : null;
      if (guns) view.addMoving(guns.draws.group);
      return { view, fittings: furnished, guns, hammocks: new HammocksStowed(), ship: -1 };
    }));
  }

  /** The rivals' views, for adding to the stage. */
  get views(): ShipView[] {
    return this.all.map((r) => r.view);
  }

  /** Once the fittings and guns are built (the warm-up waits for them). */
  async built(): Promise<void> {
    for (const r of this.all) { await r.fittings?.ready(); await r.guns?.ready(); }
  }

  /** The group of every rival's fittings and guns, for the warm-up. */
  get groups() {
    return this.all.flatMap((r) => [...(r.fittings ? [...r.fittings.zones.values()].map((d) => d.group) : []), ...(r.guns ? [r.guns.draws.group] : [])]);
  }

  /** The rival that stands for ship `ship` of the match, or undefined. */
  of(ship: number): Rival | undefined {
    return this.all.find((r) => r.ship === ship);
  }

  /** The ships of the match other than the captain's (`mine`), in order, each given to a rival: the rest of the rivals are hidden. */
  assign(match: PageMatch): void {
    const others = match.state.ships.flatMap((_, i) => (i === match.ship ? [] : [i]));
    this.all.forEach((r, k) => {
      const ship = others[k] ?? -1;
      r.ship = ship;
      r.view.group.visible = ship >= 0;
    });
  }

  /** Once a frame: every rival drawn as her match has her (sails, yards, rudder, damage, fittings, guns). */
  drawAll(f: RivalsFrame): void {
    for (const r of this.all) {
      const v = r.view, i = r.ship;
      if (i < 0) continue;
      const state = f.match.state.ships[i];
      const hers = sailsSeen(f.match.state, i);
      v.sails.stand(hers?.standing ?? null, hers?.canvas ?? null);
      v.sails.blow(windAt(f.wind, v.drawn.x, v.drawn.z, f.seaTime));
      for (const [id, angle] of sparAngles(f.match.state, i)) v.setBrace(id, angle);
      v.setRudder(rudderAngle(f.match.state, i));
      v.showDamage(f.scarred(i) ?? state?.damage ?? null);
      if (f.jump > 0) v.sails.follow(f.jump);
      v.follow(f.sea, f.seaTime, f.dt, f.camera);
      r.fittings?.stowHammocks(r.hammocks.after(!!state?.told.quarters, f.dt + f.jump));
      r.fittings?.update(v.group, f.camera, f.light);
      r.guns?.moveGuns(v.group, f.camera, state && f.shots ? gunsSeen(state, (g) => f.shots!.firedFor(i, g, f.seaTime)) : null, f.seaTime);
    }
  }

  /** The nearest rival to `camera` that is drawn and within `within` m, or undefined: the ship the sun's shadow is shared with (shipView.ts `shade`). */
  nearest(camera: PerspectiveCamera, within = Infinity): Rival | undefined {
    let best: Rival | undefined, far = within;
    for (const r of this.all) {
      if (r.ship < 0 || !r.view.group.visible) continue;
      const d = apartOnWater(r.view.group.position, camera.position);
      if (d < far) { far = d; best = r; }
    }
    return best;
  }
}
