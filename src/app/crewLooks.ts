/**
 * How the crews look (plans N4.3 "The crowd's make-up", N2.7, N4.4): every man's dress by his rank and navy (Actors'
 * navy wardrobe, X2), his build, hat, hair, skin and the colours of his slops, all from his seed, the same on every
 * machine. Pure: it gives the crowd figures' kinds (Actors' `CrowdKindSpec`, X5) and, for the same man drawn as a full
 * character near the captain, the `CharacterPatch` that makes him look the same, so the hand-over between the two is
 * a fade and nothing changes but the detail.
 *
 * The PACK_ lists are what `npm run packs` (tools/crew/pack.mjs) copies out of the Actors pack: keep them to plain
 * quoted ids.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { CharacterCatalog, CharacterPatch, CrowdKindSpec } from '@actors/generator';
import type { Man } from '../sim/crew/roster';
import { NAVIES, otherNavy, type Navy } from './terms';

export type { Navy } from './terms';

/** Every garment of the navy wardrobe's presets both navies wear (Actors' navy-outfits.ts), the captain's included. */
export const PACK_GARMENTS = [
  'briefs', 'high-socks', 'socks', 'buckled-shoes', 'navy-shirt', 'navy-slops', 'navy-slops-striped', 'navy-jacket', 'navy-waistcoat',
  'navy-breeches', 'navy-gaiters', 'navy-tailcoat', 'navy-coatee', 'navy-lapels', 'navy-cuffs', 'navy-stock', 'navy-crossbelts',
  'navy-round-hat', 'navy-knit-cap', 'navy-bicorne', 'navy-bicorne-lace', 'navy-cockade', 'navy-cockade-tricolour', 'navy-collar',
  'navy-neckerchief', 'navy-buttons-officer', 'navy-buttons-single', 'navy-buttons-jacket', 'navy-epaulettes', 'navy-epaulette',
];
/** Hairstyles: men's short ones (the pack's queue reads as a woman's ponytail from the deck). */
export const PACK_HAIR = ['hair-short02', 'hair-short03', 'hair-short-messy', 'hair-short-curls', 'hair-swept-back'];
/** Clips: standing by, working, walking and running, falling (crewMotion.ts gives each man his). */
export const PACK_CLIPS = [
  'idle', 'arms folded', 'talk', 'nod', 'lean on rail', 'call from rail', 'interact', 'pick up', 'push', 'crouch', 'repair (kneeling)',
  'chop wood', 'walk', 'walk carrying', 'jog', 'death', 'eat or drink', 'pistol idle', 'pistol aim up', 'shake head',
];
/**
 * Motion capture (the CMU library, in place: no walking away) for the work the pack's own clips lack, kept in the cut
 * pack (tools/crew/pack.mjs cuts the library to these): the rammer's stroke (pushing a broom), the sponge (washing a
 * window), hauling a tackle (coiling a rope, hand over hand).
 */
export const PACK_MOCAP = ['cmu 80_19', 'cmu 79_44', 'cmu 62_21'];

/** Where the build serves the cut pack (`npm run packs` fills public/packs), under the page's base. */
export const PACK = 'packs/human/manifest.json';
/** Actors' catalogue cut to what the pack holds (the PACK_ lists): every character the page loads takes it. */
export const packCatalog = (c: CharacterCatalog): CharacterCatalog => ({
  ...c,
  garments: c.garments.filter((g) => PACK_GARMENTS.includes(g.id)),
  hair: c.hair.filter((h) => PACK_HAIR.includes(h.id)),
  animations: c.animations.filter((a) => PACK_CLIPS.includes(a.id) || PACK_MOCAP.includes(a.id)),
});

/**
 * A ship's navy in the duel: the first ship's is `first` (the room's host's or the player's alone, as the match setup
 * chose; British unless chosen), the other ship's the other navy.
 */
export const navyOf = (ship: number, first: Navy = 'british'): Navy => (ship === 0 ? first : otherNavy(first));

/**
 * What a man's dress says he is: the captain; a sea officer (lieutenants, master, the civil officers); a midshipman; a
 * warrant or petty officer in his own good clothes (gunner, boatswain, carpenter and their mates); a marine; a seaman
 * in slops with his jacket on; a hand stripped for work; a boy (a hand, bareheaded, slight).
 */
export type Dress = 'captain' | 'officer' | 'midshipman' | 'warrant' | 'marine' | 'seaman' | 'hand';

