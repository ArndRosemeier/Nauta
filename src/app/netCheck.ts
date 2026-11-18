/**
 * `?netcheck`: a match through GameHub without drawing anything, for the network's slow check (tools/net/room.mjs,
 * plan N3.7): two headless browsers open it, one opening a room (`?netcheck&room`), the other joining it
 * (`?netcheck&join=CODE`), and the check reads `window.__nautaNet`. Its code loads only when asked for.
 */
import { VERSION } from 'virtual:nauta/version';
import { DuelSession } from '../net/duel';
import { parseOrder } from '../sim/orders';
import { hashState } from '../sim/state';
import { MS_PER_SECOND, STEPS_PER_SECOND } from '../sim/units';
import { openHub } from './hub';
import { pageSeconds } from './pageMatch';
import type { Params } from './params';

/** How often the page pumps the match, ms: twice a step, as a page's frames would. */
const PUMP_MS = MS_PER_SECOND / STEPS_PER_SECOND / 2;

/** What the check reads and does. */
export interface NetCheck {
  readonly role: string;
  readonly code: string;
  readonly ship: number;
  readonly tick: number;
  readonly drifts: number;
  readonly problem: string;
  /** The hash at every whole second this page stepped to, by tick. */
  readonly hashes: Readonly<Record<number, string>>;
  /** Gives an order in words to my ship; answers why the words are none, or ''. */
  give(words: string): string;
  /** A ship's canvas as she has been told. */
  canvas(ship: number): string;
  close(): void;
}

declare global {
  interface Window {
    __nautaNet?: NetCheck;
  }
}

export async function runNetCheck(params: Params): Promise<void> {
  const status = document.createElement('pre');
  document.body.append(status);
  document.getElementById('loading')?.remove();
  const session = new DuelSession({ hub: openHub(params, 'Check'), build: VERSION, now: pageSeconds });
  const hashes: Record<number, string> = {};
  session.on('events', () => { if (session.state.tick % STEPS_PER_SECOND === 0) hashes[session.state.tick] = hashState(session.state); });
  try {
    await (params.join ? session.join(params.join) : session.create('netcheck'));
  } catch (err) {
    status.textContent = `failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(status.textContent);
    return;
  }
  setInterval(() => { session.pump(); status.textContent = session.line(); }, PUMP_MS);
  window.__nautaNet = {
    get role() { return session.role; },
    get code() { return session.code; },
    get ship() { return session.mine; },
    get tick() { return session.started ? session.state.tick : -1; },
    get drifts() { return session.drifts; },
    get problem() { return session.problem; },
    hashes,
    give(words) {
      const order = parseOrder(words, session.mine);
      if (typeof order === 'string') return order;
      session.give(order);
      return '';
    },
    canvas: (ship) => session.state.ships[ship]?.told.canvas ?? '',
    close: () => session.close(),
  };
}
