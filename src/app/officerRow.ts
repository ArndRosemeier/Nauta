/**
 * The officer row (Arnd 2026-11-18: "As a player of course I have no idea which person does what. Give me everybody
 * that I can command as an icon with a small description below, obviously clickable. Clicking one of those then
 * reveals the available commands."): along the foot of the view, always on screen, one card for each man the captain
 * commands, an icon in brass on lacquer with his rank and what he is for under it. A tap or click on a card opens that
 * man's orders (orderFan.ts, the same fan as a tap on the man in the world); a man out of the captain's voice is
 * marked "by midshipman" (the midshipman runs his orders, as with the keys). The first match's lesson rings the card
 * of the man to tap. The cards and their words are fanOrders.ts (pure); this file is their DOM.
 */
import type { Spot } from '../sim/ship/plan';
import { make } from './dom';
import { officerCards, type OfficerCard } from './fanOrders';
import type { Officer } from './officers';
import type { WordKey } from './words';

/** The cards are judged anew at most this often, ms (whether his voice reaches a man changes only as the captain walks). */
const JUDGE_EVERY_MS = 250;

/** The icons, 48 units across, drawn in `currentColor` (the card's brass): the wheel, a square sail, a gun, a hammer, a spyglass, a sealed letter. */
const ICONS: Readonly<Record<Officer, string>> = {
  master: '<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="4"/>'
    + '<path d="M24 5V43M5 24H43M10.6 10.6L37.4 37.4M37.4 10.6L10.6 37.4"/>'
    + '<circle cx="24" cy="5" r="2" fill="currentColor"/><circle cx="24" cy="43" r="2" fill="currentColor"/><circle cx="5" cy="24" r="2" fill="currentColor"/><circle cx="43" cy="24" r="2" fill="currentColor"/>',
  'first lieutenant': '<path d="M24 4V44"/><path d="M9 9H39"/><path d="M10 9L8 31Q24 37 40 31L38 9" fill="currentColor" fill-opacity="0.25"/><path d="M17 44H31"/>',
  gunner: '<g transform="rotate(-14 24 22)"><rect x="6" y="17" width="29" height="10" rx="3" fill="currentColor" fill-opacity="0.25"/><rect x="33" y="15" width="7" height="14" rx="1.5"/><circle cx="6" cy="22" r="2.5"/></g>'
    + '<circle cx="19" cy="36" r="7"/><circle cx="19" cy="36" r="1.8" fill="currentColor"/><path d="M8 43H36"/>',
  carpenter: '<g transform="rotate(38 24 24)"><rect x="21" y="14" width="6" height="30" rx="1.5" fill="currentColor" fill-opacity="0.25"/><rect x="11" y="5" width="26" height="10" rx="2"/></g>',
  lookout: '<g transform="rotate(-35 24 24)"><rect x="3" y="17" width="15" height="14" rx="2"/><rect x="18" y="19" width="13" height="10" fill="currentColor" fill-opacity="0.25"/><rect x="31" y="21" width="12" height="6" rx="1"/></g>',
  midshipman: '<rect x="6" y="12" width="36" height="25" rx="2"/><path d="M6 14L24 28L42 14"/><circle cx="24" cy="28" r="4" fill="currentColor"/>',
};

/** An icon as an element (a drawing in the card's brass). */
function icon(who: Officer): SVGElement {
  const holder = make('span', '');
  holder.innerHTML = `<svg class="nt-officer-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[who]}</svg>`;
  return holder.firstElementChild as SVGElement;
}

/** What the row needs from the page. */
export interface RowPage {
  captain(): Spot | null;
  words(): Readonly<Record<WordKey, string>>;
  /** A card was chosen: whose, the middle of the card across the screen, and the top of the row. */
  chosen(who: Officer, x: number, top: number): void;
}

interface Card {
  readonly who: Officer;
  readonly button: HTMLButtonElement;
  readonly rank: HTMLElement;
  readonly role: HTMLElement;
  readonly runs: HTMLElement;
}

export class OfficerRow {
  readonly root = make('nav', 'nt-officers');
  private readonly cards: Card[];
  private spoken: Readonly<Record<WordKey, string>> | null = null;
  private judged = -Infinity;

  constructor(private readonly page: RowPage) {
    this.cards = officerCards(null).map((c) => this.card(c));
    this.root.append(...this.cards.map((c) => c.button));
    document.body.append(this.root);
    this.refresh(0);
  }

  private card(c: OfficerCard): Card {
    const button = make('button', 'nt-officer'), rank = make('span', 'nt-officer-rank'), role = make('span', 'nt-officer-role'), runs = make('span', 'nt-officer-runs');
    button.type = 'button';
    const disc = make('span', 'nt-officer-disc');
    disc.append(icon(c.who));
    button.append(disc, rank, role, runs);
    // A click (also from the keyboard), then the focus goes back to the page, so no key is taken from the game.
    button.addEventListener('click', () => {
      const r = button.getBoundingClientRect();
      button.blur();
      this.page.chosen(c.who, r.left + r.width / 2, this.root.getBoundingClientRect().top);
    });
    return { who: c.who, button, rank, role, runs };
  }

  /** Once a frame: the words (when the language changed) and which men are out of voice (a few times a second). */
  refresh(now: number): void {
    const say = this.page.words();
    if (say !== this.spoken) {
      this.spoken = say;
      this.root.setAttribute('aria-label', say.officersRow);
      officerCards(null).forEach((c, i) => {
        const k = this.cards[i]!;
        k.rank.textContent = say[c.rank];
        k.role.textContent = say[c.role];
        k.runs.textContent = say.officerRuns;
        k.button.setAttribute('aria-label', `${say[c.rank]}: ${say[c.role]}`);
      });
    }
    if (now - this.judged < JUDGE_EVERY_MS) return;
    this.judged = now;
    officerCards(this.page.captain()).forEach((c, i) => this.cards[i]!.button.classList.toggle('far', c.far));
  }

  /** The first match's lesson rings this man's card (null: none). */
  lesson(who: Officer | null): void {
    for (const c of this.cards) c.button.classList.toggle('lesson', c.who === who);
  }

  /** The card of the man whose fan is open is lit (null: none). */
  light(who: Officer | null): void {
    for (const c of this.cards) c.button.classList.toggle('on', c.who === who);
  }

  /** The cards' middles across the screen, for the checks. */
  middles(): { who: Officer; x: number; y: number }[] {
    return this.cards.map((c) => { const r = c.button.getBoundingClientRect(); return { who: c.who, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  }
}
