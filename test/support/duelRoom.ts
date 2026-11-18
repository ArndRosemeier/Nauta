/**
 * Two captains in a fake room (N3.7), for the duel's tests: the fake server, a shared fake clock, and a loop that
 * moves the clock a step at a time, pumps every machine and hands out the messages.
 */
import { DuelSession } from '../../src/net/duel.ts';
import { hashState } from '../../src/sim/state.ts';
import { STEP_SECONDS } from '../../src/sim/units.ts';
import { FakeServer } from './fakeHub.ts';

export const BUILD = '0.100';

export class DuelRoom {
  readonly server = new FakeServer();
  t = 0;
  readonly sessions: DuelSession[] = [];
  /** Each machine's hash at every whole simulated second it stepped to, by tick. */
  readonly hashes: Map<number, string>[] = [];

  /** A machine joining the play, with its own connection. */
  machine(name: string, build = BUILD): DuelSession {
    const s = new DuelSession({ hub: this.server.connect(name), build, now: () => this.t });
    const seen = new Map<number, string>();
    s.on('events', () => { if (s.state.tick % (1 / STEP_SECONDS) === 0) seen.set(s.state.tick, hashState(s.state)); });
    this.sessions.push(s);
    this.hashes.push(seen);
    return s;
  }

  /** A host and a guest in a room, its match running (round 0). */
  async pair(): Promise<{ host: DuelSession; guest: DuelSession }> {
    const host = this.machine('Host'), guest = this.machine('Guest');
    await host.create('duel');
    await this.settle();
    await guest.join(host.code);
    await this.settle();
    return { host, guest };
  }

  /** Hands out the messages, and runs what a host decides once it has its room's history. */
  async settle(): Promise<void> {
    this.server.deliver();
    await Promise.resolve();
    this.server.deliver();
  }

  /**
   * Runs `steps` steps of the clock: each step every machine is pumped, `each` may act, and every `deliverEvery`
   * steps (or as `deliverWhen` says) the messages go out.
   */
  run(steps: number, each?: (i: number) => void, deliverWhen: (i: number) => boolean = () => true): void {
    for (let i = 0; i < steps; i++) {
      this.t += STEP_SECONDS;
      for (const s of this.sessions) s.pump();
      each?.(i);
      if (deliverWhen(i)) this.server.deliver();
    }
  }

  /** Ticks both machines hashed, with whether they agree. */
  agreement(a: number, b: number): { both: number; differ: number[] } {
    let both = 0;
    const differ: number[] = [];
    for (const [tick, hash] of this.hashes[a]!) {
      const other = this.hashes[b]!.get(tick);
      if (other === undefined) continue;
      both++;
      if (other !== hash) differ.push(tick);
    }
    return { both, differ };
  }
}
