/**
 * The connection to GameHub (implementation plan N3.7), with its client taken as gameserver's README says
 * (vendor/gamehub). The game is `nauta` on the server, registered by Arnd (2026-11-18) with its app key below; the
 * address may name another (`?key=`). App keys are not secrets: a browser game ships its key (Arnd: "it can be in the code").
 */
import { connect } from '../../vendor/gamehub/gamehub';
import type { DuelHub } from '../net/duel';
import { GAME } from '../net/wire';
import type { Params } from './params';

/** GameHub's own server. */
export const GAMEHUB_URL = 'https://games.futuremagic.de';

/** Nauta's app key on GameHub. */
export const GAMEHUB_KEY = 'ghk_nauta_qbuwVLqomloa-mz5TFvvznJ19XvuVWvC';

/** A new connection to the hub (or the server `?hub=` names), with the game's key (or the one `?key=` names), as the captain `name`. */
export function openHub(params: Params, name: string): DuelHub {
  return connect({ url: params.hub ?? GAMEHUB_URL, app: GAME, appKey: params.key ?? GAMEHUB_KEY, name });
}

/** What went wrong with the hub, in words for the panel ("gamehub: " left off). */
export function hubProblem(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^gamehub: /, '') : String(err);
}
