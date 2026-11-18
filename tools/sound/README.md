# The game's sounds

Every sound in `public/sound/` is listed in [`sounds.json`](sounds.json) with its prompt and how it is cut. The shared
script of `@futuremagic/audio` turns the list into the files and `public/sound/index.json`, which the game's engine reads:

```
NODE_USE_ENV_PROXY=1 node vendor/assetgenerator/packages/audio/tools/make.mjs --spec tools/sound/sounds.json \
  --out public/sound --raw /mnt/project-files/nauta/audio/raw --title Nauta [--only id,id] [--again id]
```

- Needs `OPEN_ROUTER_KEY` and ffmpeg; never part of CI. Raw takes are kept in the project's shared folder
  (`/mnt/project-files/nauta/audio/raw`), so cutting again costs nothing; `--again id` asks for a new take.
- Sounds come from the newest ByteDance Seed Audio (resolved when the script runs, by Arnd's preferences). A prompt
  must start with "The sound of", or it speaks the words. **No voices anywhere** (Arnd): every prompt says so, and
  every take is run through a transcriber, which must hear nothing.
- Kinds: `bed` (a 30 s take, levelled to −24 dBFS RMS, played as a crossfading loop), `steps` (hits cut out of one
  take), `calls` (separate sounds cut at a take's silences). Beds come in two takes, `-a` and `-b`, which the game blends
  by a slow swing, so no loop is heard.
- What plays when is decided in `src/audio/ambience.ts` and `src/audio/slaps.ts` (pure, tested), tuned in
  `src/audio/tuning.ts`, and played by `src/audio/seaSound.ts`.
- Size: 64 kbit/s mono at 32 kHz, about 235 KB a bed; everything of N1.7 is about 4.5 MB, loaded only after the first
  tap and only what the weather asks for.

## History

- 2026-11-18 (N1.7, sound of sea and wind): 17 beds (the sea in calm, breeze, strong breeze and gale; the wind light,
  fresh, strong and gale; two takes each; and the swell's deep surge) and four sets of slaps (laps, hull slaps, crests
  breaking into foam, heavy seas bursting). Three rounds for about $1.90 of OpenRouter credit (the key is shared with
  other threads, so the per-run figures overstate a little). The first round's sea sounded like surf on a beach; the
  prompts now say "heard from the deck of a sailing ship far from land" and "no shore, no beach, no surf". A transcriber
  heard no speech in any take. A listening model still hears "surf" in most sea beds: Arnd judges them by ear at gate G1,
  and a take is changed with `--again <id>`.
