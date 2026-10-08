# Two-player online

Two people play one game over WebSockets: one makes a room, gets a code like `KXQT`, the other types it in (or opens `volley.bevsoft.com/?room=KXQT`). Each controls one team. Single player against the random caller stays as it is.

## Goals

- One person per team, in separate browsers, playing the same game.
- The calls stay a real guessing game: neither side can see the other's call, or the dice to come, before locking in their own.
- The current UI, animation and engine are reused. The engine doesn't change.
- Small: one Node process holding rooms in memory, no database, no accounts.

## Not doing (yet)

- More than 2 players, spectators, matchmaking, chat, accounts, saved games or game history.
- Keeping games through a server restart or a deploy. A deploy ends every game in progress.
- More than one server replica.

## Why the server runs the game

The simplest option is a server that only passes messages between the two browsers, with one browser (the host) running the engine. It doesn't work for this game:

1. **The dice can be read in advance.** `Game.rngState` is the seeded RNG state. Whoever holds it can run `step` once for each possible call and see every outcome before choosing. With the 3 shots × 4 defences, that's 12 runs, which takes well under a millisecond, so the host could always pick the best call.
2. **Calls are made at the same time.** Under a relay, the second player to call gets the first player's call in their browser before choosing (it's readable in dev tools even if the UI hides it).

So the server holds the true `Game`, runs `step` itself and sends clients copies **without `rngState` or `seed`**. This doesn't add much work: the engine is plain TypeScript with relative imports (the sim script already runs it under tsx), so the server imports `src/lib/engine/` as it is.

Cheating is unlikely between friends, but these two gaps would make it trivial, not just possible, so closing them is worth the small cost.

## Flow

The game only waits for players in two places: **the call** and **the serve** (at the start of the game and after each point). Everything else plays on its own, as it does now.

1. **Lobby.** The landing page gets a third option next to playing against the computer: *Create room* / *Join room [code]*. The creator is Team A, the joiner is Team B. The creator sees the code and a copy-link button while they wait.
2. **Serve.** In the `serve` and `pointOver` phases, the serving team's player presses Space or Serve. The other player sees "Waiting for B2 to serve". The server steps through the auto phases (serve, pass, set) up to `calls` and sends the whole chain of states.
3. **Calls.** Both players pick at the same time, the attacker a shot and the defender a block and dig, as in single player now. After locking in you see "Waiting for the other team". The opponent sees only that you've locked in, never your call. Once both calls are in, the server steps the `calls` phase with both choices, steps `hit`, runs any auto phases that follow, and sends the chain.
4. **Point over / game over.** Back to step 2. At game over, either player can press *Rematch*. The game starts once both have pressed it, with a new seed and the two players swapping teams. The engine always has B serve first, so swapping teams is how the first serve alternates.

## Protocol

JSON over one WebSocket at `/ws`. Every message has a `type`.

Client → server:

| type | fields | when |
| --- | --- | --- |
| `create` | | lobby |
| `join` | `code` | lobby |
| `resume` | `code`, `token` | reconnecting |
| `serve` | | your team serves, phase `serve` or `pointOver` |
| `shot` | `shot` | you attack, phase `calls` |
| `defence` | `block`, `stance` | you defend, phase `calls` |
| `rematch` | | `gameOver` |

Server → client:

| type | fields | meaning |
| --- | --- | --- |
| `seat` | `code`, `team`, `token` | you're in; keep the token to reconnect |
| `states` | `chain: PublicGame[]` | play these in order (one action's steps) |
| `snapshot` | `game: PublicGame`, `locked: TeamId[]` | where things stand, after a join or resume; no animation |
| `presence` | `opponent: 'waiting' \| 'connected' \| 'away'` | for the status line |
| `locked` | `team` | that team has locked in a call, contents hidden |
| `error` | `message` | bad code, room full, etc. |

`PublicGame = Omit<Game, 'rngState' | 'seed'>`. The server ignores anything sent out of turn or with values that aren't valid (a shot that's not `line | cross | tip`, a defence from the attacking team, a second call). It never trusts the client's idea of the phase.

## Server

New `server/` folder, about 250 lines:

