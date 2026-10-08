# Online play and replays

Two people play one game over WebSockets: one makes a room, gets a code like `KXQT`, the other types it in (or opens `volley.bevsoft.com/?room=KXQT`). Each controls one team. Single player against the computer stays as it is.

Every finished game, online or against the computer, is saved to Postgres and can be watched again on the court at `/replay/<id>`.

## Goals

- One person per team, in separate browsers, playing the same game.
- The calls stay a real guessing game: neither side can see the other's call, or the dice to come, before locking in their own.
- Replays play back on the same court with the same animation, for as long as the rules haven't changed.
- The current UI, animation and engine are reused. The engine doesn't change.
- One Node server (SvelteKit's `adapter-node`, with WebSockets attached) and the existing Postgres in the `db` namespace.

## Not doing (yet)

- More than 2 players, spectators, matchmaking, chat or accounts.
- Keeping live games through a server restart or a deploy. Rooms are in memory, so a deploy ends every game in progress. Games that finished before the deploy are already in Postgres.
- More than one server replica.
- Saving games against the computer that weren't finished.

## Why the server runs the game

The simplest option is a server that only passes messages between the two browsers, with one browser (the host) running the engine. It doesn't work for this game:

1. **The dice can be read in advance.** `Game.rngState` is the seeded RNG state. Whoever holds it can run `step` once for each possible call and see every outcome before choosing. With the 3 shots × 4 defences, that's 12 runs, which takes well under a millisecond, so the host could always pick the best call.
2. **Calls are made at the same time.** Under a relay, the second player to call gets the first player's call in their browser before choosing (it's readable in dev tools even if the UI hides it).

So the server holds the true `Game`, runs `step` itself and sends clients copies **without `rngState` or `seed`**. The engine is plain TypeScript with relative imports (the sim script already runs it under tsx), so the server imports `src/lib/engine/` as it is.

## Flow

The game only waits for players in two places: **the call** and **the serve** (at the start of the game and after each point). Everything else plays on its own, as it does now.

1. **Lobby.** The landing page gets a third option next to playing against the computer: *Create room* / *Join room [code]*. The creator is Team A, the joiner is Team B. The creator sees the code and a copy-link button while they wait.
2. **Serve.** In the `serve` and `pointOver` phases, the serving team's player presses Space or Serve. The other player sees "Waiting for B2 to serve". The server steps through the auto phases (serve, pass, set) up to `calls` and sends the whole chain of states.
3. **Calls.** Both players pick at the same time, the attacker a shot and the defender a block and dig, as in single player now. After locking in you see "Waiting for the other team". The opponent sees only that you've locked in, never your call. Once both calls are in, the server steps the `calls` phase with both choices, steps `hit`, runs any auto phases that follow, and sends the chain.
4. **Point over / game over.** Back to step 2. At game over the server saves the game and sends both players its replay link. Either player can press *Rematch*. The game starts once both have pressed it, with a new seed and the two players swapping teams. The engine always has B serve first, so swapping teams is how the first serve alternates.

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
| `saved` | `id` | the game is over and saved; the replay is at `/replay/<id>` |
| `error` | `message` | bad code, room full, etc. |

`PublicGame = Omit<Game, 'rngState' | 'seed'>`. The server ignores anything sent out of turn or with values that aren't valid (a shot that's not `line | cross | tip`, a defence from the attacking team, a second call). It never trusts the client's idea of the phase.

## Replays

### What's stored

The engine is deterministic, so a game is just its **seed plus the list of calls**, in order. Replaying is: `newGame(seed)`, then step through, giving each `calls` step its recorded calls. That's a few KB per game. The browser already has the engine and the animation, so the server only stores and serves the record. The replay page rebuilds the states locally and plays them with the same `playChain` the live game uses.

Each call is recorded with who made it:

```ts
type RecordedCall = { shot: Shot; block: Channel; stance: Stance; byComputer: { shot: boolean; defence: boolean } };
```

### Games against the computer

`randomChoosers` draws the computer's calls from the **same RNG as the dice**. Replaying a recorded computer call as a fixed value would skip that draw and every die after it would come out different. Replay therefore makes each call the way it was originally made: the computer's parts through `randomChoosers` (which draws again and gets the same value), the player's parts fixed. The engine calls `shot`, `block`, `stance` in a fixed order, so the draws line up. This needs no engine change and keeps every existing seed playing the same game.

