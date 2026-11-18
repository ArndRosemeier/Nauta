/**
 * One ship's damage drawn (plan N6.5): her marks (damageMarks.ts) written into her block of the damage map and of the
 * sails' hole map as the simulation's damage changes, and whether her outside and her sails must draw with the holed
 * kinds (what is cut away left out). The ship's view asks once a frame (`ShipView.showDamage`); nothing is written
 * while her damage stands as it was.
 */
import type { Damage } from '../../sim/damage';
import { rigPlan } from '../../sim/ship/rig';
import { shipPlan } from '../../sim/ship/plan';
import { HULL_BLOCK_ROWS, HullMarks, SailMarks } from './damageMarks';
import { DAMAGE_TEXTURE } from './shipMaterials';
import { SAIL_DAMAGE_TEXTURE } from './sailMaterial';
import { SAIL_ATLAS_SIZE, SAIL_TEXEL, sailAtlas } from './sailGrid';
import { sailForms } from './sailForm';

/** What changed this frame: whether her outside and her sails now need the holed kinds. */
export interface DamageShown {
  readonly hullCut: boolean;
  readonly sailsCut: boolean;
}

export class DamageView {
  private readonly hull: HullMarks;
  private readonly sails: SailMarks;
  private shown: DamageShown = { hullCut: false, sailsCut: false };

  /** `ship`: her block in the shared maps (0 the captain's own, 1 the other's). */
  constructor(private readonly ship: number) {
    this.hull = new HullMarks({ data: DAMAGE_TEXTURE.image.data as Uint8Array, width: DAMAGE_TEXTURE.image.width, row: ship * HULL_BLOCK_ROWS, rows: HULL_BLOCK_ROWS });
    const forms = sailForms(rigPlan(shipPlan()));
    this.sails = new SailMarks(
      { data: SAIL_DAMAGE_TEXTURE.image.data as Uint8Array, width: SAIL_ATLAS_SIZE, row: ship * SAIL_ATLAS_SIZE, rows: SAIL_ATLAS_SIZE, texel: SAIL_TEXEL },
      sailAtlas(forms),
    );
  }

  /** Her marks brought up to `d` (null: as nothing struck her), her sails `gone` over the side cut out; what she now needs drawn holed. */
  marksFor(d: Damage | null, gone: readonly boolean[] = []): DamageShown {
    if (!d) return this.shown;
    if (this.hull.bringUpTo(d)) {
      DAMAGE_TEXTURE.addLayerUpdate(this.ship);
      DAMAGE_TEXTURE.needsUpdate = true;
      this.shown = { ...this.shown, hullCut: this.shown.hullCut || this.hull.cut };
    }
    if (this.sails.bringUpTo(d.rent, gone)) {
      SAIL_DAMAGE_TEXTURE.addLayerUpdate(this.ship);
      SAIL_DAMAGE_TEXTURE.needsUpdate = true;
      this.shown = { ...this.shown, sailsCut: true };
    }
    return this.shown;
  }
}
