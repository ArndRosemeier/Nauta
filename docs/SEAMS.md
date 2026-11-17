# The seam index: the one place that does X

Before writing code that does something, look here. If a row covers it, call that place; if the place cannot do what you need, change it there. Never write a second one. A new responsibility gets its row in the same commit that creates it. `npm test` checks that every row points at an export that exists (`tools/guards/discipline.mjs`).

| What | The one place |
| --- | --- |
| Turning the captain's look by a drag | `src/app/look.ts#turn` |
| The direction looked along | `src/app/look.ts#lookDir` |
| Reading the page's address (`?hud`, `?hour=`) | `src/app/params.ts#readParams` |
| Defining a material (every shader the game draws with) | `src/render/materials.ts#defineKind` |
| Renderer, scene, camera and the Stage | `src/render/view.ts#createView` |
| Sun, moon, stars and clouds through the day | `src/render/skyView.ts#SkyView` |
| Units of time and angle | `src/sim/units.ts#HOURS_PER_DAY` |
| What the browser and device offer (`?probe`, its page) | `src/probe/page.ts#runProbe` |
| Asking WebGPU, and timing a compute pass | `src/probe/gpu.ts#probeWebGPU` |
| Asking WebGL 2 | `src/probe/gpu.ts#probeWebGL2` |
| The probe's report as text | `src/probe/report.ts#formatReport` |
| A median of measurements | `src/probe/report.ts#medianOf` |
| A size in bytes as people read it | `src/probe/report.ts#formatBytes` |
| The time budgets of `npm test` | `tools/test/judge.mjs#judge` |
| Compass bearing to a direction on the water (0 north = -z, clockwise) | `src/sim/units.ts#bearingDir` |
| Bringing a bearing into 0..2pi | `src/sim/units.ts#wrapBearing` |
| The Beaufort scale: a force's mean wind speed | `src/sim/rules/beaufort.ts#beaufortSpeed` |
| Making a match's wind (seed, force, bearing) | `src/sim/wind.ts#makeWind` |
| The true wind at a place and moment, gusts included (what fills the sails) | `src/sim/wind.ts#windAt` |
| The mean wind at a moment, without gusts (what drives the sea) | `src/sim/wind.ts#meanWind` |
| The gust patches near a place, for drawing them on the water | `src/sim/wind.ts#gustsNear` |
| A gust's shape across its patch | `src/sim/wind.ts#gustShape` |
| The wind's tuning: gusts, veer and freshening per force | `src/sim/rules/wind.ts#WIND_PRESETS` |
