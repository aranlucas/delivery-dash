# Delivery Dash

Delivery Dash is a multiplayer 3D arcade racing game. Pick up food, deliver it across a procedural city, and finish three deliveries before the other drivers.

## Run locally

Requires Node.js 26.x and pnpm 11.18+.

```bash
pnpm install --frozen-lockfile
pnpm run cf-typegen
pnpm dev
```

## Verify

```bash
pnpm audit --audit-level high
pnpm run check
pnpm run build
```

## Deploy

```bash
pnpm deploy
```

The Cloudflare Worker, Durable Object, and client configuration live in [`wrangler.jsonc`](wrangler.jsonc). Keep local secrets in ignored `.dev.vars` files.
