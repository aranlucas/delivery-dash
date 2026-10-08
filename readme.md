# Delivery Dash

[![CI](https://github.com/aranlucas/delivery-dash/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aranlucas/delivery-dash/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/github/license/aranlucas/delivery-dash)](license)
![Three.js](https://img.shields.io/badge/Three.js-3D_world-000000?logo=threedotjs&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Durable_Objects-F38020?logo=cloudflare&logoColor=white)

**Your order is up. The harbor is your racetrack.**

Delivery Dash is a browser-based multiplayer 3D racing game for up to eight friends. Race the clock, chase the next drop-off, or leave the finish line behind and cruise the coastal city together.

![Illustrated cover art showing a coastal delivery race](docs/images/delivery-dash-cover.png)

_Illustrated cover art; see the game modes below for implemented gameplay._

## Game modes

| Mode              | Objective                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Delivery Race     | Be the first to complete three pickup and drop-off runs.                                                        |
| Rush Hour         | Complete the most deliveries in three minutes. Orders continue throughout the round; equal totals share a rank. |
| Checkpoint Sprint | Reach eight numbered gates in order. The first driver through the final gate wins.                              |
| Free Drive        | Explore, drift, boost, and jump without a timer or finish line. Friends can join while you drive.               |

The first driver sets the room's mode. Joining drivers use that same mode. Ready up in the lobby to start; completed races return to the lobby for a rematch after ten seconds. Use **Change mode / Leave** to return to the menu.

Drive with **WASD** or the **arrow keys**, hold **Space** to drift and release it for a charged rush, and hold **Shift** to boost. The cyan checkpoint gates are passable markers; delivery modes use orange pickup and green drop-off markers.

Press **V** or choose **City View** above the minimap to inspect the whole island. Drag to orbit,
right-drag to pan, and scroll to zoom. The camera panel includes an overhead view, your car, and
all five landmarks; **Home** fits the island again. **Esc** or **V** returns to driving immediately.
Your car stays in place during inspection while the room's session continues.

The world includes a festival market, harbor scenery, and plaza furniture. Asset sources and rebuild instructions are in [the coastal world kit guide](assets/blender/world-kit.md).

## Run locally

Requires Node.js 24–26 and the pnpm version pinned in `package.json`. Enable Corepack's pnpm shim if your system pnpm is older.

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
pnpm format:check
pnpm build
```

Lint treats warnings as failures and checks kebab-case filenames across source, tests, assets,
and documentation. Conventional tool-discovery filenames are reserved: `.node-version`,
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `skills-lock.json`, and skill entrypoints named `SKILL.md`.
CI also verifies formatting with oxfmt. The linter uses React's automatic JSX runtime, matching
the TypeScript and Vite configuration.

`pnpm cf-typegen` generates Worker bindings and runtime types from `cloudflare.config.ts` into
ignored `.cloudflare/types/index.d.ts`. Typechecking regenerates them first, so a fresh checkout
does not need a development server or committed generated declarations. The development and
build scripts regenerate these types first. Vite's duplicate root type generation is disabled.

With the local server running, exercise the real room protocol and all four modes:

```bash
node --experimental-strip-types scripts/test-game-modes.ts
TEST_GAME_RUSH_TIMER=1 TEST_GAME_RECONNECT=1 node --experimental-strip-types scripts/test-game-modes.ts
```

The second command also waits for Rush Hour's actual three-minute server deadline. Set `TEST_GAME_URL` when testing a different local origin.

## Deploy

```bash
pnpm deploy:dry-run
pnpm exec cf auth login
pnpm deploy
```

The Cloudflare Worker, Durable Object, and client configuration live in [`cloudflare.config.ts`](cloudflare.config.ts). Keep local secrets in ignored `.dev.vars` files.

The deployment scripts build and typecheck first, then reuse the production Build Output with
`cf deploy --prebuilt --mode production`. The dry run validates packaging without uploading or
requiring authentication. `RaceRoom` retains its SQLite storage through `worker.exports`, which
replaces Wrangler's ordered Durable Object migration history.

The project uses the beta Cloudflare CLI and Vite plugin. See Cloudflare's
[Wrangler migration guide](https://developers.cloudflare.com/cf/wrangler/migrate/) and
[build and deployment reference](https://developers.cloudflare.com/cf/projects/).
The legacy Wrangler configuration and committed declarations were removed after verifying a
successful `cf` production deployment. Project scripts, CI, and TypeScript now use
`cloudflare.config.ts` and the ignored generated types.
