/**
 * Reading back what the device kept (the settings, the last match terms): plain checks that a kept value is of the
 * kind expected, else its default. Pure.
 */

/** Whether a kept value is a plain object. */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** The kept value if it is one of `of`, else `or`. */
export const oneOf = <T extends string>(v: unknown, of: readonly T[], or: T): T => (of.includes(v as T) ? (v as T) : or);
