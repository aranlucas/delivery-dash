# Delivery Dash

Delivery Dash is a multiplayer 3D arcade racing game where drivers tear through a procedural city to pick up food, reach customers, and finish three deliveries before everyone else.

![Delivery Dash arcade direction](design/arcade-direction-v1.png)

## Features

- Same-origin multiplayer over Cloudflare Durable Object WebSockets
- Procedural cities and deterministic delivery routes shared by client and server
- Server-authoritative pickup, drop-off, and race progression
- Arcade driving with drifting, boost, collision, and chase-camera effects
- Original code-native visuals, vehicles, storefronts, audio, and HUD

## Stack

- React 19, Three.js, React Three Fiber, Drei, and Zustand
- Cloudflare Workers and a SQLite-backed Durable Object
- Vite, TypeScript, Wrangler, and pnpm

## Run locally

Prerequisites: Node.js 24+ and pnpm 11.17+.

```bash
pnpm install --frozen-lockfile
pnpm run cf-typegen
pnpm dev
```

Open the local URL printed by Vite. Create a four-letter room code or join an existing room in another browser window.

## Controls

| Input | Action |
| --- | --- |
| `W` / `Up` | Accelerate |
| `S` / `Down` | Brake and reverse |
| `A` / `D` or arrow keys | Steer |
| `Space` | Drift |
| `Shift` | Boost |

## Validate

```bash
pnpm audit --audit-level high
pnpm run check
pnpm run build
```

The GitHub Actions workflow performs a frozen install, dependency audit, generated-type check, TypeScript check, and production build.

## Deploy to Cloudflare

Authenticate Wrangler, then deploy the Worker, static client, Durable Object binding, and migration together:

```bash
pnpm deploy
```

Cloudflare configuration lives in [`wrangler.jsonc`](wrangler.jsonc). Local Worker variables belong in ignored `.dev.vars` files; never commit credentials or secrets.

## Project layout

```text
src/client/   React UI, Three.js scene, driving, and networking
src/shared/   deterministic city generation and shared protocol
src/worker/   Worker router and RaceRoom Durable Object
design/       visual direction and reference artwork
```

See [`SPEC.md`](SPEC.md) for the original implementation specification and [`design/ARCADE_DIRECTION.md`](design/ARCADE_DIRECTION.md) for the current visual and driving direction.