- `server/room.ts`: pure room logic, with no sockets. `Room { code, game, seats: {A, B}, pending: {shot?, defence?}, rematch: Set<TeamId>, lastActive }`, plus `handle(room, team, msg) → { send: [...], broadcast: [...] }`. All the turn rules live here, so they can be unit tested.
- `server/index.ts`: a `ws` server on port 8787 that only does the networking. It maps sockets to seats, sends a ping every 20 s and drops sockets that don't answer, and runs the cleanup.
- Room codes: 4 letters from `BCDFGHJKLMNPQRSTVWXZ`, checked for clashes. That's consonants only, so codes can't spell words, and leaving out I and O avoids mixing them up with 1 and 0. 20 letters give 20⁴ = 160k codes, which is enough for a handful of rooms at once. Guessing someone's code only gets you into a room with a free seat, so there's no rate limit for v1.
- Seeds come from `crypto.randomInt`.
- Rooms are deleted after 30 minutes with nobody connected, or 2 hours without a move.
- Run with `tsx server/index.ts`. It doesn't need a build step for something this small. Add a `ws` dependency and an `npm run server` script.

### Reconnecting

This is part of v1, not an extra: a phone that locks its screen drops the socket, and without reconnecting that ends the game. On `seat` the client saves `{code, token}` in `sessionStorage`. When the socket closes it reconnects with backoff (1 s, 2 s, 4 s, up to 10 s) and sends `resume`. The server sends a `snapshot` back and tells the opponent `presence: 'connected'`. A seat stays held while its player is away, until the room expires.

## Client changes

The main change is in `+page.svelte`, where the page currently calls `step` itself.

- Split out the transport: a `Driver` with the same moves the page makes now (`serve()`, `shot(s)`, `defence(d)`) and a way to listen for chains of states. `localDriver` wraps the current code (`step`, `withShot`, `withDefence`, `playsItself`). `socketDriver` sends messages and passes on the `states` it receives.
- `play(first, attack)` currently builds the chain by stepping. Change it to `playChain(chain: Game[])` so it can take a chain from either driver; the `show` timing stays the same.
- `controlled` is set from the seat (`A` or `B`) and can't be changed. The debug drawer hides Play rally, Play game, Replay and seed in online games. It keeps the log and the dice.
- `Controls` gets a `waiting` prop: after locking in, the buttons are disabled and the status line says "Waiting for Team B…". The serve button shows only for the serving team.
- Team labels: show "You" or "Them" next to A and B in the top bar and the callouts, so a Team B player doesn't have to remember which they are.
- Skipping with Space still only fast-forwards your own animation. Each client animates the chain at its own pace, so one player may be a beat ahead of the other. That's fine, because the server only accepts a call when the phase is `calls`.

## Deploy

- `Dockerfile.server`: `node:26-bookworm-slim`, `npm ci --omit=dev` plus tsx, `CMD tsx server/index.ts`. It's a separate image from the nginx one.
- k8s: a `volley-ws` Deployment (with `replicas: 1`, because rooms are in memory) and Service, plus a `/ws` path in the existing Ingress that points at it. Traefik passes WebSocket upgrades through without extra config. Same for `k8s-dev`.
- Skaffold: add the second artifact.
- Local dev: `vite.config.ts` proxies `server.proxy['/ws'] = { target: 'ws://localhost:8787', ws: true }`, so the client always connects to `/ws` on its own origin. Run `npm run server` next to `npm run dev`.

## Testing

- `server/room.test.ts` (Vitest, no sockets) with a fixed seed: create and join, the third person is refused, a call out of turn or from the wrong team is ignored, a lone call gets only `locked` to the opponent (never the call's contents), both calls give the same chain as `step(step(g, fixedChoosers(calls)))` plus the auto phases, `rngState` and `seed` are never in anything sent, resume gives the seat back, rematch needs both.
- One integration test: start the server on port 0, connect two `ws` clients and play a rally.
- By hand: two browser windows locally, then a phone on mobile data against the dev deploy, locking the screen partway through a rally.

## Build order

1. `server/room.ts` + tests (the rules, with no networking).
2. `server/index.ts`, the Vite proxy, and the integration test.
3. The driver split and `playChain` in the page, with single player checked to still work exactly as before.
4. The lobby UI, `socketDriver`, waiting and serve states, and You/Them labels.
5. Reconnecting.
6. Dockerfile, k8s and Skaffold, then deploy to `volley-dev`.

## Open questions

- **Turn timers.** If one player walks away, the game waits forever. Leave it for v1 (it's two friends) or auto-lock a random call after, say, 20 s?
- **Who's A and B.** The creator is A for now. Rematch swaps sides so the serve alternates.
- **Showing calls afterwards.** Once both are in, the `calls` log entry shows both sides' calls, the same as now. That's intended.
