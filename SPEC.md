# Dash Rush — 3D Multiplayer Delivery Racing (Implementation Spec)

A DoorDash-style delivery racing game: players drive delivery cars through a procedural 3D city, racing to complete food deliveries. First to 3 completed deliveries wins.

## Tech stack (already scaffolded — do not change configs unless broken)

- Cloudflare Worker + **Durable Object** `RaceRoom` (WebSocket Hibernation API, SQLite-backed storage) — `src/worker/`
- **React 19 + @react-three/fiber 9 + drei + zustand** client — `src/client/`
- Shared code (protocol + city generation) — `src/shared/`
- Build: Vite + `@cloudflare/vite-plugin` (worker and client served together in dev, same origin). `npm run dev` runs everything. `npm run check` typechecks, `npm run build` builds.
- `wrangler.jsonc` already binds `RACE_ROOM` → class `RaceRoom` with a `v1` sqlite migration. `Env` types are generated in `worker-configuration.d.ts` (global `Env` type available in worker code).

## File layout to produce

```
src/shared/protocol.ts   — message types + game constants
src/shared/city.ts       — seeded city layout + order generation (used by BOTH server and client)
src/shared/rng.ts        — mulberry32 seeded PRNG
src/worker/index.ts      — Worker fetch router + RaceRoom Durable Object
src/client/main.tsx      — entry
src/client/App.tsx       — screen router (menu → game)
src/client/net.ts        — WebSocket client (connect, send, message dispatch, reconnect)
src/client/store.ts      — zustand store (connection, phase, players, own progress, etc.)
src/client/game/*.tsx    — R3F scene: City, Car(own, physics), RemoteCar(interpolated), TargetBeacon, ChaseCamera
src/client/ui/*.tsx      — Menu, Lobby, HUD, Countdown, WinnerScreen (plain DOM overlay, not R3F)
```

## Game design

- **Rooms**: identified by a 4-letter code (A–Z). Menu lets the player enter a name, then either create a room (random code) or join by code. Max 8 players.
- **Phases**: `lobby` → `countdown` (3s) → `racing` → `finished` (10s, then back to `lobby`).
  - Lobby: players toggle "ready". When ≥1 players are connected and ALL are ready, server starts countdown.
  - Countdown/finished phase transitions use the DO **alarm** API (not setTimeout — must survive hibernation).
- **Orders**: from the room's `seed` (random int chosen when the room is created), `generateCity(seed)` deterministically produces the city and `generateOrders(seed)` a sequence of 6 orders `{ restaurantId, houseId }`. Every player runs the same order sequence independently: drive to the restaurant (pickup), then to the customer's house (dropoff) = 1 delivery, then next order. **First to 3 deliveries wins.**
- **Server-authoritative deliveries**: server checks proximity (radius 10) of each incoming position update against the player's current target and advances their progress; clients never self-report pickups/deliveries.
- Movement is client-authoritative (arcade physics on the client), server just relays positions. Fine for v1.

## Shared: `src/shared/city.ts`

Deterministic from seed (must produce identical results in Worker and browser — no Math.random, no Date):

- Grid of 8×8 city blocks; block size 36, road width 14 (so cell pitch 50). World is roads (y=0 plane) between blocks; buildings sit on blocks.
- Each block: 1–4 box buildings with seeded heights (8–40), sizes, and a muted color palette; some blocks are parks (flat, green).
- **12 restaurants** and **16 houses**: seeded positions at road-adjacent block corners, each `{ id, name, pos: [x, z] }`. DoorDash-flavored names (restaurants: "Taco Palace", "Burger Barn", "Pho Real", "Pizza Planet", "Sushi Express", "Curry Up", "Wing Kingdom", "Noodle Ninja", "Bagel Boss", "Kebab Kart", "Waffle Works", "Dumpling Depot"; houses: customer names like "Alex M.", "Sam K.", …).
- Export `buildingAABBs` list for client collision.
- 8 spawn points (grid positions on the main road, facing +z), player i uses spawn i.
- `generateOrders(seed): Order[]` — 6 orders, no repeated restaurant back-to-back.

## Protocol: `src/shared/protocol.ts`

JSON messages over WebSocket. Define TS discriminated unions + constants (`DELIVERIES_TO_WIN = 3`, `TARGET_RADIUS = 10`, `TICK_HZ = 12`, `MAX_PLAYERS = 8`, `COUNTDOWN_MS = 3000`, `FINISH_LINGER_MS = 10000`).

Client → Server:

- `{ t: "join", name: string }` (sent right after WS open)
- `{ t: "ready", ready: boolean }`
- `{ t: "pos", x, y, z, yaw, speed }` (12 Hz while racing)

Server → Client:

- `{ t: "welcome", id, seed, phase, players: PlayerPub[], countdownEndsAt?, raceStartedAt? }`
- `{ t: "roster", players: PlayerPub[] }` (any join/leave/ready change)
- `{ t: "phase", phase, countdownEndsAt?, raceStartedAt?, standings? }`
- `{ t: "pos", id, x, y, z, yaw, speed }` (relayed, sender excluded)
- `{ t: "progress", id, orderIndex, leg: "pickup" | "dropoff", deliveries }` (someone picked up / delivered)
- `{ t: "win", id, standings: { id, name, deliveries }[] }`
- `{ t: "error", message }`

