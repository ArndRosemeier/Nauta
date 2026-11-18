/**
 * The page's one sound engine (`@futuremagic/audio`), made by the title as the page opens (plan N7.7), so the tap that
 * starts the title's theme also opens sound for the sea, the ship and the guns that follow (Safari opens it only from
 * a press). The sounds are in the page's `sound/` (tools/sound/sounds.json).
 */
import { AudioEngine } from '@futuremagic/audio/web';
import { SOUND_MEMORY, SOUND_SEED } from './tuning';

/** Safari's audio session for a game: sound plays even when the device is set to silent, as a video's does. */
interface AudioSessionNavigator { audioSession?: { type: string } }

let engine: AudioEngine | null = null;

/** The page's sound engine, made on the first call. */
export function pageEngine(): AudioEngine {
  if (engine) return engine;
  const nav = navigator as Navigator & AudioSessionNavigator;
  if (nav.audioSession) nav.audioSession.type = 'playback';
  engine = new AudioEngine({ base: `${import.meta.env.BASE_URL}sound/`, seed: SOUND_SEED, budget: SOUND_MEMORY });
  return engine;
}
