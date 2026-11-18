# The seam index: the one place that does X

Before writing code that does something, look here. If a row covers it, call that place; if the place cannot do what you need, change it there. Never write a second one. A new responsibility gets its row in the same commit that creates it. `npm test` checks that every row points at an export that exists (`tools/guards/discipline.mjs`).

| What | The one place |
| --- | --- |
| Turning the captain's look by a drag | `src/app/look.ts#turn` |
| The direction looked along | `src/app/look.ts#lookDir` |
| Reading the page's address (`?hud`, `?hour=`, `?eye=`, `?wind=`, `?yaw=`, `?pitch=`) | `src/app/params.ts#readParams` |
| Defining a material (every shader the game draws with; the registry is `@futuremagic/stage` Kinds) | `src/render/materials.ts#defineKind` |
| Renderer, scene, camera and the Stage; the share of the device's pixels drawn (render scale) | `src/render/view.ts#createView` |
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
| A wind layer's fine waves (seeded, metres down to half a metre; what they cannot carry is roughness, the rest the ripples') | `src/render/seaFine.ts#makeFineWaves` |
| The fine waves of a moment as the material reads them (long to short, each with the slope of all shorter) | `src/render/seaFine.ts#fillFineWaves` |
| How much a gust roughens the fine waves | `src/render/seaFine.ts#gustRoughening` |
| The gust patches laid into a map around the eye for the sea to draw | `src/render/seaGusts.ts#drawGusts` |
| The share of the sea a wind whitens (Monahan) | `src/render/seaFoam.ts#whitecapShare` |
| Where foam forms in the waves drawn (the bunching that whitens that share) | `src/render/seaFoam.ts#foamLevels` |
| A standard normal quantile | `src/render/seaFoam.ts#normalAbove` |
| The foam's seeded, tiling pattern (lace, breakup, bubbles) | `src/render/seaFoam.ts#foamPattern` |
| The ripples' share of the short waves' slope | `src/render/seaRipples.ts#rippleShare` |
| The ripples' seeded, tiling slope texture (half a metre down to 3.5 cm) | `src/render/seaRipples.ts#ripplePattern` |
| The strength lit materials take the sky's environment map at | `src/render/skyView.ts#SkyView` |
| The sea drawn: tiles chosen for the camera each frame, waves and light handed to the shader | `src/render/seaView.ts#SeaView` |
| A game kind's own attribute on the Stage's stand-in mesh | `src/render/materials.ts#standInAttribute` |
| The brig's measures (Cruizer class, from the Admiralty draught): her midship section, decks, ports, rig sizes | `src/sim/rules/ships.ts#MIDSHIP_SECTION` |
| Her table of offsets: profile, stem, stern, transom, body plan stations | `src/sim/rules/ships.ts#BODY_STATIONS` |
| Her gun ports and the gun in each | `src/sim/rules/ships.ts#PORTS` |
| Her spaces, openings, ladders, doors, fittings, rails and stations (the plan's rules) | `src/sim/rules/ships.ts#SPACES` |
| The body every space is sized for, and the sizes of ways (doors, hatches, ladders) | `src/sim/rules/ships.ts#BODY` |
| What she carries fitted for sea, and timber densities | `src/sim/rules/ships.ts#LOADS` |
| Her moulded half-breadth at a height | `src/sim/ship/section.ts#halfBreadth` |
| Her section's outline by girth, planked or ceiled | `src/sim/ship/section.ts#sectionOutline` |
| Ship space: heights above her base, metres forward of the mainmast | `src/sim/ship/section.ts#shipY` |
| The weather deck's height across her (its camber) | `src/sim/ship/section.ts#deckY` |
| The simulation's fixed step (30 a second) | `src/sim/units.ts#STEP_SECONDS` |
| Her floating: one step of heave, pitch and roll on the sea, pushed by the water's pressure on her hull, pulled by her weight and heeled by her sails; her heading and way from the sailing model | `src/sim/ship/motion.ts#stepMotion` |
| How she goes, as the sailing model hands it to her floating: heading, way ahead and leeway, the sails' heeling moment | `src/sim/ship/motion.ts#Way` |
| The way of a ship lying still with no sail (the slice) | `src/sim/ship/motion.ts#lyingStill` |
| Putting her on the water still, at the draught's waterline and trim | `src/sim/ship/motion.ts#startMotion` |
| Her body afloat: pressure points, mass, centre of gravity, inertia | `src/sim/ship/motion.ts#shipBody` |
| Her rotation at a pose (ship space to the world) | `src/sim/ship/motion.ts#poseRotation` |
| A point of ship space in the world at her pose | `src/sim/ship/motion.ts#toWorld` |
| Where ship space's origin stands at her pose (where a drawing of her is placed) | `src/sim/ship/motion.ts#shipOrigin` |
| Her pose between two steps, for drawing | `src/sim/ship/motion.ts#poseBetween` |
| A smooth curve through readings that never overshoots (monotone cubic) | `src/sim/curve.ts#monotoneCurve` |
| A straight-line curve through readings | `src/sim/curve.ts#linearCurve` |
| Her moulded half-breadth anywhere on her hull (the fair surface through the table of offsets) | `src/sim/ship/hull.ts#hullHalfBreadth` |
| Her hull's ends at a height (stem, sternpost, counter) | `src/sim/ship/hull.ts#hullEnds` |
| The lowest height of her hull at a place along her | `src/sim/ship/hull.ts#hullBottom` |
| Her keel's underside along her | `src/sim/ship/hull.ts#keelBottom` |
| The sheer: the weather deck at her side along her | `src/sim/ship/hull.ts#sheer` |
| The top of her side along her | `src/sim/ship/hull.ts#sideTop` |
| The weather deck's height anywhere (sheer and camber) | `src/sim/ship/hull.ts#weatherDeck` |
| The underside of the weather deck's planking | `src/sim/ship/hull.ts#weatherDeckUnderside` |
| The draught's sloping load waterline | `src/sim/ship/hull.ts#designWaterline` |
| Her displaced volume below a waterline | `src/sim/ship/hull.ts#displacedVolume` |
| Her centre of buoyancy along her below a waterline | `src/sim/ship/hull.ts#buoyancyAlong` |
| Simpson's rule: points and weights | `src/sim/ship/hull.ts#simpsonPoints` |
| Her hull as one closed surface | `src/sim/ship/hull.ts#hullMesh` |
| The brig's plan, built once: spaces, openings, ways, bulkheads, guns, pins, crew places, stations, mast steps, damage cells | `src/sim/ship/plan.ts#shipPlan` |
| The berth deck's height along her | `src/sim/ship/plan.ts#berthDeck` |
| A space's floor at a place | `src/sim/ship/plan.ts#floorAt` |
| The underside of what is over a space (headroom) | `src/sim/ship/plan.ts#overheadAt` |
| The inside of her side at a place and height | `src/sim/ship/plan.ts#insideBreadth` |
| Every floor under a place, lowest first (what the walker stands on) | `src/sim/ship/plan.ts#floorsUnder` |
| Her girth on one side at a place along her | `src/sim/ship/plan.ts#sectionGirth` |
| The one walk graph for a body: where it can stand, and the ways that fit it | `src/sim/ship/walk.ts#walkGraph` |
| The node of the walk graph a spot stands on | `src/sim/ship/walk.ts#nodeAt` |
| What a body can reach from a node | `src/sim/ship/walk.ts#reachable` |
| Her timber's weight from the plan | `src/sim/ship/weight.ts#structure` |
| Her whole weight fitted for sea and its centre | `src/sim/ship/weight.ts#shipWeight` |
| Tonnes of sea water a volume displaces | `src/sim/ship/weight.ts#displacementTonnes` |
| The plan's drawings (lines, decks, walk graph) | `tools/plan/draw.ts#lines` |
| Where one stands on her (and off her), and the look from there | `src/app/standpoints.ts#STANDPOINTS` |
| The standpoints' buttons | `src/app/standpointBar.ts#showStandpoints` |
| Vertices gathered and handed to the GPU as one geometry | `src/render/ship/gathered.ts#Gathered` |
| Her solid parts' vertices (finish, grain, occlusion, wear) | `src/render/ship/solid.ts#Solid` |
| A finished timber or plate with rounded edges | `src/render/ship/shapes.ts#box` |
| A turned part (mast, hoops, ring bolts) | `src/render/ship/shapes.ts#lathe` |
| A round bar between two points | `src/render/ship/shapes.ts#rod` |
| A curved surface from rows of points (hull, decks, ceiling), cells into one solid or one per zone | `src/render/ship/shapes.ts#sheet` |
| A profile swept along her (rail, waterway) | `src/render/ship/shapes.ts#sweep` |
| A rounded oblong's profile for a sweep | `src/render/ship/shapes.ts#roundedProfile` |
| The unit direction between two points | `src/render/ship/shapes.ts#direction` |
| Rope as tubes round centre lines | `src/render/ship/rope.ts#Ropes` |
| A rope hanging between two points | `src/render/ship/rope.ts#hanging` |
| Her paint and the tints of her timber | `src/render/ship/looks.ts#BLACK` |
| Loading the fittings pack made in AssetGenerator | `src/render/ship/fittings.ts#loadFittings` |
| Placing a fitting into her solids, slot by slot | `src/render/ship/fittings.ts#place` |
| The whole ship built: hull, decks, rooms, guns, lower rigs, the far ship, her lights and portals (N2.4) | `src/render/ship/ship.ts#buildShip` |
| Where the sky comes in below deck, per zone | `src/render/ship/ship.ts#skyOpenings` |
| Building the ship in a worker at load | `src/render/ship/loadShip.ts#loadShip` |
| Every buffer of a build, to send it without a copy | `src/render/ship/ship.ts#shipBuffers` |
| A build's typed arrays made into a geometry | `src/render/ship/gathered.ts#geometryOf` |
| Her zones: which spaces are drawn together, the outside | `src/render/ship/zones.ts#zoneOfSpaces` |
| The zone a place in her lies in | `src/render/ship/zones.ts#zoneAt` |
| The zone under a place on a deck | `src/render/ship/zones.ts#zoneUnder` |
| The portals between zones (deck openings, doors) | `src/render/ship/zones.ts#portals` |
| The openings through one deck | `src/render/ship/zones.ts#openingsOn` |
| The middle of an oblong of the plan | `src/render/ship/zones.ts#rectCentre` |
| Which zones can be seen from the eye (portals on screen) | `src/render/ship/visibility.ts#Visibility` |
| Each zone's solids and ropes, and her doors | `src/render/ship/parts.ts#ShipParts` |
| Her outside: bands of planking, wales, copper, keel, stem, transom | `src/render/ship/hullSide.ts#buildOutside` |
| Her bulwarks: the inside face, ports, lids, rail, waterway | `src/render/ship/hullSide.ts#buildBulwarks` |
| Where the deck meets her side at her ends | `src/render/ship/hullSide.ts#deckEnds` |
| Her side's outside and inside lines (planking, bulwark, ceiling) | `src/render/ship/hullSide.ts#outsideX` |
| A port lid's lower edge (its lanyard's end) | `src/render/ship/hullSide.ts#lidEdge` |
| Places along her for rows, cut at given places | `src/render/ship/hullSide.ts#rowsAlong` |
| The weather deck and its underside, per zone | `src/render/ship/decks.ts#buildWeatherDeck` |
| A deck's planking cut for holes, and its underside per zone | `src/render/ship/decks.ts#deckCells` |
| The deck beams, knees and carlings | `src/render/ship/decks.ts#buildDeckBeams` |
| The weather deck's openings: coamings, gratings, the companion, the skylight | `src/render/ship/decks.ts#buildDeckOpenings` |
| The masts' partners on the weather deck | `src/render/ship/decks.ts#buildPartners` |
| Her rooms: floors, ceiling, bulkheads, doors, ladders, lanterns | `src/render/ship/rooms.ts#buildRooms` |
| Her damage map's layout (N6.5 writes into it) | `src/render/ship/damageMap.ts#DAMAGE_REGIONS` |
| Where a point of a damaged surface lies in the damage map | `src/render/ship/damageMap.ts#damageTexel` |
| Her lower rigs: masts, tops, channels, deadeyes, shrouds, ratlines, pin rails, coils | `src/render/ship/rig.ts#buildRigs` |
| The timber's grain, pores and grime as one texture | `src/render/ship/grain.ts#makeGrainTexture` |
| Her timber's shader: grain, planks, seams, paint, wear, grime | `src/render/ship/shipMaterials.ts#makeWoodMaterial` |
| Her iron, copper, lantern glow and rope shaders | `src/render/ship/shipMaterials.ts#makeRopeMaterial` |
| What her shaders read each frame (lanterns, sky openings, glow, time) | `src/render/ship/shipMaterials.ts#SHIP_INPUTS` |
| Her half-breadth and deck height in a shader | `src/render/ship/hullNode.ts#hullAt` |
| No water drawn inside her hull | `src/render/seaCut.ts#seaCut` |
| The ship drawn and riding the sea, the eye carried with her, the zones seen, the far ship crossfaded, her doors swung | `src/render/ship/shipView.ts#ShipView` |
| The sun's shadow map round her | `src/render/ship/shipView.ts#shadowingSun` |
| Every knob that trades looks for frame time, by quality level (a package that costs frame time adds its knob here) | `src/app/quality.ts#QUALITY_LEVELS` |
| Choosing the quality level from measured frame time in the first seconds (`?quality=` fixes one) | `src/app/quality.ts#QualityChooser` |
| The triangles of a sea tile's grid at a density (every second or fourth vertex of the densest) | `src/render/seaGrid.ts#seaTileTriangles` |
| The densities a sea tile's grid can be drawn at | `src/render/seaGrid.ts#seaCellChoices` |
| A wind speed's force on the Beaufort scale, with fractions (`beaufortSpeed` backwards) | `src/sim/rules/beaufort.ts#beaufortForce` |
| The sea's and the wind's sound as data: beds by sea force and wind speed, their gains and glides, the slaps and when each is heard (the takes and their prompts: tools/sound/sounds.json) | `src/audio/tuning.ts#SEA_BEDS` |
| The force of the sea as its wave layers show it (what its sound follows) | `src/audio/ambience.ts#seaForce` |
| Every ambience bed's level now: sea, wind and the swell's surge | `src/audio/ambience.ts#bedLevels` |
| Beds along a scale crossfading at equal power | `src/audio/ambience.ts#anchorWeights` |
| A bed's two takes blended by a slow seeded swing (no loop heard) | `src/audio/ambience.ts#takeAngle` |
| The sea's RMS height at a moment | `src/audio/slaps.ts#seaRms` |
| Which sound a crest makes at a force of the sea (lap, slap, crest, burst) | `src/audio/slaps.ts#slapKind` |
| Slaps and crests placed near the listener where crests pass | `src/audio/slaps.ts#SlapWatch` |
| The sea and the wind heard: the sound engine, the listener's ears, muffling under water and below deck | `src/audio/seaSound.ts#SeaSound` |
| Plain data to bytes and back, canonical and exact (the state, orders and events as they travel and are saved) | `src/sim/codec.ts#encode` |
| Bytes back to plain data, bit for bit | `src/sim/codec.ts#decode` |
| A 64-bit hash of bytes, for comparing machines | `src/sim/codec.ts#hashBytes` |
| The hash of a plain value (of its canonical bytes) | `src/sim/codec.ts#hashOf` |
| The match as one value: seed, clock, wind, sea, ships | `src/sim/state.ts#SimState` |
| Starting a match from its seed, wind and the ships' places | `src/sim/state.ts#startMatch` |
| The shared clock of a state, s (from its count of steps) | `src/sim/state.ts#simTime` |
| A state as bytes, and back | `src/sim/state.ts#encodeState` |
| The state's hash (two machines with the same hash have the same state) | `src/sim/state.ts#hashState` |
| One step of the match: orders in, the next state and events out | `src/sim/step.ts#step` |
| What a ship can be ordered (for now, each taken at once: a course and which way to turn to it, a canvas, a mast's yards aback) | `src/sim/step.ts#Order` |
| What happened in a step (for drawing, sound and the interface) | `src/sim/step.ts#SimEvent` |
| Running a match on through a log of orders (a guest, a replay, the tests) | `src/sim/replay.ts#replay` |
| The knot in m/s | `src/sim/units.ts#KNOT` |
| The bench's flight: where the eye is at a moment of it | `src/app/bench.ts#benchPose` |
| A percentile of sorted measurements | `src/app/bench.ts#percentile` |
| Frame times summed up as the budget reads them (percentiles, worst, on time, hitches) | `src/app/bench.ts#frameStats` |
| The bench on the page: flying, measuring, the result on screen | `src/app/benchRun.ts#BenchRun` |
| The built game in a headless browser (for screenshots) | `tools/shot/browser.mjs#openGame` |
| The standard sea shots (times of day × seas × eye heights), each scene set on one page by main.ts's `window.__nautaScene` | `tools/shot/sea.mjs#seaShots` |
| The rig's measures: masts, yards, booms, the heights yards hang at, how far they brace (Steel's brig, estimated) | `src/sim/rules/rig.ts#MAST_SPARS` |
| Her sails' cuts and reefs | `src/sim/rules/rig.ts#SAILS` |
| What each kind of line is and does (standing or running, diameter, its act) | `src/sim/rules/rig.ts#LINE_KINDS` |
| Which rail each running line belays on | `src/sim/rules/rig.ts#BELAYING` |
| The climb aloft's limits (ratline rise, footrope ends, spar slope) | `src/sim/rules/rig.ts#CLIMB` |
| A mast's heights and its spars' axes (rake, doublings) | `src/sim/ship/spars.ts#mastGeometry` |
| Her spars placed in her, each a chain of segments between the places it breaks | `src/sim/ship/spars.ts#buildSpars` |
| A point on a spar, and at a named mark of it | `src/sim/ship/spars.ts#onSpar` |
| The point at a spar's named mark | `src/sim/ship/spars.ts#atMark` |
| An entry of a list by its name (a mark, a corner) | `src/sim/ship/spars.ts#named` |
| A point a share of the way between two points of the rig | `src/sim/ship/spars.ts#between` |
| The distance between two points of the rig | `src/sim/ship/spars.ts#distance` |
| Her deadeyes: channels, backstay stools, the tops' rims | `src/sim/ship/spars.ts#buildDeadeyes` |
| Her sails: corners, what they are bent to, their shapes | `src/sim/ship/sails.ts#buildSails` |
| A sail's area as it stands (furled, reefed, set) | `src/sim/ship/sails.ts#sailArea` |
| The ways a sail can stand | `src/sim/ship/sails.ts#sailSettings` |
| A sail's named corner | `src/sim/ship/sails.ts#corner` |
| A point on a sail's edge (a leech's middle, a reef cringle) | `src/sim/ship/sails.ts#edgePoint` |
| Sailing: one step of a ship under sail in the true wind (sails by the apparent wind, the crew's trim and bracing, hull, rudder, helmsman, tacking, wearing, missing stays), her way and her sails' heel out | `src/sim/ship/sailing.ts#stepSailing` |
| A ship under sail at the start (heading, way, canvas, yards trimmed) | `src/sim/ship/sailing.ts#startSailing` |
| Telling the helmsman a heading and which way to turn to it | `src/sim/ship/sailing.ts#steerTo` |
| Setting a ship's canvas | `src/sim/ship/sailing.ts#setCanvas` |
| Which sails a canvas sets in a wind, reefed for it | `src/sim/ship/sailing.ts#canvasFor` |
| Laying a mast's yards aback, or filling them | `src/sim/ship/sailing.ts#layAback` |
| How each sail stands this moment (area, brace or sheet, pressure, aback, shivering), for drawing and sound | `src/sim/ship/sailing.ts#sailsStanding` |
| The sailing model's tuning: sail polars, hull and rudder, helmsman, bracing, canvas settings and reefs, heel limit, the speed table | `src/sim/rules/sailing.ts#SPEED_TABLE` |
| The stays | `src/sim/ship/lines.ts#buildStays` |
| The standing rigging: shrouds, futtock shrouds, backstays, slings, the bowsprit's | `src/sim/ship/lines.ts#buildStanding` |
| The running rigging, each line on a pin of its own | `src/sim/ship/lines.ts#buildRunning` |
| The shroud climbs of each mast in ship space (`@futuremagic/figure` ladders, the futtock stave at the gait) | `src/sim/ship/aloft.ts#buildClimbs` |
| The surfaces and ways aloft, the stations and crew places there | `src/sim/ship/aloft.ts#buildAloft` |
| A yard's footrope as the climb takes it | `src/sim/ship/aloft.ts#footropeOf` |
| The walk graph with the rig joined to it | `src/sim/ship/aloft.ts#walkAloft` |
| The brig's rig plan, built once: spars, deadeyes, sails, every line, climbs, surfaces, ways | `src/sim/ship/rig.ts#rigPlan` |
| The one walk graph of decks and rig together (what the captain and crew go by) | `src/sim/ship/rig.ts#rigWalk` |
| A spar of the rig by id | `src/sim/ship/rig.ts#sparOf` |
| A station's crew place | `src/sim/ship/plan.ts#stationPlace` |
| Freezing a plan built once | `src/sim/ship/plan.ts#deepFreeze` |
| The rig's drawings (sail plan, rigging plan) | `tools/plan/draw.ts#sailPlan` |