`PlayerPub = { id, name, ready, color, deliveries, orderIndex, leg, spawnIndex }`. Assign each player a color from a fixed 8-color palette by join order.

## Worker: `src/worker/index.ts`

- Router: `GET /api/room/:code/ws` → validate code `/^[A-Z]{4}$/`, require `Upgrade: websocket`, forward to `env.RACE_ROOM.getByName(code)` stub's `fetch`. Everything else 404 (assets are served automatically).
- `RaceRoom extends DurableObject<Env>`:
  - **WebSocket Hibernation API**: `this.ctx.acceptWebSocket(server)`, handlers `webSocketMessage`, `webSocketClose`, `webSocketError`. Store `{ playerId }` via `serializeAttachment`; recover in-memory maps lazily from `ctx.getWebSockets()` + storage after hibernation.
  - Room state persisted in `ctx.storage` (KV is fine): `{ seed, phase, players: Record<id, {name, color, ready, deliveries, orderIndex, leg, spawnIndex}>, countdownEndsAt, raceStartedAt }`. Positions in-memory only. Persist on join/leave/ready/progress/phase change.
  - Seed created on first join (`crypto.getRandomValues`). Store it.
  - Join: reject if racing already started (send error + close) or room full. Broadcast roster.
  - All-ready in lobby (≥1 players) → phase `countdown`, `setAlarm(now + COUNTDOWN_MS)`.
  - `alarm()`: countdown → racing (broadcast phase with `raceStartedAt`); finished → reset players' progress/ready → lobby (broadcast).
  - `pos` while racing: relay to others; compute player's current target from city layout (`orderIndex` + `leg`), check 2D distance ≤ TARGET_RADIUS → advance leg/order, broadcast `progress`; if deliveries reaches DELIVERIES_TO_WIN → phase `finished`, broadcast `win` with standings sorted by deliveries then orderIndex, `setAlarm(now + FINISH_LINGER_MS)`.
  - Close: remove player, broadcast roster; if room empties in lobby, `deleteAll` storage.
  - Never trust client ids — the DO assigns `playerId` (crypto.randomUUID()).

## Client

- `net.ts`: `connect(code, name)` → `new WebSocket(wss?://${location.host}/api/room/${code}/ws)`; on open send `join`; dispatch messages into the zustand store. Expose `send()`. Reconnect: on unexpected close during a session show "disconnected" state in UI with a rejoin button (no silent auto-retry loop).
- `store.ts`: zustand: `{ screen, roomCode, selfId, seed, phase, players, remotePos: Map<id, {x,y,z,yaw,speed,t}>, countdownEndsAt, raceStartedAt, standings, lastError }`. Keep remote positions OUTSIDE React re-renders where possible (mutable ref map is fine; roster/progress in state).
- **Car physics** (own car, per-frame in `useFrame`): arcade model — throttle accel 28 u/s², brake/reverse, max speed ~38 u/s, steering rate scaled by speed, lateral friction (mild drift), speed-dependent grip. Collide against `buildingAABBs` + world bounds: slide along walls, kill perpendicular velocity. Keys: WASD + arrows. Movement only during `racing` (and free-roam in lobby is fine bonus — allowed but keep simple: locked to spawn until race starts).
- Send `pos` at 12 Hz while connected + racing.
- **Remote cars**: interpolate toward last received pos/yaw (lerp with ~100–150 ms smoothing), name label above (drei `Billboard` + `Text`), car body tinted with player color.
- **Car model**: procedural — box chassis, cabin, 4 cylinder wheels (rotate with speed), a colored "delivery bag" box on the roof when carrying (leg === "dropoff").
- **City rendering**: `<instancedMesh>` for buildings; ground plane (asphalt dark) + block surfaces; restaurants = orange storefront box with sign (drei Text), houses = small box with roof.
- **TargetBeacon**: tall glowing translucent cylinder + bouncing arrow over the CURRENT target (own player's); color orange for pickup, green for dropoff.
- **ChaseCamera**: smooth-follow behind own car (lerped), slight speed-based FOV kick.
- Lighting: hemisphere + one directional with shadows OFF for perf; fog for depth. Keep draw calls low; target 60fps.
- **UI overlay** (absolute-positioned DOM over canvas):
  - Menu: name input, "Create room" / code input + "Join".
  - Lobby: room code (big, shareable), player list with ready states/colors, Ready button.
  - Countdown: 3-2-1-GO.
  - HUD: current task line ("🛍 Pick up from Taco Palace" / "🏠 Deliver to Sam K."), deliveries "2/3", mini leaderboard (name • deliveries), speed readout, off-screen direction arrow to target (2D screen-space arrow at edge pointing toward target).
  - Winner screen: standings + "Back to lobby soon…".
- Styling: simple inline styles or one CSS file; dark theme, DoorDash-ish red accent (#eb1700). Readable, not fancy.

## Constraints & quality bar

- `npm run check` and `npm run build` MUST pass with zero errors — run them yourself and fix everything.
- No extra npm dependencies beyond what's installed (react, react-dom, three, @react-three/fiber, @react-three/drei, zustand).
- No assets/textures — everything procedural.
- Shared code must not import worker- or DOM-only APIs.
- Durable Object must use the Hibernation WebSocket API (`ctx.acceptWebSocket`), not `server.accept()`.
- TypeScript strict; the discriminated-union protocol shared by both sides.
