# Dash Rush arcade direction

Reference concept: `arcade-direction-v1.png`

## Visual system

- Electric yellow `#ffd400`, traffic orange `#ff7a00`, cyan `#00d9ff`, hot red `#ff4f2e`.
- Near-black `#12161b` race panels with cream type and hard offset shadows.
- Bold, condensed, italic system typography; skewed silhouettes; checker details.
- Bright cobalt sky, warm concrete, saturated storefronts, palms, landmarks, and strong road contrast.
- Three facade families by district: downtown curtain-wall glass, midtown masonry, outskirt stucco.
  Facades tile per storey via a per-instance UV scale, so windows keep one size across the skyline.
- Expressway concrete, hazard-chevron launch ramps, and cyan boost chevrons read at speed from far off.
- The player's yellow delivery taxi fills the lower-center frame. Player colors are accents and remote-car identifiers.

## Driving and camera

- W/up accelerates; S/down brakes before reverse.
- A/D or arrows steer; Space releases rear grip for a sustained drift; Shift spends boost.
- The chase camera is low and close, looks farther ahead with speed, widens under boost, banks during a drift, and pulls forward when a building would occlude the car.
- The car has vertical physics: slopes are ridden, lips launch, gravity lands. Ramps, expressway
  decks, and building roofs are all drivable surfaces; collision is gated by altitude so cars pass
  under decks, fly over low buildings, and land on what they clear.

## HUD hierarchy

1. Destination, distance, and direction at top-center.
2. Order progress at top-left and race standings at top-right.
3. Speed and boost at bottom-left, city minimap at bottom-right.
4. Drift and air callouts, combo, and the live air-time gauge at center-bottom.

## Next slices

1. Server-owned fare timer, tips, skill score, and cash-based standings.
2. Traffic that turns and brakes, near-miss scoring, and pedestrians.
3. Original soundtrack/stingers, richer engine layers, skid marks, impact sparks, and pickup/drop-off celebrations.
4. Air tricks (spins and flips) now that the car leaves the ground, plus shortcut routes over rooftops.

Shipped since the first pass: vehicle Y physics, elevated expressways, launch ramps, boost strips,
moving traffic and kerb parking, district topology, and the minimap.

All branding, city layouts, characters, and art remain original. The game stays procedural and code-native unless the repository asset constraint is deliberately revised.
