# Delivery Dash arcade direction

Reference concept: [arcade-direction-v1.png](arcade-direction-v1.png).

## Visual system

- Electric yellow `#ffd400`, traffic orange `#ff7a00`, cyan `#00d9ff`, hot red `#ff4f2e`.
- Near-black `#12161b` race panels with cream type and hard offset shadows.
- Bold, condensed, italic system typography; skewed silhouettes; checker details.
- Bright cobalt sky, warm concrete, saturated storefronts, palms, landmarks, and strong road contrast.
- Three facade families by district: downtown curtain-wall glass, midtown masonry, outskirt stucco.
  Keep window sizes consistent across the skyline.
- Expressway concrete, hazard-chevron launch ramps, and cyan boost chevrons read at speed from far off.
- The player's yellow delivery taxi fills the lower-center frame. Player colors are accents and remote-car identifiers.

## Driving and camera

- A controlled drift charges Local, Express, and Overnight delivery-rush tiers, which fire when
  the drift ends. See the [player controls](../readme.md#game-modes).
- The chase camera is low and close, looks farther ahead with speed, widens under boost, banks during a drift, and pulls forward when a building would occlude the car.
- Ramps, expressway decks, and building roofs support vertical routes: pass under decks, fly over
  low buildings, and land on what the car clears.

## HUD hierarchy

1. Destination, distance, and direction at top-center.
2. Order progress at top-left and race standings at top-right.
3. Speed and boost at bottom-left, city minimap at bottom-right.
4. Drift and air callouts, combo, and the live air-time gauge at center-bottom.

## Next slices

1. Server-owned fare timer, tips, skill score, and cash-based standings.
2. Traffic that turns and brakes, plus pedestrians.
3. Original soundtrack/stingers, richer engine layers, skid marks, impact sparks, and pickup/drop-off celebrations.
4. Air tricks (spins and flips) now that the car leaves the ground, plus shortcut routes over rooftops.

Keep branding, city layouts, characters, and art original. Use the [asset authoring guide](../assets/blender/readme.md)
for editable sources and runtime constraints.