The recorded computer values are still stored. Replay checks them against what it gets, and a mismatch means the rules changed or the record was tampered with.

The browser runs these games, so it uploads the record at game over: `POST /api/games { seed, calls, version, rulesHash }`. The server doesn't trust the upload. It replays it with its own engine, refuses it if the computer's recorded calls don't match or the game doesn't end, and stores its **own** final score and log. A game can be faked only by playing it, and against the computer that hurts nobody. The body is capped at 64 KB and there's a per-IP rate limit (a few uploads a minute), because the endpoint is open.

The debug drawer's Play rally / Play game buttons make every call by the computer, so they record the same way. Changing "You play" mid-game is fine too, because each call records who made it.

### Versions

Each game stores the full app version (`1.2.3`) and its major version, as you asked. Replays animate only for games from the **current major version**. Games from older majors stay in the list and open as the stored log, as text, because the current engine would play them out differently.

That rule only works if every change to the rules bumps the major version. Two problems:

1. **The app is on `0.0.1`.** Under "replay within a major", everything until `1.0.0` counts as one version, and the rules are still changing (`config.ts`). I'd go to `1.0.0` when this ships and bump the major on every rules change from then on.
2. **It's easy to forget.** A rules tweak shipped as a patch would make old replays play a game that never happened, with nothing to show it. As a safety net, the build also stores a **rules hash**: a SHA-256 of `src/lib/engine/*.ts` (minus tests), computed at build and baked into both client and server. A replay animates only when the major *and* the hash match; otherwise it falls back to the stored log. The hash is about 10 lines, and it costs nothing when you remember to bump. If it proves right every time, it could replace the major-version rule later.

