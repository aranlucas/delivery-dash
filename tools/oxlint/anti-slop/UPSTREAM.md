# Anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Commit: c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b
- Source path: skills/install-anti-slop/assets/anti-slop/
- Installed path: tools/oxlint/anti-slop/
- Changes to vendored implementation: none.
- Root LICENSE copied from the same commit; nested Stylistic LICENSE and UPSTREAM.md preserved.
- Generic rules are enabled. Effect rules require a direct Effect dependency.

## Installation verification

- `oxlint` and `@oxlint/plugins` are pinned together at the existing resolved 1.86.0; all 18 generic rules and native accumulating-spread are errors.
- Existing strict lint, filename, format, test and build gates remain enabled. Vendored upstream filenames/licenses alone are exempted from the repository's kebab-case check.
- The existing TypeScript build now also checks the live multiplayer contract script.
- Passed: frozen pnpm 12.3.1 install, zero-diagnostic deny-warnings lint, filename and formatting checks, TypeScript, 71 tests including model-asset checks, and Vite client/Cloudflare-worker production compilation.
- Passed against a local Worker: all six live game-mode contract flows, including the real 180-second Rush deadline, duplicate joins, delivery first-to-three, checkpoint sequencing, free drive, invalid mode rejection, reconnect and next-round reset.
- Local verification used a temporary config with inspector disabled and a workspace-local Wrangler registry; no production service was called. Interactive graphical playtesting was not performed.
