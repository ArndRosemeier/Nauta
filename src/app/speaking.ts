/**
 * The men speaking on the page (implementation plan N4.5): the match's events of each step and what her officers
 * notice between steps (sim/notices.ts) go through the reports table (speech/reports.ts) into the bubble queue
 * (speech/bubbles.ts), and the bubble layer puts them over the men (bubbleLayer.ts). The men are whoever the drawing
 * put in `speakers`: faceless stand-ins at their stations first (render/speech/standIns.ts), the drawn officers after.
 * Every line said also goes to the report log (`log`), which the reports sheet shows.
 */
import type { Camera } from 'three';
import { noticed } from '../sim/notices';
import type { SimState } from '../sim/state';
import { BubbleLayer } from './bubbleLayer';
import { navyOf } from './crewLooks';
import type { OrderSession } from './orderReport';
import type { Language } from './settings';
import { BubbleQueue } from './speech/bubbles';
import { lookoutSays, saysOf, type Sent } from './speech/reports';
import { ReportLog } from './speech/reportLog';
import { Speakers } from './speech/speakers';

/** The speech of my ship's men on the page. */
export class Speech {
  readonly speakers = new Speakers();
  readonly queue: BubbleQueue;
  /** Every line said this match, for the reports sheet. */
  readonly log = new ReportLog();
  private readonly layer: BubbleLayer;
  private last: SimState;
  /** Whether a step of this match has been heard yet (the lookout's first look round). */
  private looked = false;

  /** `clock`: the match's clock, s (the page's, or a browser check's: bubbles then wait on its jumps, not on slow frames). */
  constructor(parent: HTMLElement, private readonly match: OrderSession, language: Language, private readonly clock: () => number) {
    this.last = match.state;
    this.queue = new BubbleQueue(match.state.matchSeed, language, navyOf(match.ship));
    this.layer = new BubbleLayer(parent, this.queue, this.speakers);
    match.on('events', (events) => {
      const now = match.state, ship = match.ship, t = this.clock();
      // What her officers notice in this step, when it follows the last one seen (not across a new match or a jump).
      if (now.matchSeed !== this.last.matchSeed) { this.layer.clear(); this.log.clear(); this.looked = false; }
      const next = now.tick === this.last.tick + 1, notices = next ? noticed(this.last, now, ship, !this.looked) : [];
      if (next) this.looked = true;
      this.last = now;
      this.queue.navy = navyOf(ship);
      for (const e of [...events, ...notices]) this.log.record(this.queue.add(saysOf(e, ship), t), now.tick);
    });
  }

  /** The words' language (the settings). */
  set language(l: Language) {
    this.queue.language = l;
  }

  /** The captain's word as the order fan sends it (N4.4): the midshipman off with an order, or the lookout asked what he sees. */
  sent(e: Sent): void {
    const says = e.ask === 'look out' ? lookoutSays(this.match.state, this.match.ship) : saysOf(e, this.match.ship);
    this.log.record(this.queue.add(says, this.clock()), this.match.state.tick);
  }

  /** Once a frame, after the camera is placed. */
  drawBubbles(camera: Camera): void {
    this.layer.frame(this.clock(), camera);
  }
}
