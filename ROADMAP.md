# Feature roadmap

Planning baseline: `e849b0eeaceb` on `origin/main`, 2026-10-26. Proposed game work comes after Digits/MCP product priorities.

## Outcome

Help a group of friends start and finish a race together with little setup friction. The [current game](readme.md) supports up to eight drivers, four modes, a lobby, rematches and a coastal city.

## 1. A clear invitation-to-race journey

Offer an explicit room invitation that opens the correct lobby and explains its mode, capacity and current phase. Make the host's next action and each driver's readiness visible.

Acceptance:

- A friend can follow the invitation and identify the intended room before joining.
- Full, missing and already-started rooms have distinct outcomes.
- A connection interruption explains whether the player can rejoin the existing session.
- All drivers see the same authoritative start and mode; refreshing does not create a duplicate driver.

Pilot one small friend group. Record time to the first completed race, join failures and host interventions. Do not collect chat or unnecessary identifiers.

## 2. Make the rematch worth choosing

Build on the existing return-to-lobby flow with a readable race recap and an explicit next-mode choice. Explain ties and unfinished drivers using server-recorded outcomes.

Acceptance: the displayed result agrees across clients; a departing host does not strand the remaining group without a clear action.

## 3. Introduce the driving controls gently

Add a short optional practice route for drifting, boosting and finding delivery markers. Reuse the current world before expanding the map.

## Boundaries

Keep social play small. Public matchmaking, global leaderboards, monetization and more world assets are deferred until the group loop works well. The room server remains authoritative; user-facing polish must retain existing protocol validation. Use native runtime and existing test commands. The meaningful signal is that friends complete a session and request another.