/** The builds every kind is baked on (Actors' body sliders; age in years): grown men, lean and strong from work. */
export const BUILDS = {
  slight: { gender: 1, ageYears: 22, muscle: 0.58, weight: 0.3, height: 0.4, proportions: 0.5 },
  middling: { gender: 1, ageYears: 30, muscle: 0.66, weight: 0.44, height: 0.5, proportions: 0.5 },
  broad: { gender: 1, ageYears: 36, muscle: 0.78, weight: 0.6, height: 0.45, proportions: 0.45 },
  tall: { gender: 1, ageYears: 27, muscle: 0.62, weight: 0.4, height: 0.66, proportions: 0.55 },
} as const;
export type Build = keyof typeof BUILDS;

/**
 * Each dress: the navy wardrobe's preset in each navy, the builds it comes in (seamen and hands four, marines and
 * officers two: their dress and place tell them apart already), and what each man of it may wear or not (`options`):
 * hats a seaman wears by his seed, and hairstyles. A hat that belongs to the dress (an officer's cocked hat, a
 * marine's) is in the preset and always worn.
 */
interface DressRow {
  readonly presets: Readonly<Record<Navy, string>>;
  readonly builds: readonly Build[];
  /** Hats worn or not by seed (taken out of the preset into `options`). */
  readonly hats: readonly string[];
  readonly hair: readonly string[];
  /** Garments recoloured per man, in up to three groups (Actors' `tints`). */
  readonly tints: readonly (readonly string[])[];
}
/** A seaman's shirt: the garment, and its place among the tint groups of his dress (stained by the violence setting, app/violence.ts). */
export const SHIRT_GARMENT = 'navy-shirt';
export const SHIRT_GROUP = 1;
const SEAMEN_HAIR = ['hair-short02', 'hair-short-messy', 'hair-short-curls'];
const SLOPS_TINTS = [['navy-slops', 'navy-slops-striped'], [SHIRT_GARMENT], ['navy-neckerchief']];
export const DRESSES: Readonly<Record<Dress, DressRow>> = {
  captain: { presets: { british: 'navy-rn-captain', french: 'navy-fr-captain' }, builds: ['middling'], hats: [], hair: ['hair-swept-back'], tints: [] },
  officer: { presets: { british: 'navy-rn-lieutenant', french: 'navy-fr-officer' }, builds: ['middling', 'tall'], hats: [], hair: ['hair-swept-back'], tints: [] },
  midshipman: { presets: { british: 'navy-rn-midshipman', french: 'navy-fr-aspirant' }, builds: ['slight'], hats: [], hair: ['hair-short03'], tints: [] },
  warrant: { presets: { british: 'navy-rn-boatswain', french: 'navy-fr-boatswain' }, builds: ['middling', 'broad'], hats: [], hair: ['hair-short02'], tints: [] },
  marine: { presets: { british: 'navy-rn-marine', french: 'navy-fr-marine' }, builds: ['middling', 'tall'], hats: [], hair: ['hair-short03'], tints: [] },
  seaman: { presets: { british: 'navy-rn-seaman', french: 'navy-fr-seaman' }, builds: ['slight', 'middling', 'broad', 'tall'], hats: ['navy-round-hat', 'navy-knit-cap'], hair: SEAMEN_HAIR, tints: SLOPS_TINTS },
  hand: { presets: { british: 'navy-rn-hand', french: 'navy-fr-hand' }, builds: ['slight', 'middling', 'broad', 'tall'], hats: ['navy-round-hat', 'navy-knit-cap'], hair: SEAMEN_HAIR, tints: SLOPS_TINTS },
};

/** Ranks by the dress they wear (sim/rules/crew.ts ROSTER); a rank not named goes in slops, its men by seed with their jackets on or stripped. */
const DRESS_OF_RANK: Readonly<Record<string, Dress>> = {
  captain: 'captain',
  'first lieutenant': 'officer', 'second lieutenant': 'officer', master: 'officer', "master's mate": 'officer', surgeon: 'officer',
  "surgeon's mate": 'officer', purser: 'officer', "captain's clerk": 'officer',
  midshipman: 'midshipman',
  gunner: 'warrant', boatswain: 'warrant', carpenter: 'warrant', "boatswain's mate": 'warrant', "gunner's mate": 'warrant',
  'sergeant of marines': 'marine', 'corporal of marines': 'marine', drummer: 'marine', 'private of marines': 'marine',
  boy: 'hand',
};
/** Boys: the slight build, bareheaded. */
const BOY = 'boy';

