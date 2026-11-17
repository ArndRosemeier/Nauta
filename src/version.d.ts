/** The modules tools/version/version.ts gives the game when it is built. */
declare module 'virtual:nauta/version' {
  /** This build's version (`0.012`). */
  export const VERSION: string;
  /** Built on a desk or for a check, not by the deploy. */
  export const DEV: boolean;
  /** The version as the game shows it (`0.012`, `0.012 dev`). */
  export const LABEL: string;
}

declare module 'virtual:nauta/history' {
  import type { Release } from '../tools/version/version';
  /** Every version, newest first. */
  const history: readonly Release[];
  export default history;
}
