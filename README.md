# Delivery Dash

Delivery Dash is a multiplayer 3D arcade racing game set in a coastal city. Pick a mode, invite up to seven other drivers with your room code, and explore the streets, expressways, and stunt districts.

## Game modes

| Mode              | Objective                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Delivery Race     | Be the first to complete three pickup and drop-off runs.                                                        |
| Rush Hour         | Complete the most deliveries in three minutes. Orders continue throughout the round; equal totals share a rank. |
| Checkpoint Sprint | Reach eight numbered gates in order. The first driver through the final gate wins.                              |
| Free Drive        | Explore, drift, boost, and jump without a timer or finish line. Friends can join while you drive.               |

The first driver sets the room's mode. Joining drivers use that same mode. Ready up in the lobby to start; completed races return to the lobby for a rematch after ten seconds. Use **Change mode / Leave** to return to the menu.

Drive with **WASD** or the **arrow keys**, hold **Space** to drift and release it for a charged rush, and hold **Shift** to boost. The cyan checkpoint gates are passable markers; delivery modes use orange pickup and green drop-off markers.

The world includes a festival market, harbor scenery, and plaza furniture. Asset sources and rebuild instructions are in [the coastal world kit guide](assets/blender/WORLD_KIT.md).

## Run locally

Requires Node.js 24–26 and pnpm 12.3.1 (the version pinned in `package.json`). Enable Corepack's pnpm shim if your system pnpm is older.

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm dev
```

## Verify

```bash
pnpm test
pnpm check
pnpm lint
pnpm build
```

With the local server running, exercise the real room protocol and all four modes:

```bash
node --experimental-strip-types scripts/test-game-modes.ts
TEST_GAME_RUSH_TIMER=1 TEST_GAME_RECONNECT=1 node --experimental-strip-types scripts/test-game-modes.ts
```

The second command also waits for Rush Hour's actual three-minute server deadline. Set `TEST_GAME_URL` when testing a different local origin.

## Deploy

```bash
pnpm deploy
```

The Cloudflare Worker, Durable Object, and client configuration live in [`wrangler.jsonc`](wrangler.jsonc). Keep local secrets in ignored `.dev.vars` files.
