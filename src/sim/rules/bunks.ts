/**
 * The men off duty sleep below (Arnd, 2026-11-18: "people that are of no use right now stay below"): a hammock each, slung
 * athwart her in rows 14 inches apart over the berth deck, the messdeck's two tiers over its mess tables, the main
 * hatchway's and the fore store's three. A man's bunk is shared out by roster.ts; his `home` is the crew place on the
 * floor under his hammock (`BUNK_STATIONS`, rules/ships.ts STATIONS), where the match walks him from.
 */

/** One hammock. */
export interface Bunk {
  /** The crew place under it: the floor spot he is walked from (the tiers over one spot share it). */
  readonly station: string;
  /** The space of hers he sleeps in. */
  readonly space: string;
  /** m forward of the mainmast, m from the middle line (+ starboard) of the middle of the hammock, and m over the floor of the cloth. */
  readonly along: number;
  readonly across: number;
  readonly height: number;
}
/** A hammock's row spacing, m (14 inches), and how far each lane's hammock lies from the middle line, m (the fore store's lanes lie a little farther out, clear of its stove-in middle). */
const HAMMOCK_ROW = 0.36;
const HAMMOCK_LANE = 1.45;
const FORE_LANE = 1.7;
/** Hammock tiers, m over the floor: over the mess tables (top 0.74) the lower tier hangs clear of them, the headroom is 1.6. */
const TIERS_UNDER_TABLES = [0.95, 1.3] as const;
const TIERS_FORE = [0.6, 0.95, 1.3] as const;
/** The rooms hammocks are slung in: where its rows start (m forward of the mainmast), how many, the lanes' across and the tiers; the messdeck's rows are taken from its fore end, the fore ladder's foot. */
const BUNK_ROOMS: readonly { readonly space: string; readonly first: number; readonly rows: number; readonly lanes: readonly number[]; readonly tiers: readonly number[]; readonly fromFore: boolean }[] = [
  { space: 'messdeck', first: 6.6, rows: 12, lanes: [-HAMMOCK_LANE, HAMMOCK_LANE], tiers: TIERS_UNDER_TABLES, fromFore: true },
  { space: 'midships', first: 2.9, rows: 4, lanes: [0], tiers: TIERS_FORE, fromFore: false },
  { space: 'fore-store', first: 14.2, rows: 7, lanes: [-FORE_LANE, FORE_LANE], tiers: TIERS_FORE, fromFore: false },
];
/** Every floor spot a hammock is slung over, with its crew place id. */
const FLOORS = BUNK_ROOMS.flatMap((r) => Array.from({ length: r.rows }, (_, row) => row).flatMap((row) => r.lanes.map((across) => ({ at: { space: r.space, along: r.first + row * HAMMOCK_ROW, across }, fromFore: r.fromFore, row, rows: r.rows, tiers: r.tiers }))));
/** The crew places under the hammocks, as rows of rules/ships.ts STATIONS. */
export const BUNK_STATIONS = FLOORS.map((f, k) => ({ id: `bunk-${k}`, name: 'the berth deck, hammocks', who: 'the hands off watch', orders: [] as string[], ...f.at }));
/**
 * Every bunk, the nearest to the ladders first (the messdeck from its fore end, which is the fore ladder's foot, then the
 * main hatchway, then the fore store beyond the galley): the men an order calls first sleep nearest the way up
 * (`BUNK_PRIORITY`, rules/crew.ts), so a tack or a muster does not wait on a man from the far end of the berth deck.
 */
export const BUNKS: readonly Bunk[] = FLOORS
  .map((f, k) => ({ f, k }))
  .sort((a, b) => BUNK_ROOMS.findIndex((r) => r.space === a.f.at.space) - BUNK_ROOMS.findIndex((r) => r.space === b.f.at.space) || (a.f.fromFore ? b.f.row - a.f.row : a.f.row - b.f.row) || a.k - b.k)
  .flatMap(({ f, k }) => f.tiers.map((height): Bunk => ({ station: `station-bunk-${k}`, ...f.at, height })));
