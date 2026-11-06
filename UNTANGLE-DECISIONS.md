# Untangle decision log

## Scope and inventory

Exact skill fetched/read from https://raw.githubusercontent.com/caldoai/skills/main/skills/untangle-codebase/SKILL.md on 2026-11-05. Comments and Tests selected; tests cleaned last. Bound worktree only; initial status clean, HEAD c0215de, branch refactor/untangle-codebase-20261106.

Inventory: client app/network/store/session/UI/CSS; controller/rewards/recovery/cameras; city rendering/textures/assets; shared city/ramps/collision/navigation/objectives/protocol; Worker adapter/room lifecycle; tests; Blender authoring; docs/config/CI. Independent client/assets and shared/server/tests agents completed read-only inventories. Existing feature/environment boundaries are useful; directory reshuffles and splitting cohesive files solely by size are unjustified. Recent history already pruned obsolete tests/scripts.

## Decisions before edits

1. Infer server message/player/standing/phase/leg types from existing Zod schemas. Derive mode type/IDs/guard from enum. Hidden links: protocol duplicates schema, optional fields could silently disappear; mode union/menu IDs/guard/enum repeat. Preserve staged client validation/error behavior.
2. Define authored jump-gate locations once for generation/collision/rendering. Hidden links: repeated stunt/freight selection and freight +24 offset. Preserve coordinates/order. Use MAX_PLAYERS/SPAWN_ROAD for repeated spawn 8/3.
3. Own telemetry reset beside defaults; preserve monotonic reward/recovery counters. Centralize shared vehicle boost speed (52 copied into physics/camera/audio/HUD) and origin height (0.8 copied into simulation/model/remote spawn). Derive landmark camera IDs from city data. Remove unused CarVisual re-export.
4. Give traffic explicit simulation ownership/frame priority before renderer/collision. Hidden link: FleetCars renderer updates global positions read by physics; mounting order dictates freshness. Preserve allocation-free mutable frame data and clock trajectories.
5. Remove implementation-restating comments. Retain external contracts, safety/lint explanations, physical and performance constraints.
6. Audit tests last, no deletion quota. Existing suites protect meaningful behavior. Preserve independent authored coordinates; add wire retention/reset/traffic behavior coverage.

## Required special cases retained

Persisted mode/checkpoint migrations restore hibernated rooms; closing sockets can fail sends. Free Drive late join/no objective, Rush order wrapping/deadline precedence and distinct checkpoint/delivery progression are requirements. Atomic phase/alarm transitions and stale deadline guards preserve durability. Near-miss discontinuities, ramp/ledge distinctions, recovery searches and elevated target rejection express physics requirements. Asset revisions/mesh names are documented Blender contracts; colliders remain generated. Three-minute live checks stay opt-in; configuration environments stay separate.

## Baseline (before source edits)

pnpm test: 12 files, 72 tests passed (37.73s). Initial pnpm automatically restored dependencies; used native verify-deps-before-run=false on retry. No baseline assertion failures. Baseline build log recorded bundle completion and the typecheck invocation; its final exit status was lost across the interrupted tool session, so it is not counted as a confirmed full baseline pass. No other baseline failures were established.

## Implementation, reviews and final validation

All listed structural fixes implemented. Server schemas now own inferred types; authored JUMP_GATES feed generation, collision and rendering. Traffic advances at R3F priority -1 before collision/render callbacks. Telemetry reset preserves monotonic audio/camera counters. Shared vehicle origin/boost constants and derived focus IDs remove copied tuning values. Removed unused exports and implementation-restating comments.

Review round 1 found the server target-elevation check also depended on origin height: moved vehicle constants into shared/vehicle.ts and updated that check. Pointer road clearance now derives from origin height. Removed geometry forwarding export. Mode UI counts derive from rules.

Tests audited last: retained meaningful existing coverage; no vacuous test deletion justified. Added three behavior checks: phase wire deadlines/standings retention; reset clears effects without replaying event counters; traffic follows clock, wraps on both axes and clears old-city cars. Expectations use explicit examples, not copies of algorithms. No new dependencies or custom scripts.

Baseline 72/72 tests passed. Post-change first run: 72/75 passed; three existing multi-seed tests exceeded default 5000ms under machine contention (11–17s). All failures were timeouts, not assertions. Rerun uses CLI timeout only; no maintained test weakened. Build generated both bundles and reached typecheck; final confirmed checks pending.

Final review round 2 (read-only, independent) verified all round-1 findings and reported no worthwhile remaining issues. No broad directory reshuffle, new dependency, generated asset rewrite or test deletion was justified by repository evidence.

Confirmed validation:

- `pnpm test --maxWorkers=1 --testTimeout=60000`: 14 files, 75 tests pass (28.79s). Timeout override is local to accommodate shared-machine contention.
- `pnpm build`: exit 0, both production bundles and all TypeScript projects pass. Existing >500kB game bundle advisory also appears in baseline output.
- `pnpm lint:fix`: corrected introduced readable-spacing violations; final exit 0. Replaced the new filter/map chain with one flatMap. No lint rules disabled.
- `pnpm format:check`: pass; `git diff --check`: pass. Final formatting will be rerun after this log update.
- `TEST_GAME_URL=http://127.0.0.1:5199 TEST_GAME_RUSH_TIMER=1 TEST_GAME_RECONNECT=1 pnpm test:integration`: exit 0 against local Worker (no deployment); all live scenarios pass, including actual three-minute deadline and reconnect.

Limitations: no browser-rendered visual comparison or Blender rebuild was requested/performed; geometry assets and rendering algorithms are unchanged. Traffic scheduling is verified by explicit R3F priority and independent code review; trajectory/wrap behavior has direct tests. Actual room behavior is covered by the live protocol suite and durable-room unit tests.
