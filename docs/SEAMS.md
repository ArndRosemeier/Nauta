# The seam index: the one place that does X

Before writing code that does something, look here. If a row covers it, call that place; if the place cannot do what you need, change it there. Never write a second one. A new responsibility gets its row in the same commit that creates it. `npm test` checks that every row points at an export that exists (`tools/guards/discipline.mjs`).

| What | The one place |
| --- | --- |
| Turning the captain's look by a drag | `src/app/look.ts#turn` |
| The direction looked along | `src/app/look.ts#lookDir` |
| Reading the page's address (`?hud`, `?hour=`, `?eye=`, `?wind=`, `?yaw=`, `?pitch=`) | `src/app/params.ts#readParams` |
| Defining a material (every shader the game draws with; the registry is `@futuremagic/stage` Kinds) | `src/render/materials.ts#defineKind` |
| Renderer, scene, camera and the Stage | `src/render/view.ts#createView` |
| Sun, moon, stars and clouds through the day, and the light they throw (the light rig MasterWorld shares: `@futuremagic/sky/rig` SkyRig, its numbers in `@futuremagic/sky` light.ts) | `src/render/skyView.ts#SkyView` |
| The light rig's test bodies (`?rig`): matte balls of known albedo | `src/render/testBodies.ts#makeTestBodies` |
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
| Gravity at the sea's surface | `src/sim/units.ts#GRAVITY` |
| Sine and cosine together, fast and alike on every engine | `src/sim/trig.ts#sincos` |
| The sea's tuning: wave height and period per force, how many waves, spread, choppiness, how fast it follows the wind | `src/sim/rules/sea.ts#SEA_BY_FORCE` |
| Wave height and period for a wind speed | `src/sim/sea/waves.ts#seaPreset` |
| The shape of a wind sea's spectrum (over frequency) | `src/sim/sea/spectrum.ts#jonswap` |
| The spread of a wind sea's waves around the wind | `src/sim/sea/spectrum.ts#spread` |
| Drawing values spread as a density is (inverse of its running sum) | `src/sim/sea/spectrum.ts#quantiles` |
| A wind's sea as a seeded set of wave components | `src/sim/sea/waves.ts#makeWaves` |
| A wave set from its frequencies, directions and phases (equal energy, choppiness held below folding) | `src/sim/sea/waves.ts#waveSet` |
| The swell from elsewhere: a seeded set of long, low waves well off the wind, the same in every preset | `src/sim/sea/swell.ts#makeSwell` |
| The swell's tuning: height, periods, how far off the wind, spread | `src/sim/rules/sea.ts#SWELL_HEIGHT` |
| Starting the sea | `src/sim/sea/sea.ts#startSea` |
| Changing the sea's wind (the new waves fade in over minutes) | `src/sim/sea/sea.ts#changeWind` |
| The sea following a moving wind, taking a new wave set now and then | `src/sim/sea/sea.ts#followWind` |
| The wind the sea is following | `src/sim/sea/sea.ts#seaWind` |
| How strongly each wave layer of the sea shows at a moment (the renderer's per-layer factor) | `src/sim/sea/sea.ts#layerWeights` |
| The sea at a calm point: height, normal, sideways shift, water velocity, stretch (what the renderer displaces by) | `src/sim/sea/sea.ts#seaAt` |
| The water under a world point (what a hull feels) | `src/sim/sea/sea.ts#surfaceAt` |
| The game's version and its history, from git at build time | `tools/version/version.ts#readVersion` |
| Which commits are builds, and which build added a note | `tools/version/version.ts#versionInfo` |
| A version's number as shown (`0.012`) | `tools/version/version.ts#formatVersion` |
| The version button and the what's-new panel | `src/app/whatsNew.ts#showVersion` |
| The wave sets that show at a moment and how strongly (the swell, then each wind layer by its weight) | `src/sim/sea/sea.ts#forEachShownSet` |
| The earth's curve: how far a point at a distance sinks below the eye's sea level (the horizon, hull-down) | `src/render/earth.ts#earthDrop` |
| How far the horizon lies from an eye at a height | `src/render/earth.ts#horizonDistance` |
| The sea mesh's tiles around the eye: which, where and how big | `src/render/seaGrid.ts#seaTiles` |
| The side of a sea tile of a level | `src/render/seaGrid.ts#seaTileSize` |
| How far from the eye a level of sea tiles reaches | `src/render/seaGrid.ts#seaLodRange` |
| How far a sea vertex has slid onto the next coarser grid (the vertex stage does the same) | `src/render/seaGrid.ts#seaMorph` |
| How far out the sea is drawn for an eye height | `src/render/seaGrid.ts#seaReach` |
| The sea's waves at a moment as the vertex stage reads them (weighted, phases near the eye) | `src/render/seaWaves.ts#fillSeaWaves` |
| The sea's shader: the grid displaced by the simulated waves, foam's bunching now and a few seconds ago, and the water's look per pixel (sky reflection, sun and moon glitter, deep colour, light through crests, gusts, foam, haze, the view from below) | `src/render/seaMaterial.ts#makeSeaMaterial` |
| Handing the sea the light rig's environment map (its reflections and the sky's light on the water) | `src/render/seaMaterial.ts#useSeaSky` |
| The deep around an eye under water | `src/render/seaMaterial.ts#makeDeepMaterial` |
| How rough the sea is in a wind (Cox and Munk's mean square slope, glassy in a calm) | `src/render/seaFine.ts#seaRoughness` |
| The slope a wave set carries | `src/render/seaFine.ts#slopeVariance` |
| What the fine waves carry of the roughness | `src/render/seaFine.ts#fineSlope` |
| A wind layer's fine waves (seeded, metres down to ripples) | `src/render/seaFine.ts#makeFineWaves` |
| The fine waves of a moment as the material reads them (long to short, each with the slope of all shorter) | `src/render/seaFine.ts#fillFineWaves` |
| How much a gust roughens the fine waves | `src/render/seaFine.ts#gustRoughening` |
| The gust patches laid into a map around the eye for the sea to draw | `src/render/seaGusts.ts#drawGusts` |
| The share of the sea a wind whitens (Monahan) | `src/render/seaFoam.ts#whitecapShare` |
| Where foam forms in the waves drawn (the bunching that whitens that share) | `src/render/seaFoam.ts#foamLevels` |
| A standard normal quantile | `src/render/seaFoam.ts#normalAbove` |
| The foam's seeded, tiling pattern (lace, breakup, bubbles) | `src/render/seaFoam.ts#foamPattern` |
| The strength lit materials take the sky's environment map at | `src/render/skyView.ts#SkyView` |
| The sea drawn: tiles chosen for the camera each frame, waves and light handed to the shader | `src/render/seaView.ts#SeaView` |
| A game kind's own attribute on the Stage's stand-in mesh | `src/render/materials.ts#standInAttribute` |
