/**
 * How the trial's men look (plan N4.0): each man's body, hair and dress from his seed, his rank and his navy. Pure: it
 * gives Actors' `CharacterPatch`, which the crew view applies.
 *
 * The dress is a stand-in from Actors 0.35.0's wardrobe (shirts, trousers, a cap; most seamen barefoot), in CC0
 * garments only. Actors' navy wardrobe (X2, 0.36.0: presets `navy-rn-*` and `navy-fr-*`) replaces it once released:
 * then `DRESS` names the presets and their pieces, and the PACK_ lists below take them in; nothing else changes.
 *
 * The PACK_ lists are what `npm run packs` (tools/crew/pack.mjs) copies out of the Actors pack: keep them to plain
 * quoted ids.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { CharacterCatalog, CharacterPatch } from '@actors/generator';

/** Garments the crew wears, then the captain's (Actors' `navy-rn-captain` preset, see `captainLook`). */
export const PACK_GARMENTS = [
  'briefs', 'loose-tshirt', 'longsleeve', 'wool-pants', 'newsboy-cap', 'cloth-shoes',
  'high-socks', 'buckled-shoes', 'navy-breeches', 'navy-waistcoat', 'navy-tailcoat', 'navy-lapels', 'navy-collar', 'navy-cuffs',
  'navy-buttons-officer', 'navy-stock', 'navy-epaulettes',
];
/** Hairstyles: men's short ones, as most seamen wore them about 1805 (the pack's queue reads as a woman's ponytail from the deck). */
export const PACK_HAIR = ['hair-short02', 'hair-short03', 'hair-short-messy', 'hair-short-grump', 'hair-swept-back', 'hair-short-curls'];
/** Clips: standing by, hauling, working and walking (crew.ts gives each man his). */
export const PACK_CLIPS = [
  'idle', 'arms folded', 'talk', 'nod', 'lean on rail', 'call from rail', 'interact', 'pick up', 'crouch', 'repair (kneeling)',
  'walk', 'walk carrying',
];

/** Where the build serves the cut pack (`npm run packs` fills public/packs), under the page's base. */
export const PACK = 'packs/human/manifest.json';
/** Actors' catalogue cut to what the pack holds (the PACK_ lists): every character the page loads takes it. */
export const packCatalog = (c: CharacterCatalog): CharacterCatalog => ({
  ...c,
  garments: c.garments.filter((g) => PACK_GARMENTS.includes(g.id)),
  hair: c.hair.filter((h) => PACK_HAIR.includes(h.id)),
  animations: c.animations.filter((a) => PACK_CLIPS.includes(a.id)),
});

/** A man's rank, as far as his dress tells it. */
export type Rank = 'officer' | 'marine' | 'seaman';
/** The two navies of a duel: the player's and the enemy's. */
export type Navy = 'british' | 'french';
/** A ship's navy in the duel: the first ship British, the other French. */
export const navyOf = (ship: number): Navy => (ship === 0 ? 'british' : 'french');

/** Colours of the dress (sRGB hex) by navy: the coat or shirt of each rank, the trousers, and the seamen's slops. */
const COLOURS: Readonly<Record<Navy, { officer: string; marine: string; whites: string; slops: readonly string[]; shirts: readonly string[] }>> = {
  british: { officer: '#1d2540', marine: '#9a1f1a', whites: '#e4dfd2', slops: ['#d8d2c2', '#c9c1ab', '#a9a08a', '#3b4660', '#4a4a52'], shirts: ['#e8e2d4', '#cfc7b4', '#b9ad94', '#6f2a24', '#2f3a55', '#d9d0bd'] },
  french: { officer: '#1f2c5c', marine: '#2a3a78', whites: '#e8e4d8', slops: ['#d6cfbc', '#b7ae96', '#5a4a3a', '#3f4f6e', '#7a6a50'], shirts: ['#ece6d8', '#c8bfa8', '#a8382c', '#2c3d66', '#d2c8b2', '#e0d6c0'] },
};
/** Hair colours, sRGB. */
const HAIR_COLOURS = ['#2a1d14', '#3b2417', '#4a3020', '#6a4a2a', '#8a6a3a', '#b08a50', '#1c1814', '#7a3a1e', '#8a8580'];
/** Shares among the seamen: with a cap, in shoes (most went barefoot), in a long-sleeved shirt, with a beard. */
const SHARE = { cap: 0.3, shod: 0.2, sleeves: 0.45, beard: 0.25 } as const;
/** The ranges a man's body is drawn from (Actors' 0..1 sliders; age in years): grown men, lean and strong from work. */
const BODY = { age: [18, 48], muscle: [0.5, 0.85], weight: [0.3, 0.6], height: [0.3, 0.65], proportions: [0.35, 0.65], skin: [0.05, 0.5] } as const;
/** Ethnic mix: mostly European crews, some from everywhere a ship called. */
const MIX = { african: 0.25, asian: 0.15 } as const;
/** Beards a seaman may wear. */
const BEARDS = ['short', 'mustache', 'chinstrap', 'full'] as const;

