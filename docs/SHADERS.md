# Shaders

A shader that compiles while the game is drawn is a stutter, and on a tablet a long one. So:

1. **Every material is a kind** in `src/render/materials.ts` (`defineKind`): a name, the vertex attributes its meshes carry, and one shared material.
2. **The warm-up compiles every kind** behind the loading screen (`stage.warmUp()`, `@futuremagic/stage`), against the real scene: its lights, fog and environment map must be set up before, since they are part of every lit shader's key.
3. **Things enter the scene through `stage.add(obj)`**, which compiles first and shows after. Never `scene.add` something drawn with a material that is not warmed.
4. **Nothing compiles on the render path.** `?hud` shows the count ("policy ok"); `shaders.report()` in the console names any breach.
5. **After the warm-up compiles are capped:** at most a third of every second goes to them, each aims for 10 ms, one per frame, then a wait of twice its time.

The tablet (iPad Air M4, Safari) is where this is judged: check the HUD line there after adding a kind.
