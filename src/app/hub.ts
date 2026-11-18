/**
 * The connection to GameHub (implementation plan N3.7), with its client taken as gameserver's README says
 * (vendor/gamehub). The game is `nauta` on the server; its app key comes with the build (`VITE_GAMEHUB_KEY`) or, until
 * the build has one, from the address (`?key=`). App keys are not secrets: a browser game ships its key.
 */
import { connect } from '../../vendor/gamehub/gamehub';
import type { DuelHub } from '../net/duel';
import { GAME } from '../net/wire';
import type { Params } from './params';

/** GameHub's own server. */
export const GAMEHUB_URL = 'https://games.futuremagic.de';

/** The app key to connect with: the address's, else the build's ('' when neither has one). */
export function hubKey(params: Params): string {
  const built = import.meta.env.VITE_GAMEHUB_KEY as string | undefined;
  return params.key ?? built ?? '';
}

/** A new connection to the hub (or the server `?hub=` names), as the captain `name`. */
export function openHub(params: Params, name: string): DuelHub {
  const key = hubKey(params);
  return connect({ url: params.hub ?? GAMEHUB_URL, app: GAME, appKey: key || undefined, name });
}