The version comes from `package.json` (the Docker build has no `.git`, so `git describe` isn't available). Release with `npm version major|minor|patch`, which bumps `package.json`, commits and creates the `vX.Y.Z` tag your Skaffold `tagPolicy` already reads, so the image tag and the stored version can't drift apart.

### Pages

- `/replays`: recent games, newest first, 50 a page: date, mode (online / computer), final score, version. Games from an older major show "log only". Games you played in this browser are marked (their ids are kept in `localStorage`); there are no accounts.
- `/replay/<id>`: the court, with play/pause, step (Space) and next rally. Ids are random 10-character strings, so a link can be shared but not guessed. The list is public, but there's nothing personal in a game.

## Storage

The existing Postgres in the `db` namespace, with a database and login role just for this app.

```sql
create table games (
  id          text primary key,           -- random, 10 chars
  mode        text not null check (mode in ('online', 'computer')),
  version     text not null,              -- '1.2.3'
  major       int  not null,
  rules_hash  text not null,
  seed        bigint not null,
  calls       jsonb not null,             -- RecordedCall[]
  score_a     int not null,
  score_b     int not null,
  winner      text not null,
  log         jsonb not null,             -- final log, for log-only replays
  created_at  timestamptz not null default now()
);
create index games_recent on games (created_at desc);
```

- Client: [`postgres`](https://github.com/porsager/postgres) (small, no native build), pool of 5.
- Migrations: numbered `.sql` files in `server/migrations/`, applied at startup inside a transaction holding a Postgres advisory lock. During a rolling update the old and new pod overlap briefly, so two processes can start at once.
- No `DATABASE_URL` set (for example `npm run dev` with no database) → an in-memory store. Everything works and nothing is kept.
- Games are kept indefinitely. A full game's row is roughly 20–50 KB with the log, so thousands of games is still tens of MB.

### Connecting from the `volley` namespace

A pod can only read Secrets in its own namespace, so the Deployment can't point at the Secret in `db`. Options:

1. **Recommended: a role and Secret just for this app.** Run once against Postgres as the admin: `create role volley login password '…'; create database volley owner volley;` (and `volley_dev` for the dev namespace). Then create `volley-db` in the `volley` namespace by hand with `DATABASE_URL=postgres://volley:…@<service>.db.svc.cluster.local:5432/volley`. It isn't committed to the repo. The app can then only touch its own database.
2. **Copy the existing Secret across** with a tool such as reflector or external-secrets, if you already run one. That's less setup, but if the existing Secret is the admin login, the app gets full access to every database on that server.

Pods reach the database through cluster DNS, at `<service>.db.svc.cluster.local`. If the `db` namespace has NetworkPolicies, they need to let `volley` and `volley-dev` in on 5432.

## Server

SvelteKit switches from `adapter-static` to `adapter-node`. The adapter builds a `handler(req, res, next)` that serves the pages, the `/api` routes and the static files. It already caches `_app/immutable/*` for a year and sets `precompress` for gzip and brotli, so it covers what `nginx.conf` does now. The game and replay pages keep `ssr = false`. SvelteKit 3.0.1 has no WebSocket support (checked in its source), so the sockets are attached in a small server of our own.

- `src/lib/server/store.ts`: the `GameStore` interface (`save`, `get`, `recent`) with Postgres and in-memory versions.
- `src/lib/replay.ts`: `record` and `replay`, shared by the browser, the upload check and the online rooms.
- `src/routes/api/games/+server.ts`: `POST` (upload a computer game) and `GET` (recent). `src/routes/api/games/[id]/+server.ts`: `GET` one.
- `server/room.ts`: pure room logic, with no sockets. `Room { code, game, seats: {A, B}, pending: {shot?, defence?}, calls: RecordedCall[], rematch: Set<TeamId>, lastActive }`, plus `handle(room, team, msg) → { send, broadcast, save? }`. All the turn rules live here, so they can be unit tested.
- `server/sockets.ts`: `attachSockets(httpServer, store)`. It handles `upgrade` requests for `/ws` only and leaves every other upgrade alone (in dev, Vite's hot reload has its own socket on the same server). It maps sockets to seats, sends a ping every 20 s and drops sockets that don't answer, and runs the cleanup.
- `server/index.ts`: the production entry. A `node:http` server on 8080 that runs migrations, mounts `build/handler.js` and calls `attachSockets`.
- Room codes: 4 letters from `BCDFGHJKLMNPQRSTVWXZ`, checked for clashes. That's consonants only, so codes can't spell words, and leaving out I and O avoids mixing them up with 1 and 0. 20 letters give 20⁴ = 160k codes, which is enough for a handful of rooms at once.
- Seeds come from `crypto.randomInt`.
- Rooms are deleted after 30 minutes with nobody connected, or 2 hours without a move.
- Run with `tsx server/index.ts`. The engine imports files without extensions (`'./rules'`), which Node's own loader won't resolve, so the socket side needs tsx.

The SvelteKit routes are bundled by Vite and the socket server runs under tsx, so the store module loads twice in production, giving two pools of 5 connections. That's fine at this size, and simpler than sharing one between them.

### Reconnecting

This is part of v1, not an extra: a phone that locks its screen drops the socket, and without reconnecting that ends the game. On `seat` the client saves `{code, token}` in `sessionStorage`. When the socket closes it reconnects with backoff (1 s, 2 s, 4 s, up to 10 s) and sends `resume`. The server sends a `snapshot` back and tells the opponent `presence: 'connected'`. A seat stays held while its player is away, until the room expires.

## Client changes

The main change is in `+page.svelte`, where the page currently calls `step` itself.

- Split out the transport: a `Driver` with the same moves the page makes now (`serve()`, `shot(s)`, `defence(d)`) and a way to listen for chains of states. `localDriver` wraps the current code (`step`, `withShot`, `withDefence`, `playsItself`) and records the calls. `socketDriver` sends messages and passes on the `states` it receives. `replayDriver` steps a stored game.
- `play(first, attack)` currently builds the chain by stepping. Change it to `playChain(chain: Game[])` so it can take a chain from any driver; the `show` timing stays the same.
- Online, `controlled` is set from the seat (`A` or `B`) and can't be changed. The debug drawer hides Play rally, Play game, Replay and seed in online games. It keeps the log and the dice.
- `Controls` gets a `waiting` prop: after locking in, the buttons are disabled and the status line says "Waiting for Team B…". The serve button shows only for the serving team.
- Team labels: show "You" or "Them" next to A and B in the top bar and the callouts, so a Team B player doesn't have to remember which they are.
- Game over shows a "Watch replay" link once the game is saved.
- Skipping with Space still only fast-forwards your own animation. Each client animates the chain at its own pace, so one player may be a beat ahead of the other. That's fine, because the server only accepts a call when the phase is `calls`.

## Deploy

There's still one image, one Deployment and one Service, and the Ingress doesn't change. Traefik passes WebSocket upgrades through without extra config.

- `Dockerfile`: the build stage stays as it is. The serve stage changes from `nginx-unprivileged` to `node:26-bookworm-slim` with production dependencies plus tsx, `build/`, `server/`, `src/lib/engine/` and `src/lib/replay.ts`, `USER node` and `CMD tsx server/index.ts` on port 8080. `nginx.conf` is deleted.
- `k8s/deployment.yaml`: `DATABASE_URL` from the `volley-db` Secret. `runAsUser` changes from 101 (nginx) to 1000 (node). Raise the memory limit from 64Mi to 128Mi: Node with tsx idles around 50–70 MB (an estimate, not measured), where nginx used a few. Keep `replicas: 1`, because rooms are in memory. The read-only root and the `/tmp` volume still work. Add a `/healthz` route for the probes that doesn't touch the database, so a database outage doesn't restart the pod. Saving fails and logs instead.
- Dev, both `npm run dev` and `skaffold dev`: a small Vite plugin in `vite.config.ts` calls `attachSockets(server.httpServer, store)` from `configureServer`, so `/ws` works on the dev server itself. `k8s-dev` gets the same `DATABASE_URL`, from a `volley-db` Secret in `volley-dev` that points at the `volley_dev` database. Locally, leave it unset for the in-memory store, or `kubectl port-forward -n db svc/<service> 5432` and point at that. Changes to the server code need a dev server restart; Vite won't hot-reload them.

The cost of a single server is that any deploy, even a CSS change, restarts the process and ends games in progress. You deploy by hand from tags, so check nobody's playing first.

## Testing

- `src/lib/replay.test.ts`: for 200 seeds, play a game where each call is randomly made by the player or the computer, record it, replay it, and check the final state matches exactly. Also check that a tampered computer call is caught, and that a mismatched hash or major falls back to the log.
- `server/room.test.ts` (Vitest, no sockets) with a fixed seed: create and join, the third person is refused, a call out of turn or from the wrong team is ignored, a lone call gets only `locked` to the opponent (never the call's contents), both calls give the same chain as `step` with those calls plus the auto phases, `rngState` and `seed` are never in anything sent, resume gives the seat back, rematch needs both, and game over saves a record that replays to the same game.
- Upload route: a valid record is stored with the server's own score, and a game that doesn't finish, a bad computer call, an oversized body or a wrong hash are refused.
- One integration test: start an `http` server on port 0 with `attachSockets` and the in-memory store, connect two `ws` clients and play a rally. Check that an upgrade on another path isn't taken.
- The Postgres store and migrations run against `TEST_DATABASE_URL` when it's set, and are skipped otherwise.
- By hand: two browser windows locally, then a phone on mobile data against the dev deploy, locking the screen partway through a rally.

## Build order

1. `src/lib/replay.ts` and its tests, plus the rules hash. That's the riskiest part, and it needs no server.
2. `server/room.ts` + tests (the rules, with no networking).
3. Switch to `adapter-node`. The store, migrations and the `/api/games` routes, against the in-memory store first.
4. `server/sockets.ts`, the Vite plugin, and the integration test.
5. The driver split and `playChain` in the page, with single player checked to still work exactly as before. Upload games against the computer at game over.
6. The lobby UI, `socketDriver`, waiting and serve states, and You/Them labels.
7. The replay pages.
8. Reconnecting.
9. Database role and Secrets, `server/index.ts`, the Dockerfile and deployment changes. Deploy to `volley-dev` first, then `npm version major` to `1.0.0` and `skaffold run`.

## Open questions

- **The Postgres service name and Secret.** Which Service in `db` is it, and is there already a tool for copying Secrets between namespaces?
- **Turn timers.** If one player walks away, the game waits forever. Leave it for v1 (it's two friends) or auto-lock a random call after, say, 20 s?
- **Who's A and B.** The creator is A for now. Rematch swaps sides so the serve alternates.