/** Shares among the men in slops: in his jacket (the rest stripped for work), with a hat on. */
const SHARE = { jacket: 0.4, hat: 0.55 } as const;
/** How much taller or shorter than his build a man stands (a scale on the figure), ±. */
const HEIGHT_SPREAD = 0.04;
/** Skin tones (Actors' procedural skin, 0 light .. 1 dark): mostly European crews, some from everywhere a ship called. */
const SKIN = { light: [0.04, 0.42], dark: [0.55, 0.9], darkShare: 0.2 } as const;
/** Hair colours, sRGB. */
const HAIR_COLOURS = ['#2a1d14', '#3b2417', '#4a3020', '#6a4a2a', '#8a6a3a', '#b08a50', '#1c1814', '#7a3a1e', '#8a8580'];
/** The colours each tint group of a seaman's dress is drawn from, by navy (sRGB): slops (striped for the French), shirts, neckerchiefs. */
const TINTS: Readonly<Record<Navy, readonly (readonly string[])[]>> = {
  british: [['#ddd6c3', '#d8d2c2', '#c9c1ab', '#a9a08a', '#3b4660'], ['#e8e2d4', '#cfc7b4', '#b9ad94', '#d9d0bd', '#6f2a24'], ['#151515', '#2a2a3a', '#18181b', '#6a1a1a']],
  french: [['#e9e4d6', '#e0d8c6', '#d6cfbc', '#c8bfa8'], ['#ece6d8', '#c8bfa8', '#d2c8b2', '#e0d6c0', '#2c3d66'], ['#151515', '#a52a2a', '#2a2a3a', '#d8d0c0']],
};
/** The seed every crew's looks come from (with the ship and the man's place in the roster). */
const LOOKS_SEED = 1805;

/** The kind of figure for a dress, navy and build, by id. */
export const kindId = (navy: Navy, dress: Dress, build: Build): string => `${navy}-${dress}-${build}`;

/** How one man looks: his kind (a dress, navy and build) and, within it, what is his own. */
export interface Figure {
  readonly kind: string;
  readonly dress: Dress;
  readonly navy: Navy;
  readonly build: Build;
  /** Of his kind's options, the hat and hair he shows. */
  readonly show: readonly string[];
  /** Actors' procedural skin tone, 0..1. */
  readonly skinTone: number;
  readonly hairColour: string;
  /** His dress's tint groups' colours, sRGB (empty for a dress worn as issued). */
  readonly tints: readonly string[];
  /** His height against his build's (1: the same). */
  readonly scale: number;
}

/**
 * What man `man` (his place in the roster) of ship `ship` looks like in `navy`'s dress (the match setup chooses the
 * navies, `navyOf`): his navy changes his dress and its colours, never his build, hair, skin or height.
 */
export function figureOf(ship: number, man: number, m: Pick<Man, 'rank'>, navy: Navy = navyOf(ship)): Figure {
  const r = new Rng(deriveSeed(LOOKS_SEED, ship, man));
  const named = DRESS_OF_RANK[m.rank], dress: Dress = named ?? (r.chance(SHARE.jacket) ? 'seaman' : 'hand');
  const row = DRESSES[dress], boy = m.rank === BOY;
  const build = boy ? 'slight' : r.pick(row.builds);
  const hat = hatOf(dress, navy), show = [r.pick(row.hair), ...(hat && !boy && r.chance(SHARE.hat) ? [hat] : [])];
  const skinTone = r.chance(SKIN.darkShare) ? r.range(...SKIN.dark) : r.range(...SKIN.light);
  const tints = row.tints.map((_, i) => r.pick(TINTS[navy][i]!));
  return { kind: kindId(navy, dress, build), dress, navy, build, show, skinTone, hairColour: r.pick(HAIR_COLOURS), tints, scale: 1 + r.range(-HEIGHT_SPREAD, HEIGHT_SPREAD) };
}

/** The hat a man of this dress wears or not by his seed: the one his navy's preset has (a round hat, a red bonnet), if any. */
function hatOf(dress: Dress, navy: Navy): string | null {
  return DRESSES[dress].hats.find((h) => HATS_OF[navy].includes(h)) ?? null;
}
const HATS_OF: Readonly<Record<Navy, readonly string[]>> = { british: ['navy-round-hat'], french: ['navy-knit-cap'] };

/** A preset of the catalogue; throws for one the catalogue does not have. */
function preset(catalog: Pick<CharacterCatalog, 'outfits'>, id: string): { garments: readonly string[]; colors: Readonly<Record<string, string>> } {
  const p = catalog.outfits.find((o) => o.id === id);
  if (!p) throw new Error(`no outfit ${id} in the Actors catalogue`);
  return { garments: p.garments, colors: p.colors ?? {} };
}

