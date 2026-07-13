# Dash Rush arcade direction

Reference concept: `arcade-direction-v1.png`

## Visual system

- Electric yellow `#ffd400`, traffic orange `#ff7a00`, cyan `#00d9ff`, hot red `#ff4f2e`.
- Near-black `#12161b` race panels with cream type and hard offset shadows.
- Bold, condensed, italic system typography; skewed silhouettes; checker details.
- Bright cobalt sky, warm concrete, saturated storefronts, palms, landmarks, and strong road contrast.
- The player's yellow delivery taxi fills the lower-center frame. Player colors are accents and remote-car identifiers.

## Driving and camera

- W/up accelerates; S/down brakes before reverse.
- A/D or arrows steer; Space releases rear grip for a sustained drift; Shift spends boost.
- The chase camera is low and close, looks farther ahead with speed, widens under boost, banks during a drift, and pulls forward when a building would occlude the car.

## HUD hierarchy

1. Destination, distance, and direction at top-center.
2. Order progress at top-left and race standings at top-right.
3. Speed and boost at bottom-left.
4. Drift callout and combo at center-bottom.

## Next slices

1. Server-owned fare timer, tips, skill score, and cash-based standings.
2. Moving traffic, near misses, ramps, lightweight props, and authored shortcuts.
3. Original soundtrack/stingers, richer engine layers, skid marks, impact sparks, and pickup/drop-off celebrations.
4. Distinct downtown, coast, and residential route topology with elevation after vehicle Y physics exists.

All branding, city layouts, characters, and art remain original. The game stays procedural and code-native unless the repository asset constraint is deliberately revised.
