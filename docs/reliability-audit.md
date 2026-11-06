# Correctness and reliability audit — 2026-11-06

Baseline: remote `main` a4ec1786eb1cbc94ebc50944b8f033e944007bfe, after #84.
Clean bound worktree; no local tests, builds, benchmarks or browser runs.

## Inventory and trust boundaries

- Browser menu → `client/net.ts` → `/api/room/[A-Z]{4}/ws` → Durable Object per room name.
  Public rooms intentionally have no login or private account/tenant model. Room codes are
  invitations, not authentication credentials. Socket attachments identify room members.
- `shared/wire-schema.ts` validates network data with Zod; `protocol.ts` exports the public
  types. First join sets mode; capacity is eight. Repeated joins on one socket return welcome.
- `worker/room-core.ts` persists membership, readiness, scores, phase and deadlines. Phase
  transitions use storage transactions for state and alarms. Attachments survive hibernation;
  city/orders are deterministically regenerated from a persisted seed. Close/error removes players.
- Delivery and checkpoint winners finish immediately; Rush has an authoritative deadline;
  Free Drive permits late joins and has no timer. Finished games reset after ten seconds.
- Client movement is intentionally authoritative, with server objective proximity/height guards.
  Physics, navigation, collision, ramps, recovery, traffic and rewards are shared or isolated domain
  logic covered by existing Vitest tests. They do not authorize account or production operations.
- R3F owns rendering/frame updates; Zustand owns session UI; transient poses avoid React updates.
  Reviewed frame input cleanup, audio cleanup, procedural texture/geometry disposal and cached
  GLTF ownership. No visual defects claimed without rendered evidence.
- CI currently builds, lints, formats, typechecks and runs unit tests. Existing real-worker mode
  integration tests are opt-in and absent from CI. Blender authoring assets and docs/config were
  inspected as supporting artifacts, not deployed services.

## Confirmed findings (recorded before implementation)

1. **Medium, high confidence — invalid readiness changes authoritative state.**
   `room-core.ts` ready handler uses `Boolean(parsed.ready)` after only validating the envelope.
   A joined client sending `ready: "false"` is marked ready, and can trigger countdown when
   everyone else is ready. Expected: only the documented boolean wire field changes readiness;
   malformed fields receive an error without changing the roster or phase.
2. **Medium, high confidence — failed membership/readiness writes poison the live cache.**
   `join`, the ready handler, and `remove` mutate `this.state` before awaiting storage.
   If `put`/`deleteAll` rejects, subsequent messages use the uncommitted cache. A failed removal
   cannot be retried because the player has already disappeared in memory; a failed join can
   return welcome on a repeated join without ever persisting that player. Expected: publish
   membership/readiness and socket identity only after persistence succeeds. Test with injected
   storage failures and retry without eviction, then compare persisted roster and welcome.

3. **Medium, high confidence — lost racing connections hide recovery controls.**
   Independent review found that `client/ui/overlays.tsx` only renders Reconnect inside
   the non-racing/missing-world guard. A socket close retains racing phase, self and city,
   so the HUD still looks live (or disappears in City View) with no rejoin control. Expected:
   connection loss presents recovery regardless of phase/camera. Regression closes the actual
   browser WebSocket during Free Drive in City View and checks recovery, rejoin and leave.

## Rejected hypotheses and scope limits

- Teleporting to objectives is not a new server physics/security defect: client-authoritative
  movement is an explicit documented contract. Do not invent anti-cheat requirements.
- Countdown/finish alarm atomicity, early/retried alarms, deadline scoring, legacy state migration,
  and rematches already have meaningful tests. Retain them; do not redo the structural pass.
- Random four-letter room collisions and public joins follow the existing public-room model;
  no claim that codes isolate private tenant data.
- No production credentials, deployments or data changes are needed. Platform-level storage
  gates and hibernation semantics are not established by the in-memory mock alone; real-worker
  CI coverage complements it. No claim of exhaustive visual/physics validation.

## Regression and framework plan

Use Vitest storage-failure/invalid-input behavior checks with a CI-only pre-fix reproduction:
run the new targeted tests against the baseline core and require failures, then run the fixed suite.
Preserve and enable the real WebSocket four-mode integration suite (including timer/reconnect).
Use the actual tester-army `e2e` 0.23.0 runner and `@e2e-dev/web` 0.15.5, verified from npm metadata
and bundled quickstart/CI/config docs. Both require Node ^22.22.3 or >=24.8; this repo pins 24.22.1.
A browser journey can create a Free Drive room, ready/start, open/close City View, leave, and join
an existing room. Deterministic locators/actions/assertions need no model or credentials. This
proves session/navigation flow, not completion of a driven delivery or every physics interaction.
Dependencies are installed with hooks disabled locally; browser provisioning and all execution
occur only in CI. Independent review and CI evidence will be recorded below.