/** Everything about how a man looks, from his seed, rank and navy. */
export function lookOf(seed: number, rank: Rank, navy: Navy): CharacterPatch {
  const r = new Rng(deriveSeed(seed, 'look'));
  const c = COLOURS[navy], colors: Record<string, string> = {};
  const wear = (id: string, colour: string) => { colors[id] = colour; return id; };
  let outfit: string[];
  if (rank === 'officer') outfit = ['briefs', wear('longsleeve', c.officer), wear('wool-pants', c.whites), wear('cloth-shoes', '#1a1410')];
  else if (rank === 'marine') outfit = ['briefs', wear('longsleeve', c.marine), wear('wool-pants', c.whites), wear('cloth-shoes', '#1a1410'), wear('newsboy-cap', '#14141a')];
  else {
    outfit = ['briefs', wear(r.chance(SHARE.sleeves) ? 'longsleeve' : 'loose-tshirt', r.pick(c.shirts)), wear('wool-pants', r.pick(c.slops))];
    if (r.chance(SHARE.shod)) outfit.push(wear('cloth-shoes', '#2a2018'));
    if (r.chance(SHARE.cap)) outfit.push(wear('newsboy-cap', r.pick(c.slops)));
  }
  const seaman = rank === 'seaman';
  return {
    body: {
      gender: 1, ageYears: r.range(...BODY.age), muscle: r.range(...BODY.muscle), weight: r.range(...BODY.weight),
      height: r.range(...BODY.height), proportions: r.range(...BODY.proportions),
      african: r.chance(MIX.african) ? r.float() : 0, asian: r.chance(MIX.asian) ? r.float() : 0, caucasian: 1,
    },
    skin: 'procedural', skinTone: r.range(...BODY.skin),
    hair: r.pick(PACK_HAIR), hairColor: r.pick(HAIR_COLOURS),
    beard: seaman && r.chance(SHARE.beard) ? r.pick(BEARDS) : 'none',
    outfit, garmentColors: colors,
  };
}

/** The seed of the captain's own looks: the player's body, the same on every machine. */
const CAPTAIN_SEED = 1805;
/** Actors' outfit preset the captain wears (X2's navy wardrobe): a Royal Navy post captain about 1800. */
export const CAPTAIN_DRESS = 'navy-rn-captain';
/**
 * Pieces of it his own body leaves off: the hat. His head is drawn at a thousandth of its size, but the bicorne keeps
 * its size round his eyes, so looking down he would see only its inside.
 */
export const CAPTAIN_UNSEEN = ['navy-bicorne', 'navy-bicorne-lace', 'navy-cockade'];
/**
 * The captain as he sees himself (plan N2.7): his body from his seed, dressed as a post captain of her navy. Takes the
 * preset from Actors' catalogue; every piece of it must be in PACK_GARMENTS.
 */
export function captainLook(catalog: Pick<CharacterCatalog, 'outfits'>): CharacterPatch {
  const dress = catalog.outfits.find((o) => o.id === CAPTAIN_DRESS);
  if (!dress) throw new Error(`no outfit ${CAPTAIN_DRESS} in the Actors catalogue`);
  const missing = dress.garments.filter((g) => !PACK_GARMENTS.includes(g) && !CAPTAIN_UNSEEN.includes(g));
  if (missing.length) throw new Error(`${CAPTAIN_DRESS} needs ${missing.join(', ')} in PACK_GARMENTS`);
  const outfit = dress.garments.filter((g) => !CAPTAIN_UNSEEN.includes(g));
  return { ...lookOf(CAPTAIN_SEED, 'officer', 'british'), beard: 'none', outfit, garmentColors: { ...dress.colors } };
}
