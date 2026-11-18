/**
 * The settings kept on the device (plan N7.3): read once at the start, written on every change, and told to every
 * part of the page that applies one, so a change works at once, mid-match. The address can set a few for one visit
 * (`?quality=`, `?motion=`, `?hud`): those hold until the player changes that setting, and are never kept.
 */
import { DEFAULT_SETTINGS, languageOf, readSettings, type Settings } from './settings';

/** Where the device keeps the settings. */
const KEY = 'nauta.settings';
/** Where the calm view's button (plan N2.7) kept its one setting before the settings existed. */
const OLD_MOTION_KEY = 'nauta.motion';

/** Storage can be refused (a private window, a blocked site): then nothing is kept and the game goes on. */
function kept(): unknown {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as unknown;
    const motion = localStorage.getItem(OLD_MOTION_KEY);
    return { language: languageOf(navigator.language), ...(motion ? { motion: Number(motion) } : {}) };
  } catch { return null; }
}
function keep(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not kept */ }
}

type Listener = (now: Settings, before: Settings | null) => void;

export class SettingsStore {
  private saved: Settings;
  private visit: Partial<Settings>;
  private readonly listeners = new Set<Listener>();

  /** `visit`: what the address sets for this visit only. */
  constructor(visit: Partial<Settings> = {}) {
    this.saved = readSettings(kept() ?? DEFAULT_SETTINGS);
    this.visit = visit;
  }

  /** The settings in force now. */
  get now(): Settings {
    return { ...this.saved, ...this.visit };
  }

  /** Whether the address sets this one for the visit. */
  setByAddress(field: keyof Settings): boolean {
    return field in this.visit;
  }

  /** Changes settings: kept on the device, and every listener told at once. A field the address set is the player's again. */
  change(to: Partial<Settings>): void {
    const before = this.now;
    this.saved = readSettings({ ...this.saved, ...to });
    const visit: Partial<Settings> = { ...this.visit };
    for (const f of Object.keys(to) as (keyof Settings)[]) delete visit[f];
    this.visit = visit;
    keep(this.saved);
    const now = this.now;
    for (const l of this.listeners) l(now, before);
  }

  /** Calls `listener` with the settings now, and again after every change (with those before). */
  watch(listener: Listener): void {
    this.listeners.add(listener);
    listener(this.now, null);
  }
}
