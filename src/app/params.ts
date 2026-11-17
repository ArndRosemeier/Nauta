/** What the page's address asks for (`?gl&hud&hour=17`). Pure: it takes the query string. */
export interface Params {
  /** Draw with WebGL 2 even where WebGPU exists (headless checks in the cloud). */
  readonly forceWebGL: boolean;
  /** Show the line of numbers in the corner. */
  readonly hud: boolean;
  /** The hour the day starts at, 0..24. */
  readonly hour: number;
  /** Real minutes a game day takes; 0 stops the clock. */
  readonly dayMinutes: number;
}

export function readParams(query: string): Params {
  const q = new URLSearchParams(query);
  const num = (name: string, fallback: number, min: number, max: number) => {
    const v = q.get(name), n = v === null || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return { forceWebGL: q.has('gl'), hud: q.has('hud'), hour: num('hour', 10, 0, 24) % 24, dayMinutes: num('day', 24, 0, 100000) };
}
