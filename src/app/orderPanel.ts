/**
 * The order panel on the page (`?sail`, implementation plan N3.5): a plain working tool to give the sailing orders by
 * tap or by typing, with the ship's answer, until the order fan (N4.4) replaces it. Touch first: buttons a finger can
 * hit, folded away with one tap so the view stays clear. Its words come from orderReport.ts; it gives orders through
 * an `OrderSession` and shows each step's events.
 */
import { parseOrder, type Order } from '../sim/orders';
import { make } from './dom';
import {
  crewLines, eventWords, isStanding, orderButtons, shipLines, STEER_POINTS, steerPoint, wouldRefuse, type OrderSession,
} from './orderReport';

/** How often the panel's state is written anew, ms (the words change by the second, a frame's work stays small). */
const PANEL_EVERY_MS = 250;
/** The answers kept on the panel, newest last. */
const HEARD_LINES = 6;
/** Who the buttons' groups are for, in the order shown. */
const GROUPS = ['master', 'first lieutenant'] as const;

export class OrderPanel {
  private readonly status = make('pre', 'orders-status');
  private readonly heard = make('pre', 'orders-heard');
  private readonly lines: string[] = [];
  private readonly buttons: { readonly el: HTMLButtonElement; readonly order: Order }[] = [];
  private shown = -Infinity;

  constructor(private readonly session: OrderSession) {
    const panel = make('aside', 'open');
    panel.id = 'orders';
    const head = make('button', 'orders-head', 'Orders');
    head.type = 'button';
    head.addEventListener('click', () => panel.classList.toggle('open'));
    const body = make('div', 'orders-body');
    body.append(this.status, this.heard);
    const steer = make('div', 'orders-group orders-compass');
    steer.append(make('span', 'orders-to', 'Steer'));
    STEER_POINTS.forEach((name, i) => steer.append(this.orderButton(name, { kind: 'steer', ship: 0, heading: steerPoint(i) })));
    body.append(steer);
    const all = orderButtons();
    for (const to of GROUPS) {
      const group = make('div', 'orders-group');
      group.append(make('span', 'orders-to', to === 'master' ? 'Master' : 'First lieutenant'));
      for (const b of all.filter((x) => x.to === to)) this.buttons.push({ el: group.appendChild(this.orderButton(b.label, b.order)), order: b.order });
      body.append(group);
    }
    body.append(this.typed());
    panel.append(head, body);
    document.body.append(panel);
    session.on('events', (events) => {
      for (const e of events) {
        const words = eventWords(e, session.ship);
        if (words) this.hear(words);
      }
    });
  }

  /** Once a frame: the ship's state and the buttons' rings and dimming, written anew a few times a second. */
  update(now: number): void {
    if (now - this.shown < PANEL_EVERY_MS) return;
    this.shown = now;
    const { state, ship } = this.session, told = state.ships[ship]?.told;
    this.status.textContent = [...shipLines(state, ship), ...crewLines(state, ship)].join('\n');
    for (const b of this.buttons) {
      const order = { ...b.order, ship };
      b.el.classList.toggle('on', told ? isStanding(order, told) : false);
      b.el.classList.toggle('dim', wouldRefuse(state, order));
    }
  }

  /** An order given, and heard on the panel as given. */
  private tell(order: Order, words: string): void {
    this.session.give({ ...order, ship: this.session.ship });
    this.hear(`› ${words}`);
  }

  private hear(line: string): void {
    this.lines.push(line);
    if (this.lines.length > HEARD_LINES) this.lines.shift();
    this.heard.textContent = this.lines.join('\n');
  }

  private orderButton(label: string, order: Order): HTMLButtonElement {
    const b = make('button', 'orders-button', label);
    b.type = 'button';
    b.addEventListener('click', () => { this.tell(order, label); this.shown = -Infinity; });
    return b;
  }

  /** The typed order: words read by `parseOrder`, or why they are no order. Keys typed here do not walk her decks. */
  private typed(): HTMLFormElement {
    const form = make('form', 'orders-typed'), input = make('input', 'orders-input');
    input.type = 'text';
    input.placeholder = 'type an order: steer 090, tack, plain sail';
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
    const give = make('button', 'orders-button', 'Give');
    give.type = 'submit';
    for (const kind of ['keydown', 'keyup'] as const) input.addEventListener(kind, (e) => e.stopPropagation());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const said = input.value.trim();
      if (!said) return;
      const order = parseOrder(said, this.session.ship);
      if (typeof order === 'string') this.hear(`✗ ${order}`);
      else this.tell(order, said);
      input.value = '';
    });
    form.append(input, give);
    return form;
  }
}