/**
 * The crowd figures' kinds of both crews (Actors' `buildCrowdFigures`): one for every dress, navy and build some man
 * of `rosters` wears, with room for as many men as wear it whichever navy the first ship is given (the match setup
 * may change it after the crews are built). Hats a seaman may leave off are options, not dress.
 */
export function crowdKinds(catalog: Pick<CharacterCatalog, 'outfits'>, rosters: readonly (readonly Pick<Man, 'rank'>[])[]): CrowdKindSpec[] {
  const counts = new Map<string, { figure: Figure; count: number }>();
  for (const first of NAVIES) {
    const here = new Map<string, { figure: Figure; count: number }>();
    rosters.forEach((roster, ship) => roster.forEach((m, i) => {
      const f = figureOf(ship, i, m, navyOf(ship, first)), c = here.get(f.kind);
      if (c) c.count++; else here.set(f.kind, { figure: f, count: 1 });
    }));
    for (const [id, c] of here) if ((counts.get(id)?.count ?? 0) < c.count) counts.set(id, c);
  }
  return [...counts.entries()].map(([id, { figure, count }]) => {
    const row = DRESSES[figure.dress], p = preset(catalog, row.presets[figure.navy]), hat = hatOf(figure.dress, figure.navy);
    const look: CharacterPatch = { outfit: p.garments.filter((g) => g !== hat), garmentColors: { ...p.colors }, skin: 'procedural' };
    const tints = row.tints.map((group) => group.filter((g) => p.garments.includes(g)));
    return { id, build: figure.build, look, options: [...(hat ? [hat] : []), ...row.hair], tints: tints.length ? tints : undefined, max: count };
  });
}

/**
 * The same man as a full character (the near pool's): his build's body, his kind's dress with the hat he shows, his
 * hair, skin and tints, so that he looks as his crowd figure does. Navies of 1800 shaved: no beard.
 */
export function fullLook(catalog: Pick<CharacterCatalog, 'outfits' | 'hair'>, f: Figure): CharacterPatch {
  const row = DRESSES[f.dress], p = preset(catalog, row.presets[f.navy]), hat = hatOf(f.dress, f.navy);
  const hairs = new Set(catalog.hair.map((h) => h.id));
  const colours: Record<string, string> = { ...p.colors };
  row.tints.forEach((group, i) => { for (const g of group) if (p.garments.includes(g)) colours[g] = f.tints[i]!; });
  const outfit = [...p.garments.filter((g) => g !== hat), ...(hat && f.show.includes(hat) ? [hat] : [])];
  return {
    body: { ...BUILDS[f.build] }, skin: 'procedural', skinTone: f.skinTone,
    hair: f.show.find((s) => hairs.has(s)) ?? null, hairColor: f.hairColour, beard: 'none', outfit, garmentColors: colours,
  };
}

/** What a man wears and his build, as a key: two men alike in it differ only in colours (the near pool dresses one as the other cheaply). */
export const wearing = (f: Figure): string => `${f.kind}|${f.show.join(',')}`;

/** The seed of the captain's own looks: the player's body, the same on every machine. */
const CAPTAIN_SEED = 1805;
/**
 * Pieces of it his own body leaves off: the hat. His head is drawn at a thousandth of its size, but the bicorne keeps
 * its size round his eyes, so looking down he would see only its inside.
 */
export const CAPTAIN_UNSEEN = ['navy-bicorne', 'navy-bicorne-lace', 'navy-cockade', 'navy-cockade-tricolour'];
/**
 * The captain as he sees himself (plan N2.7): a man of the middling build from his seed, dressed as a post captain of
 * her navy, less what he cannot see of himself. Every piece of the preset must be in PACK_GARMENTS.
 */
export function captainLook(catalog: Pick<CharacterCatalog, 'outfits' | 'hair'>, navy: Navy = 'british'): CharacterPatch {
  const dress = DRESSES.captain.presets[navy], p = preset(catalog, dress);
  const missing = p.garments.filter((g) => !PACK_GARMENTS.includes(g));
  if (missing.length) throw new Error(`${dress} needs ${missing.join(', ')} in PACK_GARMENTS`);
  const r = new Rng(deriveSeed(CAPTAIN_SEED, 'captain'));
  const me: Figure = { kind: kindId(navy, 'captain', 'middling'), dress: 'captain', navy, build: 'middling', show: ['hair-swept-back'], skinTone: r.range(...SKIN.light), hairColour: r.pick(HAIR_COLOURS), tints: [], scale: 1 };
  const look = fullLook(catalog, me);
  return { ...look, outfit: look.outfit!.filter((g) => !CAPTAIN_UNSEEN.includes(g)) };
}
