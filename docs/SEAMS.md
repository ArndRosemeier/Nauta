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
| How far apart two points are on the water (in plan) | `src/sim/units.ts#apartOnWater` |
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
| The version's history on a sheet (what's new), and whether this version is unseen on the device | `src/app/whatsNew.ts#openWhatsNew` |
| The wave sets that show at a moment and how strongly (the swell, then each wind layer by its weight) | `src/sim/sea/sea.ts#forEachShownSet` |
| The earth's curve: how far a point at a distance sinks below the eye's sea level (the horizon, hull-down) | `src/render/earth.ts#earthDrop` |
| How far the horizon lies from an eye at a height | `src/render/earth.ts#horizonDistance` |
| The sea mesh's tiles around the eye: which, where and how big | `src/render/seaGrid.ts#seaTiles` |
| The side of a sea tile of a level | `src/render/seaGrid.ts#seaTileSize` |
| How far from the eye a level of sea tiles reaches | `src/render/seaGrid.ts#seaLodRange` |
| How far a sea vertex has slid onto the next coarser grid (the vertex stage does the same) | `src/render/seaGrid.ts#seaMorph` |
| How far out the sea is drawn for an eye height | `src/render/seaGrid.ts#seaReach` |
| The sea's waves at a moment as the vertex stage reads them (weighted, phases near the eye) | `src/render/seaWaves.ts#fillSeaWaves` |
| The sea's shader: the grid displaced by the simulated waves and the fine bands, foam's bunching now and a few seconds ago, and the water's look per pixel (sky reflection, sun and moon glitter, deep colour, light through crests, gusts, foam, haze, the view from below) | `src/render/seaMaterial.ts#makeSeaMaterial` |
| Handing the sea the light rig's environment map (its reflections and the sky's light on the water) | `src/render/seaMaterial.ts#useSeaSky` |
| Handing the sea its fine bands (the textures its shader reads) | `src/render/seaMaterial.ts#useFineSea` |
| The deep around an eye under water | `src/render/seaMaterial.ts#makeDeepMaterial` |
| How rough the sea is in a wind (Cox and Munk's mean square slope, glassy in a calm) | `src/render/seaFine.ts#seaRoughness` |
| The slope a wave set carries | `src/render/seaFine.ts#slopeVariance` |
| What the fine waves carry of the roughness | `src/render/seaFine.ts#fineSlope` |
| A short wave's frequency (deep water and surface tension) | `src/render/seaFine.ts#fineOmega` |
| The fine sea's bands: how many, their tiles and the wavelengths each holds | `src/render/seaFine.ts#bandLayout` |
| The bands' fixed tables for the GPU (wavenumbers, frequencies, the spectrum's fixed part, seeded noise) | `src/render/seaFine.ts#bandTables` |
| The cos-2s spread's normalisation | `src/render/seaFine.ts#spreadNorm` |
| A wind layer's fine waves (their spectrum's level, where they begin, the slope each band and the ripples carry) | `src/render/seaFine.ts#fineLayer` |
| The fine sea of a moment (its two strongest layers, weighted in energy) | `src/render/seaFine.ts#fineFrame` |
| The fine sea on the GPU: the spectrum turned into waves each frame (FFT in workgroup memory), shape and slope textures per band, the foam a fold leaves | `src/render/seaBands.ts#BandSet` |
| Every band set the quality levels need, the one drawn, and the texture nodes the sea's shader reads | `src/render/seaBands.ts#FineSea` |
| The moment's fine sea written into the GPU passes' inputs | `src/render/seaBands.ts#setBandInputs` |
| How much a gust roughens the fine waves | `src/render/seaFine.ts#gustRoughening` |
| The gust patches laid into a map around the eye for the sea to draw | `src/render/seaGusts.ts#drawGusts` |
| The share of the sea a wind whitens (Monahan) | `src/render/seaFoam.ts#whitecapShare` |
| Where foam forms in the waves drawn (the bunching that whitens that share) | `src/render/seaFoam.ts#foamLevels` |
| The variance of the simulated waves' bunching | `src/render/seaFoam.ts#bunchVariance` |
| How many deviations deep the bunching must go to turn white (per pixel, with the bands') | `src/render/seaFoam.ts#foamDepth` |
| A standard normal quantile | `src/render/seaFoam.ts#normalAbove` |
| The foam's seeded, tiling pattern (lace, breakup, bubbles) | `src/render/seaFoam.ts#foamPattern` |
| The ripples' share of the short waves' slope | `src/render/seaRipples.ts#rippleShare` |
| The ripples' seeded, tiling slope texture (half a metre down to 3.5 cm) | `src/render/seaRipples.ts#ripplePattern` |
| The strength lit materials take the sky's environment map at | `src/render/skyView.ts#SkyView` |
| The sea drawn: tiles chosen for the camera each frame, waves and light handed to the shader | `src/render/seaView.ts#SeaView` |
| A texture that tiles (repeat, mipmaps, anisotropic filtering) | `src/render/tiling.ts#tiling` |
| A game kind's own attribute on the Stage's stand-in mesh | `src/render/materials.ts#standInAttribute` |
| The brig's measures (Cruizer class, from the Admiralty draught): her midship section, decks, ports, rig sizes | `src/sim/rules/ships.ts#MIDSHIP_SECTION` |
| Her table of offsets: profile, stem, stern, transom, body plan stations | `src/sim/rules/ships.ts#BODY_STATIONS` |
| Her gun ports and the gun in each | `src/sim/rules/ships.ts#PORTS` |
| Where her quarterdeck and forecastle break from the waist, how high they stand and their rails (N2.12) | `src/sim/rules/ships.ts#BREAKS` |
| Whether a place along her is on a raised deck | `src/sim/rules/ships.ts#onRaisedDeck` |
| The ladders up her breaks, one a side | `src/sim/rules/ships.ts#BREAK_LADDERS` |
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
| A world point in ship space at her pose | `src/sim/ship/motion.ts#toShip` |
| Where ship space's origin stands at her pose (where a drawing of her is placed) | `src/sim/ship/motion.ts#shipOrigin` |
| Her pose between two steps, for drawing | `src/sim/ship/motion.ts#poseBetween` |
| A smooth curve through readings that never overshoots (monotone cubic) | `src/sim/curve.ts#monotoneCurve` |
| A straight-line curve through readings | `src/sim/curve.ts#linearCurve` |
| Her moulded half-breadth anywhere on her hull (the fair surface through the table of offsets) | `src/sim/ship/hull.ts#hullHalfBreadth` |
| Her hull's ends at a height (stem, sternpost, counter) | `src/sim/ship/hull.ts#hullEnds` |
| The lowest height of her hull at a place along her | `src/sim/ship/hull.ts#hullBottom` |
| Her keel's underside along her | `src/sim/ship/hull.ts#keelBottom` |
| The sheer: the weather deck at her side along her (raised on the quarterdeck and forecastle) | `src/sim/ship/hull.ts#sheer` |
| Her hull's own sheer: the waist's deck at her side, carried fore and aft under the raised decks (wales, chain plates) | `src/sim/ship/hull.ts#waistDeck` |
| The top of her side along her (lowered in the waist, N2.10; raised with the quarterdeck and forecastle, N2.12) | `src/sim/ship/hull.ts#sideTop` |
| Whether a place along her is in the waist, between the breaks of her raised decks | `src/sim/ship/hull.ts#inWaist` |
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
| The clear height over a floor at a place, the beams or a fitting hanging lower (what a man stoops under) | `src/sim/ship/plan.ts#headroomAt` |
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
| A sheet turned to face a way (whatever order its rows come in) | `src/render/ship/shapes.ts#facing` |
| A profile swept along her (rail, waterway) | `src/render/ship/shapes.ts#sweep` |
| A rounded oblong's profile for a sweep | `src/render/ship/shapes.ts#roundedProfile` |
| The unit direction between two points | `src/render/ship/shapes.ts#direction` |
| Rope as tubes round centre lines | `src/render/ship/rope.ts#Ropes` |
| A rope hanging between two points | `src/render/ship/rope.ts#hanging` |
| A line of the rig between two points, sagging across its chord | `src/render/ship/rope.ts#sagging` |
| Which moving frames a piece of rope follows (hull, a turning spar, or between two) | `src/render/ship/rope.ts#legFollow` |
| Her paint and the tints of her timber | `src/render/ship/looks.ts#BLACK` |
| The red boards of her bulwarks' inside, her stern and her breaks | `src/render/ship/looks.ts#BULWARK_BOARDS` |
| Loading the fittings pack made in AssetGenerator | `src/render/ship/fittings.ts#loadFittings` |
| Placing a fitting into her solids, slot by slot | `src/render/ship/fittings.ts#place` |
| The whole ship built: hull, decks, rooms, guns, masts and rigging, the far ship, her lights and portals (N2.4, N3.6) | `src/render/ship/ship.ts#buildShip` |
| Where the sky comes in below deck, per zone | `src/render/ship/ship.ts#skyOpenings` |
| Building the ship in a worker at load | `src/render/ship/loadShip.ts#loadShip` |
| Every buffer of a build, to send it without a copy | `src/render/ship/ship.ts#shipBuffers` |
| A build's typed arrays made into a geometry | `src/render/ship/gathered.ts#geometryOf` |
| A piece of a mesh named so its triangles can be told apart later (a spar that can fall, N6.5) | `src/render/ship/gathered.ts#Gathered` (tagged) |
| Her zones: which spaces are drawn together, the outside | `src/render/ship/zones.ts#zoneOfSpaces` |
| The zone a place in her lies in | `src/render/ship/zones.ts#zoneAt` |
| The zone under a place on a deck | `src/render/ship/zones.ts#zoneUnder` |
| The portals between zones (deck openings, doors) | `src/render/ship/zones.ts#portals` |
| The openings through one deck | `src/render/ship/zones.ts#openingsOn` |
| The middle of an oblong of the plan | `src/sim/ship/plan.ts#rectCentre` |
| Which zones can be seen from the eye (portals on screen) | `src/render/ship/visibility.ts#Visibility` |
| Each zone's solids and ropes, and her doors | `src/render/ship/parts.ts#ShipParts` |
| Her outside: bands of planking, wales, copper, keel, stem, sternpost | `src/render/ship/hullSide.ts#buildOutside` |
| Her stern: the stern board outside (windows, moulding, quarter pieces), its inside up from the deck's end, her bulwarks carried aft to it, the taffrail | `src/render/ship/stern.ts#buildStern` |
| Her rudder on the sternpost, its pintles and gudgeons | `src/render/ship/stern.ts#buildRudder` |
| Her rudder's frame put over by her helm | `src/render/ship/stern.ts#rudderMatrix` |
| Her bulwarks: the inside face, ports, lids, rail, waterway | `src/render/ship/hullSide.ts#buildBulwarks` |
| Where the deck meets her side at her ends | `src/render/ship/hullSide.ts#deckEnds` |
| Her side's outside and inside lines (planking, bulwark, ceiling) | `src/render/ship/hullSide.ts#outsideX` |
| A port lid's lower edge when up (its lanyard's end) | `src/render/ship/gunPlaces.ts#lidEdge` |
| Places along her for rows, cut at given places | `src/render/ship/hullSide.ts#rowsAlong` |
| The weather deck and its underside, per zone; the faces of her breaks and their breast rails | `src/render/ship/decks.ts#buildWeatherDeck` |
| Rows along her either side of each break, and whether two rows cross one (her deck steps there) | `src/render/ship/hullSide.ts#BREAK_ROWS` |
| A deck's planking cut for holes, and its underside per zone | `src/render/ship/decks.ts#deckCells` |
| The deck beams, knees and carlings | `src/render/ship/decks.ts#buildDeckBeams` |
| The weather deck's openings: coamings, gratings, the companion, the skylight | `src/render/ship/decks.ts#buildDeckOpenings` |
| The masts' partners on the weather deck | `src/render/ship/decks.ts#buildPartners` |
| Her rooms: floors, ceiling, bulkheads, doors, ladders, lanterns | `src/render/ship/rooms.ts#buildRooms` |
| Her damage map's layout (N6.5 writes into it) | `src/render/ship/damageMap.ts#DAMAGE_REGIONS` |
| Where a point of a damaged surface lies in the damage map | `src/render/ship/damageMap.ts#damageTexel` |
| The marks a ship's damage leaves on her damage map: holes inside and out, panels stove in, bulwarks and rails smashed out, decks charred by her fires (N6.5) | `src/render/ship/damageMarks.ts#HullMarks` |
| The holes and splits a ship's damage leaves in her sails' hole map (N6.5) | `src/render/ship/damageMarks.ts#SailMarks` |
| One ship's damage written into her blocks of the damage maps, and whether she must draw holed | `src/render/ship/damageView.ts#DamageView` |
| A ship's damage drawn as the match has it, her outside and sails holed once cut (N6.5) | `src/render/ship/shipView.ts#ShipView` |
| The daylight seen through a shot hole from inside her | `src/render/ship/shipMaterials.ts#lightThrough` |
| A stand-in for a fight's damage to look at (`?scars=3`) | `src/app/scars.ts#scarsOf` |
| Her masts and rigging from the rig plan: spars, deadeyes, channels, every line, pins and coils (N3.6) | `src/render/ship/rig.ts#buildRigs` |
| Her spars turned from the spar table: masts, tops, trestle and cross trees, caps, yards, bowsprit, jib-boom, boom, gaff | `src/render/ship/masts.ts#drawSpars` |
| Every line of the rig plan drawn by its sag, with its blocks, ratlines, futtock staves, footropes and stirrups | `src/render/ship/rigging.ts#buildRigging` |
| Her spars that turn (yards, boom, gaff) as moving frames: pivot, axis, limit | `src/render/ship/swings.ts#swingsOf` |
| Every spar's moving frame, the standing spars' after the sails' points (N6.5) | `src/render/ship/swings.ts#sparFramesOf` |
| How a broken spar goes over the side: what it takes, the break, where it comes to lie | `src/render/ship/wreck.ts#fallShape` |
| The wreck's matrix: falling, lying alongside, cut away and drifting astern | `src/render/ship/wreck.ts#wreckMatrix` |
| The triangles a fall takes out of her outside, and what is left | `src/render/ship/wreck.ts#takeFallen`, `keptIndex` |
| Her spars drawn going over the side and what is made fast to them (N6.5) | `src/render/ship/shipView.ts#ShipView.showDamage` (showFalls, moveWrecks) |
| A turning spar's frame from its brace or swing angle and hoist | `src/render/ship/swings.ts#swingMatrix` |
| A point of the rig plan in ship space | `src/render/ship/swings.ts#shipPoint` |
| Handing the moving frames to the rope shader | `src/render/ship/shipMaterials.ts#setShipFrame` |
| A sail's shape from its numbers (belly, shiver, breathing, folds gathered, rolled on its yard, a reef rolled) and a flag's, on the CPU: the one the sail shader mirrors (N3.10) | `src/render/ship/sailForm.ts#clothAt` |
| How each sail is drawn, from the rig plan: corners, the spars that carry them, belly shape, folds | `src/render/ship/sailForm.ts#sailForms` |
| The points of a sail lines are made fast to, each with its own moving frame | `src/render/ship/sailForm.ts#sailPoints` |
| The sails' and flags' grids, with seams, reef bands, edges and the hole map's place per vertex | `src/render/ship/sailGrid.ts#buildSailGrids` |
| The sails' hole map: each sail's place in it (for N6.5) | `src/render/ship/sailGrid.ts#sailAtlas` |
| The sails' shader: shaped on the GPU, canvas, flags, sunlight through the cloth | `src/render/ship/sailMaterial.ts#makeSailMaterial` |
| Her sails as drawn this frame: set and furled seen happening, belly and shiver eased, the yards' hoists, the flags in the true wind, the frames of the lines to the sails | `src/render/ship/sailsView.ts#SailsView` |
| How a ship's sails stand in a match's state, for the drawing | `src/app/sailsSeen.ts#sailsSeen` |
| A data texture read texel by texel | `src/render/ship/shipMaterials.ts#nearest` |
| A data texture's filtering (texel by texel or blended), ready to upload | `src/render/dataTexture.ts#filtered` |
| The far ship's crossfade: where a mesh is not drawn | `src/render/ship/shipMaterials.ts#crossfadeMask` |
| The timber's grain, pores and grime as one texture | `src/render/ship/grain.ts#makeGrainTexture` |
| Her timber's shader: grain, planks, seams, paint, wear, grime | `src/render/ship/shipMaterials.ts#makeWoodMaterial` |
| Her iron, copper, lantern glow and rope shaders | `src/render/ship/shipMaterials.ts#makeRopeMaterial` |
| What her shaders read each frame (lanterns, sky openings, glow, time) | `src/render/ship/shipMaterials.ts#SHIP_INPUTS` |
| Her half-breadth and deck height in a shader (none beyond her ends) | `src/render/ship/hullNode.ts#hullAt` |
| No water drawn inside her hull | `src/render/seaCut.ts#seaCut` |
| The ship drawn and riding the sea, the eye carried with her, the zones seen, the far ship crossfaded, her doors swung, her yards braced and hoisted and her boom and gaff swung (`setBrace`, `setHoist`; N3.3 drives them), her rudder put over (`setRudder`) | `src/render/ship/shipView.ts#ShipView` |
| A ship's water kept for her wake and spray, however she is laid: her track, her way, the churn at her side (`water`, `bow`) | `src/render/ship/shipView.ts#ShipView` |
| Kelvin's pattern of a moving source on deep water (stationary phase, held at the cusp; the GPU's sums mirror it) | `src/render/wake.ts#kelvinAt` |
| A speed's g/U² (the wake's wavenumber) and U²/2g (the height her waves scale with) | `src/render/wake.ts#kelvinWavenumber` |
| The wake's tuning: her waves, bow wave, foam, strip and slick | `src/render/wake.ts#WAKE` |
| Where she has been: her track, a point a second, with her speed and churn (what the wake is laid along) | `src/render/wake.ts#Track` |
| The water against her side: churn at stations along her waterline, the wet line draining down, slams at her bow | `src/render/wake.ts#ChurnWatch` |
| A ship's wake on the GPU: Kelvin waves along her track, the bow wave and her body's hollow, foam, the slick (two levels around her; one map per ship drawn, `SeaView.wakes`) | `src/render/wakeMap.ts#WakeMap` |
| Each ship's wake inputs, by her index (0 hers, 1 the other captain's) | `src/render/wakeMap.ts#wakeInputs` |
| The one seam the ships' water comes into the sea's shader through: their waves' height, added (vertex stage) | `src/render/wakeMap.ts#wakeHeight` |
| ...and per pixel their slope, and the most of their foam and slick | `src/render/wakeMap.ts#wakeSurface` |
| Handing the sea the ships' wake maps | `src/render/seaMaterial.ts#useWake` |
| A ship's side wet where the sea has climbed it, draining down in streaks, from her own stations (her timber's and copper's shaders, either ship) | `src/render/wakeMap.ts#wetHull` |
| The light a matte, level surface sends back (the sea's body, the deep, spray) | `src/render/seaMaterial.ts#daylight` |
| Spray thrown from her bow when she slams and at speed, and the column a ball throws where it falls in the sea: drops flown on the GPU | `src/render/spray.ts#SprayView` |
| Where a thing flung into the air is after a time, slowed toward the wind and pulled down (the GPU's flight of spray, puffs and splinters) | `src/render/spray.ts#flown` |
| A quad facing the eye: its geometry, and its corner in clip space (spray, gunfire) | `src/render/spray.ts#facingEye` |
| The one quad geometry many instances facing the eye draw | `src/render/spray.ts#eyeQuad` |
| A ring of starts moved by the floating origin's step | `src/render/spray.ts#shiftStarts` |
| A ring of flown quads kept up each frame: the clock and wind into its inputs, its starts following the sea's origin, its meshes placed | `src/render/spray.ts#keepFlown` |
| The mesh of a ring of flown quads (never culled, drawn in its order among the see-through) | `src/render/spray.ts#flownMesh` |
| The material of flown quads: see-through, no depth written, blended as usual or premultiplied (fire adds, smoke covers) | `src/render/spray.ts#flownMaterial` |
| A flown quad's age from its start's time, and its corner handed to the fragment stage (TSL) | `src/render/spray.ts#ageOf` |
| The spray's shader | `src/render/spray.ts#makeSprayMaterial` |
| The ship-and-water check's pictures (sailed by a match: rail, bowsprit, astern, 50 m off, above, berth deck) | `tools/shot/ship.mjs#shipShots` |
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
| The sea and the wind heard: the sound engine, the listener's ears, muffling under water and through the room the ear is in | `src/audio/seaSound.ts#SeaSound` |
| The `n`th seeded draw of a stream (the sound watches' draws) | `src/audio/slaps.ts#seededDraw` |
| The ship's own sound as data: creaks, the counter's slap, the water along her, below deck's muffle and echo, footsteps (the takes and their prompts: tools/sound/sounds.json) | `src/audio/shipTuning.ts#CREAK_WORK` |
| The room the ear is in: open air on deck, below deck muffled by how near an opening to the sky is, its echo | `src/audio/acoustics.ts#roomAt` |
| A space and the spaces open to it, as one room | `src/audio/acoustics.ts#roomSpaces` |
| A room's echo time by Sabine's rule from the plan | `src/audio/acoustics.ts#roomT60` |
| The distance in plan from a place to an oblong | `src/audio/acoustics.ts#distanceToRect` |
| How hard she works in a frame (the change of her roll and pitch rates) | `src/audio/creaks.ts#workOf` |
| Her timber creaking as she works, placed in her near the ear | `src/audio/creaks.ts#CreakWatch` |
| The sea slapping up under her counter | `src/audio/counter.ts#CounterWatch` |
| The water along her sides (on deck from over each side, below deck from inside her planking) by its flow | `src/audio/hullWater.ts#HullWater` |
| The water's speed along her side from her way and the sea's rise and fall against it | `src/audio/hullWater.ts#flowOf` |
| The captain's footfalls as his body's soles come down, and on ladder treads | `src/audio/footsteps.ts#Footsteps` |
| The brig herself heard: her sounds played, the room returned for the sea's | `src/audio/shipSound.ts#ShipSound` |
| The crew's sound as data: the boatswain's call for each kind of order and what follows, feet, hauling, the bell, the drum (the takes: tools/sound/sounds.json; the calls' patterns: tools/sound/pipe-calls.json) | `src/audio/crewTuning.ts#ORDER_CALLS` |
| What is heard of the crew at work, from the simulation: calls as orders are taken and carried out, feet where men run, gangs hauling, the bell, the drum | `src/audio/crewHearing.ts#CrewWatch` |
| The ship's bell for a turn of her clock: one more strike each half hour of a watch, in pairs | `src/audio/crewHearing.ts#bellStrikes` |
| Whether a spot of her plan is below deck | `src/audio/crewHearing.ts#belowDeck` |
| The crew at work heard: its sounds played through the ship's engine | `src/audio/crewSound.ts#CrewSound` |
| A watch's sounds (placed shots and beds) played through the engine | `src/audio/heard.ts#playHeard` |
| The sound under sail as data: the rigging's beds by apparent wind, flogging, fill, aback, blocks, yard creaks (the takes: tools/sound/sounds.json) | `src/audio/sailTuning.ts#RIGGING_BEDS` |
| What is heard of her sails and rigging, from the sails as drawn and the apparent wind | `src/audio/sailHearing.ts#SailWatch` |
| How much of a sail flogs as drawn | `src/audio/sailHearing.ts#looseShare` |
| Her sails and rigging heard: their sounds played through the ship's engine | `src/audio/sailSound.ts#SailSound` |
| Gunfire's sound as data: the report near, far and through her deck, shot passing and splashing, deafened (dull world, ringing), her guns' jolt (the takes: tools/sound/sounds.json; the ringing: tools/sound/ring.mjs) | `src/audio/gunTuning.ts#GUN_NEAR` |
| What is heard of gunfire, from the fired events: reports arriving by the speed of sound, balls passing and falling near the ear, the ears' load, jolts | `src/audio/gunHearing.ts#GunWatch` |
| Where a ball's path passes nearest a point | `src/audio/gunHearing.ts#nearestPass` |
| A ball's place on its path a time after firing (damage traces it, the drawing flies it) | `src/sim/guns/shot.ts#pathAt` |
| How a ship's guns stand for the drawing: run out or in, leaping back when fired, trained; her lids wanted up (N5.4a) | `src/app/gunsSeen.ts#gunsSeen` |
| How far run out a gun stands through her recoil (the leap back on her breeching) | `src/app/gunsSeen.ts#recoilOut` |
| What is seen of gunfire, from the events and the shots in flight: flashes, balls along their paths, splashes where they touch the sea, strikes; a ball stopped in a ship drawn no further | `src/app/shotsSeen.ts#ShotsSeen` |
| Her guns and port lids drawn moving: slides trained, carriages run out and in, the long sixes on their trucks, lids swung, as instances in moving frames (N5.4a) | `src/render/ship/gunsView.ts#GunsView` |
| A gun's moving frame: trained about her pivot and run in along her axis | `src/render/ship/gunPlaces.ts#gunMove` |
| A port lid's moving frame: swung on its hinge | `src/render/ship/gunPlaces.ts#lidMove` |
| The rope frames of her guns and lids (breechings, lanyards), after the rig's | `src/render/ship/gunPlaces.ts#gunFrame` |
| A carronade at her port as built (run out, square) | `src/render/ship/gunPlaces.ts#carronadeRest` |
| The carronade cut into her slide and the gun on her carriage | `src/render/ship/gunPlaces.ts#splitCarronade` |
| The ring on a carronade's cascabel her breeching is rove through | `src/render/ship/gunPlaces.ts#cascabelRing` |
| Gunfire drawn: muzzle flashes and first puffs, splinters where shot strikes, the balls as streaks (N5.4a) | `src/render/gunfire.ts#GunfireView` |
| Powder smoke: poured from the ports as guns fire, drifting with the wind, swelling and thinning, lit by the day and the flashes (N5.5) | `src/render/smoke.ts#SmokeView` |
| Fire drawn: each fire's flames on its floor and out of its vent, its black smoke, poured into the smoke's fire rings, seeded (N6.5) | `src/render/fireView.ts#FireView` |
| Where a fire in a space of the plan is seen: its floor, its reach, the weather-deck opening it vents by | `src/render/fireView.ts#fireSeat` |
| A fire's puff (soot or flame) put into the smoke's rings, apart from the guns' (N6.5) | `src/render/smoke.ts#SmokeView` (pourPuff) |
| How many puffs of smoke a gun pours at a quality level, and how dense each is, so the smoke hides as much at every level | `src/render/smoke.ts#puffsPoured` |
| Smoke drawn at half resolution behind `?smoke=half`: the scene's multisampled depth halved, the smoke drawn against it and blended over the frame by depth (N5.5 trial) | `src/render/halfSmoke.ts#HalfSmoke` |
| Balls falling in the sea: a column of spray and white water in the nearest ship's wake map | `src/render/gunfire.ts#fallInSea` |
| Shot fallen in the sea as white water on her wake map | `src/render/wakeMap.ts#WakeMap` |
| Something that moves on her outside (her guns and lids), drawn near and far | `src/render/ship/shipView.ts#ShipView` |
| A room as a deafened ear hears it | `src/audio/gunHearing.ts#deafened` |
| Gunfire heard: its sounds played through the ship's engine, the jolts and the deafened room handed back | `src/audio/gunSound.ts#GunSound` |
| A watch's frame emptied to be filled again | `src/audio/heard.ts#clearHeard` |
| How far between a near take and a far one a sound at a distance is heard (a gun's report, a ball striking) | `src/audio/gunHearing.ts#farShare` |
| Sounds kept until they are heard by the speed of sound, handed on with their delay, too late ones dropped | `src/audio/due.ts#DueSounds` |
| The distance between two points of the world | `src/audio/due.ts#worldDistance` |
| The nearest few of a list by distance | `src/audio/due.ts#nearest` |
| Damage's sound as data: shot striking timber near and far, splinters, iron, a line parting, canvas torn, a mast going, her magazine going up, fire, the sea rushing in, breaking up, the jolts (the takes: tools/sound/sounds.json) | `src/audio/damageTuning.ts#HIT_NEAR` |
| What is heard of damage, from the hit and aftermath events and the damage as it stands: blows where they struck, a spar going with its rigging, the explosion, fires, the sea at her holes, her breaking up, jolts | `src/audio/damageHearing.ts#DamageWatch` |
| A place in her (damage's along, across, height) in ship space | `src/audio/damageHearing.ts#shipSpaceOf` |
| Damage heard: its sounds played through the ship's engine, the jolts handed back | `src/audio/damageSound.ts#DamageSound` |
| A frequency glided in log frequency | `src/audio/acoustics.ts#logLerp` |
| The apparent wind's speed on a ship under way | `src/sim/ship/sailing.ts#apparentSpeed` |
| Each sail as drawn, for the sound | `src/render/ship/sailsView.ts#SailsView` |
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
| What an order is given against: tick, wind, force, the range to the enemy, the water in her | `src/sim/step.ts#orderMoment` |
| What a ship can be ordered: the sailing vocabulary (steer, come up, bear away, full and by, tack, wear, heave to, the sail settings, back, fill) | `src/sim/orders.ts#Order` |
| What happened in a step (for drawing, sound and the interface) | `src/sim/step.ts#SimEvent` |
| Running a match on through a log of orders (a guest, a replay, the tests) | `src/sim/replay.ts#replay` |
| The knot in m/s | `src/sim/units.ts#KNOT` |
| The bench's flight: where the eye is at a moment of it | `src/app/bench.ts#benchPose` |
| A percentile of sorted measurements | `src/app/bench.ts#percentile` |
| Frame times summed up as the budget reads them (percentiles, worst, on time, hitches) | `src/app/bench.ts#frameStats` |
| The bench on the page: flying, measuring, the result on screen | `src/app/benchRun.ts#BenchRun` |
| A button on the page (label and what pressing it does) | `src/app/button.ts#makeButton` |
| Milliseconds written for the screen | `src/app/bench.ts#msText` |
| A man of either crew drawn between two steps of the match: where, facing which way, playing which motion (from his task, his way, his hurt) | `src/app/crewDrawn.ts#manDrawn` |
| Where each man stands at his post: men sharing one spread round it, clear of each other | `src/app/crewDrawn.ts#manDrawn` |
| The motion each job plays | `src/app/crewDrawn.ts#JOB_CLIPS` |
| A man's animation step at a distance, seen or not, and the frames he is placed on | `src/app/crewDrawn.ts#stepAt` |
| Which men of her crew the near pool draws as full characters | `src/app/crewDrawn.ts#choosePool` |
| A full character's level (Full near, Medium beyond) | `src/app/crewDrawn.ts#poolLevel` |
| What a man looks like (dress by rank and navy, build, hat, hair, skin, tints) from the roster and his seed; what the crew's pack holds (PACK_ lists) | `src/app/crewLooks.ts#figureOf` |
| The crowd figures' kinds of both crews | `src/app/crewLooks.ts#crowdKinds` |
| A man as a full character, looking as his crowd figure does | `src/app/crewLooks.ts#fullLook` |
| What a man wears and his build as a key (alike men differ in colour only) | `src/app/crewLooks.ts#wearing` |
| What a man's face shows: the causes from the simulation, the table, one frame of it | `src/app/faces.ts#FACES` |
| The crew trial's phases and its result's lines | `src/app/crewTrial.ts#trialLines` |
| The crew trial on the page: its button, phases, result on screen | `src/app/crewTrialRun.ts#CrewTrialRun` |
| The crews drawn: crowd figures for both crews, the near pool handed out, men placed with their ships and animated by the knobs; the voices' men as speakers | `src/render/crew/crewView.ts#CrewView` |
| The near pool: full characters with living faces, dressed as a man and handed over from his crowd figure in the same pose | `src/render/crew/nearPool.ts#NearPool` |
| Bytes of drawn things' geometry (the HUD, the trial) | `src/render/bytes.ts#geometryBytes` |
| The group drawn for the zone a space of hers is in (what stands there is drawn when it is) | `src/render/ship/shipView.ts#ShipView` |
| The built game in a headless browser (for screenshots) | `tools/shot/browser.mjs#openGame` |
| A screenshot of the game, its last WebGPU frame painted first where the software GPU cannot present (`tools/shot/swapchain.js`) | `tools/shot/browser.mjs#snap` |
| The standard sea shots (times of day × seas × eye heights), each scene set on one page by main.ts's `window.__nautaScene` | `tools/shot/sea.mjs#seaShots` |
| Sea shots taken on a page already loaded, a scene each | `tools/shot/sea.mjs#takeSeaShots` |
| A finger dragged across the view (the touch look), for the browser checks | `tools/shot/browser.mjs#drag` |
| Waiting for the page's next frames in a browser check (paced to the GPU by the stand-in swap chain) | `tools/shot/browser.mjs#frames` |
| What a page asks of the GPU (pipelines built, queue submits and when each was done), for finding where a browser check's time goes | `tools/shot/gpuprobe.js` |
| The sum of the slow checks against the CI job's 10 minutes | `tools/guards/budget.mjs#summary` |
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
| The hole in a mast's top (lubber's hole), by the top's breadth | `src/sim/ship/spars.ts#topHole` |
| Her sails: corners, what they are bent to, their shapes | `src/sim/ship/sails.ts#buildSails` |
| A sail's area as it stands (furled, reefed, set) | `src/sim/ship/sails.ts#sailArea` |
| The ways a sail can stand | `src/sim/ship/sails.ts#sailSettings` |
| How far a sail is set, furled 0 to sheeted home 1 (what the drawing shows) | `src/sim/ship/sails.ts#sailShare` |
| How much of a sail's area draws as it is set (a square sail only past hanging in its gear) | `src/sim/ship/sails.ts#drawShare` |
| A sail's named corner | `src/sim/ship/sails.ts#corner` |
| A point on a sail's edge (a leech's middle, a reef cringle) | `src/sim/ship/sails.ts#edgePoint` |
| Sailing: one step of a ship under sail in the true wind (sails by the apparent wind, the crew's trim and bracing, hull, rudder, helmsman, tacking, wearing, missing stays), her way and her sails' heel out | `src/sim/ship/sailing.ts#stepSailing` |
| A ship under sail at the start (heading, way, canvas, yards trimmed) | `src/sim/ship/sailing.ts#startSailing` |
| Telling the helmsman a heading and which way to turn to it | `src/sim/ship/sailing.ts#steerTo` |
| Setting or taking in one sail | `src/sim/ship/sailing.ts#setSail` |
| The sails the crew is working moved to how far each is set | `src/sim/ship/sailing.ts#setShares` |
| Which sails a canvas sets in a wind, reefed for it | `src/sim/ship/sailing.ts#canvasFor` |
| Laying a mast's yards aback, or filling them | `src/sim/ship/sailing.ts#layAback` |
| How each sail stands this moment (area, brace or sheet, pressure, aback, shivering), for drawing and sound | `src/sim/ship/sailing.ts#sailsStanding` |
| The sailing model's tuning: sail polars, hull and rudder, helmsman, bracing, canvas settings and reefs, heel limit, the speed table | `src/sim/rules/sailing.ts#SPEED_TABLE` |
| The sailing orders as data: each order, who takes it, what it does | `src/sim/orders.ts#VOCABULARY` |
| An order from its words (typed or spoken), and why words are none | `src/sim/orders.ts#parseOrder` |
| An order in its own words | `src/sim/orders.ts#orderWords` |
| A compass course in words (`090`) | `src/sim/orders.ts#headingWords` |
| Why an order is no order at all (an untrusted order from another machine) | `src/sim/orders.ts#malformed` |
| Giving a ship an order: taken, refused with its reason, or taken with words (an `answered` event with its code: a course she will not lie, wearing round); what she is told and the acts for the crew | `src/sim/orders.ts#giveOrder` |
| Carrying out a ship's orders each step: the acts the crew finished done to her sailing, orders done reported, full and by following the wind | `src/sim/orders.ts#carryOut` |
| What she is told after missing stays (the master bears away on the old tack) | `src/sim/orders.ts#heard` |
| A ship's orders at the start | `src/sim/orders.ts#startOrders` |
| The orders' judgements: a point, no way, full and by following the wind, what heaving to comes to | `src/sim/rules/orders.ts#HOVE_TO_IN` |
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
| What of the rig stands on her decks in a body's way (the bowsprit's inboard part), from the spar data | `src/sim/ship/rig.ts#rigObstacles` |
| Her spaces by id | `src/sim/ship/plan.ts#spacesById` |
| Whether a place lies in an oblong of the plan (a space, an obstacle) | `src/sim/ship/plan.ts#holds` |
| Her pose as the shared walker's frame (`@futuremagic/deck` Frame: origin and rotation) | `src/sim/ship/motion.ts#shipFrame` |
| Her doors' leaves: which space each opens into, which jamb it hangs on, how far it swings (the door rule) | `src/sim/ship/doors.ts#doorLeaves` |
| One door's leaf by id (the drawing hangs its door by it) | `src/sim/ship/doors.ts#doorHinge` |
| Doors swinging open as the captain comes near and shut when he has gone | `src/sim/ship/doors.ts#stepDoors` |
| A door's angle open, rad, for drawing | `src/sim/ship/doors.ts#doorAngle` |
| Whether a door lets a body through now | `src/sim/ship/doors.ts#doorPasses` |
| Where a leaf is in a body's way (swinging, or where it stands open) | `src/sim/ship/doors.ts#leafInWay` |
| Where open leaves stand, as obstacles the walk graph keeps clear of | `src/sim/ship/doors.ts#openLeaves` |
| Her floors as the walker stands on them: the walk graph, open joins, doorways when open, headroom under beams and door heads | `src/sim/ship/deckWalk.ts#deckGround` |
| One step of the captain on her decks (pace, sliding, stooping, guided into a doorway) | `src/sim/ship/deckWalk.ts#stepWalker` |
| The captain standing still at a spot of her plan | `src/sim/ship/deckWalk.ts#walkerAt` |
| A walker's spot on her plan | `src/sim/ship/deckWalk.ts#spotOf` |
| A walking intent as a push across her plan | `src/sim/ship/deckWalk.ts#pushOf` |
| Whether he stands at a ladder pushing into it (and goes up or down) | `src/sim/ship/deckWalk.ts#ladderOffered` |
| Under a door's head (headroom there is the door's height) | `src/sim/ship/deckWalk.ts#underDoorHead` |
| The captain's eye on her decks | `src/sim/ship/deckWalk.ts#eyeOf` |
| How the captain walks (paces, grip, stooping) | `src/sim/rules/walking.ts#WALK_PACE` |
| The forces a duel is fought in | `src/sim/rules/wind.ts#DUEL_FORCES` |
| The captain aboard: walking, climbing her ladders and the rig as a seen figure, her doors | `src/app/captain.ts#Captain` |
| The captain climbing the rig: steered up and down the shrouds, across onto a footrope and along it, over a rim, onto and off the bowsprit and the jib-boom, his eye bent over a yard | `src/app/aloftClimb.ts#AloftClimb` |
| Where he stands on a top, the crosstrees or the bowsprit | `src/sim/ship/aloftWalk.ts#standsOn` |
| A surface aloft as the walker's ground | `src/sim/ship/aloftWalk.ts#aloftGround` |
| One step of the captain walking on a surface aloft | `src/sim/ship/aloftWalk.ts#stepAloftWalker` |
| The captain standing still on a surface aloft (at the nearest spot he may) | `src/sim/ship/aloftWalk.ts#walkerAloft` |
| The way aloft he gets onto, pushing into it (the shrouds, up or down from a top, the bowsprit, the jib-boom) | `src/sim/ship/aloftWalk.ts#aloftOffered` |
| A mast's shrouds at a tier as he climbs them, and where he stands off them | `src/sim/ship/aloftWalk.ts#chainOf` |
| A mast's climbs on a side | `src/sim/ship/aloft.ts#climbOn` |
| Walking her decks on the page (`?walk`): thumbs to captain to standpoint and doors | `src/app/walking.ts#Walking` |
| The captain's body on a moving deck: his lean against her roll, his feet stepping, his walk's bob, holding on, a blow's stagger, the eye and the head's hold it gives, the calm view's share | `src/app/body.ts#CaptainBody` |
| The captain's own body drawn in first person: an Actors figure posed from his body (or the climb), his eyes at the view, his head not drawn | `src/render/captain/captainView.ts#CaptainView` |
| How the captain looks (his navy's post captain's dress) | `src/app/crewLooks.ts#captainLook` |
| Actors' catalogue cut to what the page's pack holds, for every character loaded | `src/app/crewLooks.ts#packCatalog` |
| How fast a walker goes over her deck | `src/sim/ship/deckWalk.ts#paceOf` |
| The body's tuning: lean and balance, legs and stance, cadence, holding on, the calm view's steps | `src/sim/rules/body.ts#LEAN_SHARE` |
| What a hand can hold where he stands (her rail on deck, the beam overhead below) | `src/sim/ship/handholds.ts#handholdNear` |
| Which rail he can lean out over where he stands, and where his eye goes then (plan N2.11) | `src/sim/ship/handholds.ts#railToLean` |
| What a hand can hold aloft (the shrouds over a top or the crosstrees) | `src/sim/ship/handholds.ts#handholdAloft` |
| How fast a point of her moves in the world from her heave, pitch and roll (what feet on her deck feel) | `src/sim/ship/motion.ts#pointVelocity` |
| The walking thumb's stick as a push | `src/app/thumbs.ts#stickPush` |
| Keys held as a push (WASD and arrows) | `src/app/thumbs.ts#keyPush` |
| The walking thumb and keys on the page (the left half's floating stick) | `src/app/walkInput.ts#watchWalk` |
| A running match as the order panel sees it (my ship, the state, give an order, each step's events): the seam with the two-player session | `src/app/orderReport.ts#OrderSession` |
| The order panel's buttons: every order of the vocabulary but a course | `src/app/orderReport.ts#orderButtons` |
| A ship's state in words for the panel: heading, way, wind, point of sail, canvas | `src/app/orderReport.ts#shipLines` |
| Her point of sail and tack by name | `src/app/orderReport.ts#pointOfSail` |
| What the crew is still doing for each order, in words | `src/app/orderReport.ts#crewLines` |
| An event of a step in the panel's words (a refused order she kept is the master's answer) | `src/app/orderReport.ts#eventWords` |
| Whether an order would be refused now (a dim button), and whether it stands (a ringed one) | `src/app/orderReport.ts#wouldRefuse` |
| Her turning spars' angles in a state, for drawing the yards braced as the sailing model trims them | `src/app/pageMatch.ts#sparAngles` |
| Where her rudder lies in a state, for drawing it put over | `src/app/pageMatch.ts#rudderAngle` |
| The order panel on the page (`?sail&panel`, a test tool beside the fan): buttons, compass, typed orders, answers | `src/app/orderPanel.ts#OrderPanel` |
| Making an element of the page's own panels in one line | `src/app/dom.ts#make` |
| A key pressed once (not held, not typing) on the page | `src/app/dom.ts#onKeyPress` |
| The ways across her weather deck's centreline: how wide, how often (the fife rails' places that make them: `MAIN_FIFE_AT`, `FORE_FIFE_FORE_AT`) | `src/sim/rules/ships.ts#DECK_CROSSING` |
| How fast a man gets about the ship: his pace on each footing, smartly, stooping, the heel, a crowd, queuing on a way, standing aside (first proposals) | `src/sim/rules/routes.ts#PACE` |
| The crew's way network on the one walk graph: the ends of every way and what each way takes to cross | `src/sim/crew/network.ts#routeNetwork` |
| A node's floor under the blocks (which squares a body's middle may be on) | `src/sim/crew/network.ts#areaOf` |
| The distance field across a floor to a square (cached; how far a man walks round what stands there) | `src/sim/crew/network.ts#floorField` |
| The line a man walks across one floor, pulled tight | `src/sim/crew/network.ts#walkLine` |
| How a low deckhead eases a man's pace | `src/sim/crew/network.ts#headroomEase` |
| The height a man stands at on a spot of a floor or a surface aloft | `src/sim/crew/network.ts#heightAt` |
| Whether a body may stand at a spot under the blocks | `src/sim/crew/network.ts#standable` |
| Whether a line on a floor passes through a block | `src/sim/crew/network.ts#lineBlocked` |
| A man's quickest route from one spot to another (the heel, his haste, what is shut) | `src/sim/crew/route.ts#findRoute` |
| What a man's quickest route is built from, small enough for the state (its ends, links, what was shut) | `src/sim/crew/route.ts#findPath` |
| A route found again from what it is built from (kept warm, not state) | `src/sim/crew/route.ts#routeOf` |
| What the heel does to a man's pace on each footing, weather and lee shrouds | `src/sim/crew/route.ts#heelEase` |
| A man's speed over a stretch, and its time | `src/sim/crew/route.ts#partSpeed` |
| A route's time for a man alone on it | `src/sim/crew/route.ts#routeTime` |
| Shutting and opening a way, blocking and clearing a floor (the one owner of what is shut) | `src/sim/crew/closures.ts#closeWay` |
| Sending a man on his way | `src/sim/crew/going.ts#startGoing` |
| One step of every man on his way (speeds, crowds, queues, the captain, rerouting) | `src/sim/crew/going.ts#stepGoings` |
| Where a man on his way is now (spot, height, way, facing) | `src/sim/crew/going.ts#goingAt` |
| The route a man on his way follows (found again from his path) | `src/sim/crew/going.ts#goingRoute` |
| A spot alone, from anything that stands on one (a crew place, a man on his way) | `src/sim/ship/plan.ts#bareSpot` |
| The crew's rules: the roster by rank, part, skill and post; the jobs (hands, work, lines); the gangs; the short-handed rule; how an order travels; choosing and sending the men (first proposals) | `src/sim/rules/crew.ts#ROSTER` |
| The brig's people and the quarter bill: every man's rank, part, skill, post and gun | `src/sim/crew/roster.ts#brigRoster` |
| Every crew place of the plan and the rig, by id | `src/sim/crew/roster.ts#crewPlaces` |
| A crew place's spot | `src/sim/crew/roster.ts#placeSpot` |
| Where a gun's man stands at quarters with his pair's crew all on one side (one crew serves a pair of guns) | `src/sim/crew/roster.ts#quartersPlace` |
| What the crew does for an act of an order: its jobs, their places, hands, work and which waits for which (the drill) | `src/sim/crew/drill.ts#drill` |
| How far a sail's job takes it (furled, hanging, sheeted home), and its work left from where the sail stands | `src/sim/crew/drill.ts#jobSpan` |
| Who works a sail (its gang) | `src/sim/crew/drill.ts#gangOf` |
| What a job takes (hands, work, places, parts) from its name and what it is done on | `src/sim/crew/drill.ts#jobWork` |
| A crew at the start, every man at his post | `src/sim/crew/crew.ts#startCrew` |
| One step of the crew: acts and repairs become tasks, men told off by the quarter bill and sent, work done at the share of hands present, acts and repairs finished; the hurt taken out of the quarter bill, the killed left where they fell, the wounded carried below (the one owner of every man's task and place) | `src/sim/crew/crew.ts#stepCrew` |
| The task a man has | `src/sim/crew/crew.ts#taskOf` |
| Where a man is now and the height he stands at (on his way, where he got to, or at his post) | `src/sim/crew/crew.ts#manAt` |
| A crew place's spot and the height of its floor or surface | `src/sim/crew/crew.ts#placeAt` |
| What stands on her and the numbers that set it out (the fittings' models, guns' gear, helm, boats, anchors, nettings, casks) | `src/sim/rules/fittings.ts#MODEL` |
| Every fitting on her, set out on her plan in ship space (plan N2.6) | `src/sim/ship/furnish.ts#furnish` |
| What the fittings put in a man's way, by height: standing obstacles and overheads for the plan, the low ones stepped over | `src/sim/ship/furnish.ts#fittingSolids` |
| The room each fitting model takes, in its own frame | `src/sim/rules/fittings.ts#SOLID` |
| Her fittings drawn as instances in her moving frame, by zone of her and level of detail | `src/render/ship/furnishings.ts#Furnishings` |
| How far her hammocks are stowed in the waist's nettings as she goes to quarters or secures (plan N2.9) | `src/app/hammocks.ts#HammocksStowed` |
| Something more of hers put into one of her zones, seen with it and lit by its lanterns (`ShipView.addToZone`) | `src/render/ship/shipView.ts#ShipView` |
| One of her materials made to draw instances in her frame (they see ship space) | `src/render/ship/fitted.ts#fitted` |
| The guns' rules: each kind's arcs, reload, recoil, running in and laying rates; the drill's steps and their shares; the short-hands rule (first proposals) | `src/sim/rules/guns.ts#GUNS` |
| The battery: the brig's 18 guns' plan places in battery order (kind, port, side, crew places) | `src/sim/guns/guns.ts#battery` |
| A battery at the start, every gun housed | `src/sim/guns/guns.ts#startGuns` |
| How many men stand at each gun now (read from the crew) | `src/sim/guns/guns.ts#handsAtGuns` |
| The side a ship at quarters fights on: the side whose guns bear on the enemy, both, or neither | `src/sim/guns/gunnery.ts#engagedSide` |
| The hands that work each gun and their share of its pace: a pair's crew split between both its guns works each at a little over half pace | `src/sim/guns/gunnery.ts#pairHands` |
| The pace of a gun's handwork by the men at her (short hands stretch it; under two she stops) | `src/sim/guns/guns.ts#drillPace` |
| The seconds of full-crew work of a step of the drill | `src/sim/guns/guns.ts#handWork` |
| A gun's training and elevation kept within her arcs | `src/sim/guns/guns.ts#withinArcs` |
| One step of a gun: laid toward what is wanted, taken on through her drill (the one owner of every gun's state) | `src/sim/guns/guns.ts#stepGun` |
| One step of the whole battery | `src/sim/guns/guns.ts#stepGuns` |
| What a battery with no gunnery orders does: nothing new | `src/sim/guns/guns.ts#standingWants` |
| Why a gun cannot fire now (unloaded, run in, dismounted, too few men) | `src/sim/guns/guns.ts#cannotFire` |
| Firing a gun: refused with its reason, or her recoil and what left her | `src/sim/guns/guns.ts#fireGun` |
| A gun read out of a ship's packed battery | `src/sim/guns/guns.ts#gunAt` |
| A gun's training and elevation in radians | `src/sim/guns/guns.ts#laidAt` |
| A gun knocked off her carriage or slide (damage asks for it) | `src/sim/guns/guns.ts#dismountGun` |
| Shot in flight: a gun's firing made into her shot (aim from her lay and the ship's pose at that instant, seeded scatter, the ship's motion added), every ball flown to its end | `src/sim/guns/shot.ts#fireShot` |
| One ball's flight under gravity and drag, skipping off the water, to where it is spent | `src/sim/guns/shot.ts#fly` |
| The elevation that puts a gun's shot through a point (the laying table) | `src/sim/guns/shot.ts#elevationFor` |
| How a gun captain lays his gun on a point (training, the elevation he wants, laid against her trim at rest and her steady heel; his misjudged range) | `src/sim/guns/shot.ts#layOn` |
| Her steady heel (her roll averaged, what her gun captains lay against) and her trim at rest | `src/sim/ship/motion.ts#stepMotion`, `src/sim/ship/motion.ts#restTrim` |
| Powder smoke about a ship: how far she lies to leeward of the other, and the smoke the wind lays on her and clears | `src/sim/guns/smoke.ts#leeOf`, `src/sim/guns/smoke.ts#smokeAfter` |
| A computer captain's gun crews drilled by his skill, in the match's start | `src/sim/captain/captain.ts#crewedBy` |
| The training a gun needs to bear on a point, and its range | `src/sim/guns/shot.ts#trainTo` |
| Whether a gun bears: her roll brings her bore through the elevation laid for | `src/sim/guns/shot.ts#bears` |
| A gun's bore's elevation above the horizon now, and its rate | `src/sim/guns/shot.ts#boreElevation` |
| Where a gun's muzzle stands in ship space | `src/sim/guns/shot.ts#muzzleAt` |
| A gun's bore in ship space as she is laid | `src/sim/guns/shot.ts#boreIn` |
| A direction of ship space in the world at her pose | `src/sim/guns/shot.ts#worldDir` |
| Her pose a moment on along her rates | `src/sim/guns/shot.ts#poseAfter` |
| The seeded randomness of a gun's shot | `src/sim/guns/shot.ts#shotRng` |
| The gunnery orders carried out: what each gun crew wants (at quarters, the shot, laid on the enemy) and which guns fire, as they bear or on the word, rippled (the one place that decides when a gun fires) | `src/sim/guns/gunnery.ts#stepGunnery` |
| The point on the enemy the gun captains lay on for the aim ordered (hull, rigging, deck) | `src/sim/guns/gunnery.ts#aimPoint` |
| Whether the drum beats: she goes to quarters and a gun is not yet loaded | `src/sim/guns/gunnery.ts#beatingToQuarters` |
| Building the guns' laying tables while the page loads | `src/sim/guns/gunnery.ts#warmGunnery` |
| Where each aim lays on her, how many guns fire in a step, how near laid a gun fires as they bear (first proposals) | `src/sim/rules/guns.ts#AIM_HEIGHT` |
| The captain's word carried out: what she is told once her held side has fired | `src/sim/orders.ts#wordSpent` |
| The shot's rules: muzzle speeds, each shot's balls, mass, size, speed, drag, spread and span; scatter; skipping; the range table (first proposals) | `src/sim/rules/guns.ts#SHOT` |
| The highest the water can stand anywhere at a moment (above it nothing meets the sea) | `src/sim/sea/sea.ts#highestWater` |
| Hits (N6.1): every shot in flight traced each step through the other ships as they lie, and what each ball meets done in order while its punch lasts: holes, lodged balls, splinters among the men, guns dismounted, men struck, spars wounded, lines cut, sails holed (the one routine that takes a hit) | `src/sim/damage.ts#stepHits` |
| A gun's shot put in flight | `src/sim/damage.ts#launch` |
| How much oak a ball goes through at a speed (its punch) | `src/sim/damage.ts#punchAt` |
| How far a ball reaches to a line, sail or spar it passes (chain's whirl) | `src/sim/damage.ts#reachOf` |
| A ship as nothing has struck her | `src/sim/damage.ts#startDamage` |
| A hole read out of her damage (cell, place in it, the ball, lodged); the holes in a cell; how a cell stands (sound, holed, stove in) | `src/sim/damage.ts#holeAt` |
| Whether a line is shot away; a spar part's wounds; how badly a man is hurt | `src/sim/damage.ts#harmOf` |
| What a straight piece of a ball's path meets in a ship, in order: timber crossed (cell, thickness, how square), guns, men, spars, lines, sails as set | `src/sim/damage/meet.ts#meetings` |
| The parts of her spars between the places each can break (what a wound is kept against) | `src/sim/damage/meet.ts#sparParts` |
| The closest approach of two straight pieces | `src/sim/damage/meet.ts#closest` |
| What a hit does and what follows: timber thickness, each shot's punch by speed, chain's bite, splinters, raking, how men are hurt, stove in and smashed, the violence levels; water, plugged holes weeping, pumps, falling spars, the wreck's drag, holed sails, fire, steering (first proposals) | `src/sim/rules/damage.ts#PIERCE` |
| What damage leads to (N6.2), each step for each ship: the sea in at her holes (plugged ones weeping) against the pumps, spars falling with the men on them, fire growing, spreading, fought and reaching her powder; what is left of her sails, her steering, the wreck's drag and the water's weight for her sailing and floating (the one routine that takes what follows a hit) | `src/sim/damage.ts#stepAftermath` |
| A hole as her damage keeps it | `src/sim/damage.ts#holeCode` |
| The repairs her crew finished, done to her: holes plugged, spars fished, lines spliced, steering mended, wreckage cut away (the one routine that mends) | `src/sim/damage.ts#mend` |
| The holes in her planking the sea can come in at (not lodged, not plugged) | `src/sim/damage.ts#openHoles` |
| The men out of the quarter bill (badly hurt or killed) | `src/sim/damage.ts#outOf` |
| What of her rig stands now, from her damage | `src/sim/damage.ts#standingNow` |
| The fight one step on (N6.4): a ship beaten, a ship lost, the end of the fight or of the light (the one owner of `fight`) | `src/sim/end.ts#stepFight` |
| How a ship is lost now: blown up, sunk, burnt out, struck | `src/sim/end.ts#lostHow` |
| Whether a ship is beaten (a computer captain strikes, a player's first lieutenant says so) | `src/sim/end.ts#beaten` |
| Whether her fire is past saving | `src/sim/end.ts#burntOut` |
| Sailing out of the fight (menu.md): losing her past 3 km, broken off or drawn after a minute past 4 km | `src/sim/end.ts#parting` |
| The winner of an ended fight, or none | `src/sim/end.ts#winner` |
| A fight at its start, its time as the match setting says | `src/sim/end.ts#startFight` |
| How a fight ends: beaten, burnt out, the match's time and the master's warning, striking asked twice (first proposals) | `src/sim/rules/end.ts#BEATEN` |
| The pair of guns a gun is of (one crew a pair) | `src/sim/crew/roster.ts#pairOf` |
| What the crew does for her life (N6.3): the repairs wanted now from her damage, her orders and where her men are, in the order they are manned | `src/sim/crew/repairs.ts#repairsDue` |
| How many of a repair's men are at its spot (a fire party at its fire, the pump hands) | `src/sim/crew/crew.ts#atWork` |
| The men the first lieutenant takes from the guns, in the quarter bill's order (waisters, then the last places of each gun) | `src/sim/crew/roster.ts#billOrder` |
| Whether a job is a repair, not one of the sailing drill's | `src/sim/crew/drill.ts#isRepair` |
| Whether a line is fast to, or holds, a spar that is down | `src/sim/damage/fall.ts#lostWith` |
| The repairs' men, work and who does them; plugging parties, carrying parties, the surgeon's place (first proposals) | `src/sim/rules/crew.ts#REPAIRS` |
| The sea's flow in at a shot hole by its depth | `src/sim/damage/flood.ts#inflow` |
| What the pumps clear, by the men at them | `src/sim/damage/flood.ts#pumped` |
| What one pump fully manned clears (the holes at her waterline it holds) | `src/sim/damage/flood.ts#pumpRate` |
| The water in her running across her as she heels, with what comes in and what is pumped | `src/sim/damage/flood.ts#flowed` |
| How water of a weight lies in her (its level, its middle, its surface's breadth) | `src/sim/damage/flood.ts#lyingOf` |
| The water in her as what she carries (weight and middle in ship space) | `src/sim/damage/flood.ts#loadOf` |
| How far water of a weight sinks her bodily; the water that founders her | `src/sim/damage/flood.ts#founderTonnes` |
| What of her rig stands: spars down, lines gone, sails that cannot stand, what each sail still draws | `src/sim/damage/fall.ts#standingOf` |
| The spars due to fall (three wounds in a part, weather shrouds or stays gone with the wind on them) | `src/sim/damage/fall.ts#fallsDue` |
| What lies alongside as the drag it puts on her | `src/sim/damage/fall.ts#wreckOf` |
| The spar a space aloft stands on | `src/sim/damage/fall.ts#sparUnder` |
| Fire one step on: growing, spreading through her ways, beaten down, reaching her powder | `src/sim/damage/fire.ts#burnt` |
| A fire started in a space | `src/sim/damage/fire.ts#kindled` |
| The space a place in her is in | `src/sim/damage/fire.ts#spaceAt` |
| Where the men at hand to a fire are (its space and those joined to it) | `src/sim/damage/fire.ts#atHand` |
| Where a spot of a planking cell is on her side | `src/sim/damage/meet.ts#plankingPlace` |
| What her damage does to her sailing (sails' drive left, steering, wreck's drag, water's weight) | `src/sim/ship/sailing.ts#SailingDamage` |
| The apparent wind on a ship in her frame | `src/sim/ship/sailing.ts#apparentAt` |
| What a ship carries beyond her own weight (the water in her), for floating | `src/sim/ship/motion.ts#Burden` |
| The match the page sails (`?sail`, `?room`, `?join=`): the session running now behind one face, its events to the order panel, the poses to draw | `src/app/pageMatch.ts#PageMatch` |
| Where a duel starts: 1,500 m apart, the wind on the beam of the line between them, the seed turning the picture and picking the force | `src/sim/start.ts#duelStart` |
| How a duel starts (as far apart as three minutes of closing in that wind, way on at the start) | `src/sim/rules/start.ts#START_CLOSING` |
| The match as the page runs it: stepped by the clock alone, or as host or guest through GameHub; hashes checked, the host's state winning; the host leaving passes hosting on | `src/net/duel.ts#DuelSession` |
| A room's match seed from its code | `src/net/duel.ts#roomSeed` |
| What the machines send each other (snapshot, delta, a captain's orders), the protocol's version | `src/net/wire.ts#PROTOCOL` |
| An order from another machine made safe to step (only an order's fields, named to the sender's ship, through JSON) | `src/net/wire.ts#cleanOrder` |
| Whether a room may be joined (the game, the protocol, the build) | `src/net/wire.ts#roomRefusal` |
| A state as a snapshot to send, and back | `src/net/wire.ts#makeSnapshot` |
| The connection to GameHub (its server, the game's app key) | `src/app/hub.ts#openHub` |
| Opening a room, joining one from the lobby or by its code, on the page | `src/app/roomPanel.ts#RoomPanel` |
| The link that brings another device into a room | `src/app/params.ts#joinLink` |
| The network check's bare page (`?netcheck`) | `src/app/netCheck.ts#runNetCheck` |
| The other captain's ship drawn (plan N3.8): a second ShipView of the same build, her outside only, posed from the match, sunk by the earth's curve, near or far by her distance through the glass | `src/render/ship/shipView.ts#ShipView` |
| Whose ship a mesh is (0 hers, 1 the other's), read by every ship kind to find that ship's rows | `src/render/ship/shipMaterials.ts#SHIP_OBJECT` |
| How many ships the ship kinds draw at once (the per-ship textures' blocks of rows) | `src/render/ship/shipMaterials.ts#SHIPS_DRAWN` |
| A ship's sail rows into the sails' texture | `src/render/ship/sailMaterial.ts#setShipSails` |
| The sun's shadow fitted round her, and round the other ship alongside | `src/render/ship/shipView.ts#ShipView` |
| The spyglass: raised and lowered, drawn out, its tremble, how the hands hold it against her motion | `src/app/glass.ts#Spyglass` |
| The spyglass's controls: its button, two fingers spread or pinched, the G key and the wheel | `src/app/glassInput.ts#watchGlass` |
| The view magnified (the glass) | `src/render/view.ts#createView` |
| Ships touching: two hulls pushed out of each other, shoved apart and turned, grinding, the blows struck and the spars fouled (a step's last part) | `src/sim/ship/touch.ts#touch` |
| How far apart two hulls lie (0 overlapping) | `src/sim/ship/touch.ts#hullGap` |
| How deep two hulls overlap | `src/sim/ship/touch.ts#overlap` |
| The numbers of ships touching: how a blow springs back, the grinding, the push, how hard a blow is heard | `src/sim/rules/touch.ts#RESTITUTION` |
| A ship shoved: blows change her way, leeway and turning, by what moves with her | `src/sim/ship/sailing.ts#shoved` |
| What moves with her when she is shoved: mass, added masses ahead and sideways, turning inertia | `src/sim/ship/sailing.ts#shovedMasses` |
| A ship moved bodily across the water | `src/sim/ship/motion.ts#shifted` |
| Her tack on a heading in a wind (+1 the wind on her starboard side) | `src/sim/orders.ts#tackOf` |
| Whether she is going about (a tack or wear ordered and not yet done) | `src/sim/orders.ts#goingAbout` |
| The orders a computer captain gives in a step (from the state alone; none between his looks) | `src/sim/captain/captain.ts#captainOrders` |
| What a computer captain knows when he looks round: his ship as reported, the enemy as seen, his judged range and bearing | `src/sim/captain/sight.ts#sightOf` |
| Where a computer captain wants her head: closing for the weather position and her stern, a broadside at his range, away before the ships touch | `src/sim/captain/helm.ts#wantedHeading` |
| The master's order that brings her head toward a wanted heading (a course, full and by, a tack, or wearing round) | `src/sim/captain/helm.ts#helmOrder` |
| The heading nearest a wanted one she can steer on a tack | `src/sim/captain/helm.ts#sailableOn` |
| Keeping station alongside her: the main topsail aback when she drops astern, filled when she is abreast | `src/sim/captain/helm.ts#stationOrder` |
| Where the master wants her head for a standing order (steer for her, her on the beam) | `src/sim/captain/helm.ts#keptHeading` |
| The master's own helm order for a standing order, every few seconds | `src/sim/captain/helm.ts#masterOrder` |
| A helm order the master gives himself, the standing order kept | `src/sim/orders.ts#masterSteers` |
| Whether an order is a standing helm order | `src/sim/orders.ts#isKeep` |
| The computer captain's three levels of skill and the tactics they share | `src/sim/rules/captain.ts#SKILL` |
| A match played alone against a computer captain (`?foe=`) | `src/net/duel.ts#DuelOptions` |
| The computer captain waiting hove to until the first match wakes him (`foeWaits`, `DuelSession.wakeFoe`) | `src/net/duel.ts#DuelSession` |
| The player's settings: what they are, defaults, bounds, read back from what the device kept (N7.3) | `src/app/settings.ts#readSettings` |
| Giving an action a key without two actions sharing one | `src/app/settings.ts#withKey` |
| Keeping the settings on the device and telling the page of every change (the address's for one visit) | `src/app/settingsStore.ts#SettingsStore` |
| The settings on the page: the rose button, the sheet's pages and controls | `src/app/settingsPanel.ts#SettingsMenu` |
| A key's code as its cap reads (`KeyW` is W) | `src/app/settings.ts#keyName` |
| The title while the game prepares: shown first, the finger, the theme on the first tap, the hand-over to the deck (N7.7) | `src/title/title.ts#Title` |
| The title's picture, drawn in its worker (or on the page) | `src/title/scene.ts#TitleScene` |
| The title's still, shown from the page's first paint until the drawn title fades in (made by `npm run shot:title -- --still`) | `src/ui/nauta.css#loading`, `src/title/still-*.jpg` |
| The title's look as data: colours by the sun's height, layout, the brig's drawing, the exchange of fire | `src/title/titleLook.ts#SKY_KEYS` |
| The page's one sound engine, opened by the first tap (the title's or the game's) | `src/audio/pageEngine.ts#pageEngine` |
| The interface's words in English and German | `src/app/words.ts#words` |
| A panel over the view that is not the world (the sheet: frame, rose, title, close); the look is docs/design/ui-style.md | `src/app/sheet.ts#openSheet` |
| The compass rose, the interface's mark | `src/app/sheet.ts#rose` |
| A part of the sound (ship, crew, battle) at the player's level | `src/audio/channel.ts#Channel` |
| The walking keys from one key a direction (arrows always walk) | `src/app/thumbs.ts#walkKeys` |
| The interface's look: colours, type, the sheet, buttons, choices, sliders (every panel's CSS) | `src/ui/nauta.css` |
| Who speaks in a bubble, where his head is and his mouth moving (the drawing puts its men there; N4.5) | `src/app/speech/speakers.ts#Speakers` |
| The compass bearing of one point from another on the water | `src/sim/units.ts#bearingTo` |
| The water in her, t (both sides of her hold) | `src/sim/end.ts#waterIn` |
| What her officers notice between two states (a sail sighted, her ports, a side ready, guns bearing, the water past a mark, the wind, her drawing ahead or dropping astern while kept on the beam) | `src/sim/notices.ts#noticed` |
| The phrase book: what the men say, by line, in English and German, with variants and a French crew's turns of phrase | `src/app/speech/phrases.ts#PHRASES` |
| A line of the phrase book in words, its terms filled | `src/app/speech/phrases.ts#phraseWords` |
| The reports table: who says what for an event, a notice or the midshipman sent | `src/app/speech/reports.ts#saysOf` |
| The carpenter's answer to Sound the well, by the water in her | `src/app/speech/reports.ts#soundingLine` |
| Which bubbles are on the view and for how long (four at most, cries first, nothing late) | `src/app/speech/bubbles.ts#BubbleQueue` |
| How long a bubble takes to read | `src/app/speech/bubbles.ts#readSeconds` |
| The bubbles drawn over the men, or at the screen's edge | `src/app/bubbleLayer.ts#BubbleLayer` |
| The match's events and notices to the bubbles, on the page | `src/app/speaking.ts#Speech` |
| A man of the crew as a speaker: his head for the bubble, his mouth with the words (brought into the near pool), his look to the captain | `src/render/crew/crewView.ts#CrewView` |
| A ship's navy in the duel (the first ship's as the match setup chose, the other the other) | `src/app/crewLooks.ts#navyOf` |
| Each navy's dress for the men drawn (Actors' `navy-rn-*` and `navy-fr-*` presets) by what a man's dress says he is | `src/app/crewLooks.ts#DRESSES` |
| Which ships drawn fly the French colours (the flags' uniform) | `src/render/ship/sailMaterial.ts#setFrenchFlags` |
| The men the captain gives orders to: who they are, where each stands, whom an order goes to, whether his voice reaches them (N4.4) | `src/app/officers.ts#OFFICERS` |
| How far apart two spots are on one floor (another space: Infinity) | `src/app/officers.ts#floorApart` |
| Where the midshipman gives a message to each man | `src/app/officers.ts#deliverAt` |
| Who takes an order, and answers it (the speech bubbles ask here too) | `src/app/officers.ts#takerOf` |
| What the order fan offers each man now: at most six, one more ring, dim and ringed as the match stands | `src/app/fanOrders.ts#fanItems` |
| What each order key gives | `src/app/fanOrders.ts#KEY_ORDERS` |
| Whether her guns wait for the captain's word (the Fire! button shows) | `src/app/fanOrders.ts#waitingForWord` |
| Which drawn man a finger points at on the view | `src/app/fanOrders.ts#manAt` |
| The order fan on the page: tap or press a man, the midshipman, the keys, steer there; the captain's arm | `src/app/orderFan.ts#OrderFan` |
| The drawn officer of a rank among the men on the view | `src/app/fanOrders.ts#manOnScreen` |
| The first match: its settings, the first lieutenant's course of lessons and tips, what each asks and when it is done (pure) | `src/app/lessons.ts#Lessons` |
| What of hers is heard, as the lessons key it | `src/app/lessons.ts#heardKeys` |
| The first match on the page: the lessons said, the man to tap ringed, the fan's orders lit, Skip | `src/app/firstCommand.ts#FirstCommand` |
| The midshipman: keeps by the captain on her decks, runs with a message and gives it when he arrives | `src/app/midshipman.ts#Midshipman` |
| The compass bearing looked along from her ("steer there") | `src/app/look.ts#lookBearing` |
| The man of the roster each voice is | `src/app/officers.ts#voiceMan` |
| The officers drawn (the near pool takes them when near): where each is on the view, brought in when addressed | `src/render/crew/crewView.ts#CrewView` |
| The report log: every line the men said this match, shown or not | `src/app/speech/reportLog.ts#ReportLog` |
| The reports sheet and its tag and key | `src/app/reportsPanel.ts#ReportsPanel` |
| The menu: the main screen, the match setup, joining, the waiting room, the captain's pause, the end card; which match the page runs (N7.2) | `src/app/menu.ts#Menu` |
| The match terms the menu sets: choices, defaults, reading kept ones back | `src/app/terms.ts#readTerms` |
| The hour a match's sky starts at, named or drawn from the seed | `src/app/terms.ts#hourOf` |
| A new match's seed when none is typed | `src/app/terms.ts#newSeed` |
| What the end card tells: how it ended for me, how long, each ship's numbers | `src/app/tally.ts#endCard` |
| Counting guns fired and balls that struck from a match's events | `src/app/tally.ts#Tally` |
| One ship alone at sea (walking her, the sea behind the menu) | `src/sim/start.ts#aloneStart` |
| A room's host's choices in its meta (shown in the list, the guest's sky) | `src/net/wire.ts#roomTerms` |
| Whether the address is the game with its menu or a working tool | `src/app/params.ts#TOOL_SWITCHES` |
| A kept value read back: a plain object, one of a few | `src/app/kept.ts#oneOf` |
| The rooms waiting, as buttons from GameHub's lobby; a room's link to share | `src/app/roomPanel.ts#waitingRooms` |
| The title asking for the tap that begins once the game is ready; its theme on and off | `src/title/title.ts#beginOnTap` |
| The mouse taken for looking (pointer lock) or free; a plain click on the view takes it, a sheet or Escape frees it | `src/app/mouse.ts#MouseTaker` |
| The browser's own menus and navigation kept off the game (right click, wheel button, side buttons) | `src/app/mouse.ts#keepBrowserMenusAway` |
| How the game is played, as lists for a desk and a tablet (the controls card's rows) | `src/app/controls.ts#DESK_CONTROLS` |
| The controls card over the view: once at a device's first match, from the pause and from Settings | `src/app/controlsCard.ts#openControls` |
| A key's small cap beside what it does, shown only where a mouse points | `src/app/dom.ts#keyCap` |
| The key that gives what a fan's item gives (its cap on the tag) | `src/app/fanOrders.ts#keyOfItem` |
| A press on the screen, and whether its lift makes a tap or a click | `src/app/press.ts#isTap` |
