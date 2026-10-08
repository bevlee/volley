# Online play and replays

Two people play one game over Socket.IO (WebSockets, as in onlyone): one makes a room, gets a code like `KXQT`, the other types it in (or opens `volley.bevsoft.com/?room=KXQT`). Each controls one team. Single player against the computer stays as it is.

Every finished game, online or against the computer, is saved to Postgres and can be watched again on the court at `/replay/<id>`.

## Goals

- One person per team, in separate browsers, playing the same game.
- The calls stay a real guessing game: neither side can see the other's call, or the dice to come, before locking in their own.
- Online, every action has a 20-second clock, shown to both players. When it runs out, the computer makes that player's choice.
- Replays play back on the same court with the same animation. When the rules or balance change, old games are deleted.
- The current UI, animation and engine are reused. The engine doesn't change.
- One Node server (SvelteKit's `adapter-node`, with Socket.IO attached) and the existing Postgres in the `db` namespace.

## Not doing (yet)

- More than 2 players, spectators, matchmaking, chat or accounts.
- Keeping live games through a server restart or a deploy. Rooms are in memory, so a deploy ends every game in progress. Games that finished before the deploy are already in Postgres.
- More than one server replica.
- Saving games against the computer that weren't finished.

## What's reused from onlyone

`bevlee/onlyone` (branch `claude/charming-bohr-81568c`) already has a Socket.IO game server. Its rules have nothing in common with this game, so the code doesn't carry over as it is, but these parts do:

- **Socket.IO instead of a bare `ws` server.** It brings reconnecting with backoff, heartbeats, rooms with broadcast, and acknowledgement callbacks for requests. It also has `connectionStateRecovery`, which replays the events a client missed during a short drop (up to 2 minutes by default). That deletes most of the reconnecting code this plan had. The cost is the client library in the bundle, on the order of 10–15 KB gzipped (an estimate).
- **Identity in the handshake.** onlyone sends `{ room, username }` in `socket.handshake.auth`. Here the client sends a random `playerId` it keeps in `localStorage`. The server seats players by that ID, so reconnecting is just connecting again: no `resume` message and no token.
- **The timeout pattern.** onlyone's `difficultyPhase` waits for a choice or the time limit, then picks at random. The turn clock here does the same.

Not reused:

- **The waiting loop.** `waitForCondition` checks every second, so a choice can wait up to a second before the game goes on. Its timeout also isn't cancelled once the condition is met. Here the room reacts to each event straight away, and there's one timer per room, cleared when both sides have locked in.
- **The client-side timer.** `Timer.svelte` counts down in the browser and submits when it reaches zero, so each player's own clock decides. Here the server's clock decides, and the browser only shows it. The red last seconds are kept.
- **The nginx sidecar and the SQLite word store.** One Node server and Postgres replace them. (In onlyone, `words.db` sits in the container without a volume, so it's reset on every deploy.)

## Why the server runs the game

The simplest option is a server that only passes messages between the two browsers, with one browser (the host) running the engine. It doesn't work for this game:

1. **The dice can be read in advance.** `Game.rngState` is the seeded RNG state. Whoever holds it can run `step` once for each possible call and see every outcome before choosing. With the 3 shots × 4 defences, that's 12 runs, which takes well under a millisecond, so the host could always pick the best call.
2. **Calls are made at the same time.** Under a relay, the second player to call gets the first player's call in their browser before choosing (it's readable in dev tools even if the UI hides it).

So the server holds the true `Game`, runs `step` itself and sends clients copies **without `rngState` or `seed`**. The engine is plain TypeScript with relative imports (the sim script already runs it under tsx), so the server imports `src/lib/engine/` as it is.

## Flow

The game only waits for players in two places: **the call** and **the serve** (at the start of the game and after each point). Everything else plays on its own, as it does now.

1. **Lobby.** The landing page gets a third option next to playing against the computer: *Create room* / *Join room [code]*. The creator is Team A, the joiner is Team B. The creator sees the code and a copy-link button while they wait.
2. **Serve.** In the `serve` and `pointOver` phases, the serving team's player presses Space or Serve, or the clock serves for them. The other player sees "Waiting for B2 to serve". The server steps through the auto phases (serve, pass, set) up to `calls` and sends the whole chain of states.
3. **Calls.** Both players pick at the same time, the attacker a shot and the defender a block and dig, as in single player now. After locking in you see "Waiting for the other team". The opponent sees only that you've locked in, never your call. If a clock runs out, the computer makes that side's call (see [Turn clock](#turn-clock)). Once both calls are in, the server steps the `calls` phase with both choices, steps `hit`, runs any auto phases that follow, and sends the chain.
4. **Point over / game over.** Back to step 2. At game over the server saves the game and sends both players its replay link. Either player can press *Rematch*. The game starts once both have pressed it, with a new seed and the two players swapping teams. The engine always has B serve first, so swapping teams is how the first serve alternates.

## Turn clock

Online games only. Single player against the computer has no clock.

- **What it covers:** every action a player owes. At the serve, that's the serving team. At the call, both teams at once, each for their own part.
- **The server runs it.** When the server sends a chain of states that ends at a decision, the clock starts at *the chain's playback time + 20 s*. The players' 20 seconds then begin about when the decision shows on their screens, not while the serve and set are still animating. Playback time is worked out from the timing constants (`MOVE_MS`, `RESOLVE_MS`, `AFTER_CALLS_MS`…), which move out of `+page.svelte` into `src/lib/ui/timing.ts` so the page and the server share them. A player who skips the animation with Space just sees a few more seconds.
- **Messages carry `msLeft`, not a timestamp.** Two phones' clocks can be seconds apart. The client sets its own deadline to receipt time + `msLeft`, so network delay makes the on-screen clock a few hundred milliseconds generous. The server's clock is the one that counts: a call that arrives after it ran out is ignored, because the computer has already chosen.
- **On screen, for both players:** a bar that drains, with the seconds, under the status line. At the call there are two clocks, "Your call 14" and "Their call 14". When a side locks in, its clock disappears on both screens. The last 5 seconds are red.
- **When it runs out:** the computer makes the missing part with `randomChoosers`, recorded as `byComputer`. It replays exactly as a computer call does (see [Replays](#replays)). A serve that times out is served automatically. Both screens show "Time's up, the computer called for Team B" in the status line and log.
- **Away players:** the clock keeps running for a player who has disconnected, so the game goes on with the computer playing their side. A phone that locks for a minute comes back a few points later. If **both** players are away, the clocks stop until one reconnects; the room expiry tidies up after that.
- In `server/room.ts` the time is passed in (`handle(room, team, msg, now)`, `tick(room, now)`), so tests use fake time and the socket layer owns the one real `setTimeout` per room.

## Protocol

Socket.IO events on the default path, `/socket.io/`. The client connects with `auth: { playerId }`.

Client → server (the ones marked *ack* reply through Socket.IO's acknowledgement callback):

| event | fields | when |
| --- | --- | --- |
| `create` *ack* | | lobby; replies `{ code, team }` |
| `join` *ack* | `code` | lobby; replies `{ code, team }` or `{ error }` (bad code, room full) |
| `serve` | | your team serves, phase `serve` or `pointOver` |
| `shot` | `shot` | you attack, phase `calls` |
| `defence` | `block`, `stance` | you defend, phase `calls` |
| `rematch` | | `gameOver` |

Server → client:

| event | fields | meaning |
| --- | --- | --- |
| `states` | `chain: PublicGame[]` | play these in order (one action's steps) |
| `snapshot` | `game: PublicGame`, `code`, `team`, `locked: TeamId[]`, clocks | where things stand, sent on every connection whose `playerId` already has a seat; no animation |
| `presence` | `opponent: 'waiting' \| 'connected' \| 'away'` | for the status line |
| `locked` | `team` | that team has locked in a call, contents hidden |
| `clock` | `action: 'serve' \| 'call'`, `teams: TeamId[]`, `msLeft` | who owes an action and how long they have; `teams: []` stops the clock |
| `timedOut` | `team`, `action` | the clock ran out and the computer chose for that team |
| `saved` | `id` | the game is over and saved; the replay is at `/replay/<id>` |

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

The recorded computer values are still stored. Replay checks them against what it gets, and a mismatch means the record was tampered with. Calls the clock made in online games are recorded the same way, as computer calls.

The browser runs these games, so it uploads the record at game over: `POST /api/games { seed, calls, fingerprint }`. The server doesn't trust the upload. It replays it with its own engine, refuses it if the computer's recorded calls don't match or the game doesn't end, and stores its **own** final score and log. A game can be faked only by playing it, and against the computer that hurts nobody. The body is capped at 64 KB and there's a per-IP rate limit (a few uploads a minute), because the endpoint is open.

The debug drawer's Play rally / Play game buttons make every call by the computer, so they record the same way. Changing "You play" mid-game is fine too, because each call records who made it.

### Rules changes delete old games

When the engine or the balance changes, old games would replay into games that never happened, so they're deleted.

What counts as a change is decided by a **rules fingerprint**, not the version number: play 50 fixed seeds to the end with `randomChoosers` and hash each game's score, step count and final RNG state. Any change that alters how a game plays out (a rule, a number in `config.ts`, the order dice are rolled) changes the fingerprint. Comments, refactors and log wording don't. Hashing the engine's source instead would also wipe every game on a comment edit. 50 full games take on the order of 100 ms (an estimate), and the result is computed at build time and baked into the client and server.

A rare branch that none of the 50 games reaches could change without moving the fingerprint. Then an old replay could go wrong instead of being deleted. Raising the seed count makes that less likely. Accepting it is cheaper than requiring a version bump for every rules change.

- At startup, after migrations: `delete from games where fingerprint <> $current`.
- Every query also filters by the current fingerprint. During a rolling update the old pod can still save a game for a few seconds after the new one has deleted the old ones; that row is hidden and goes at the next startup.
- An upload from a browser tab still running the old version is refused: its fingerprint doesn't match.
- **Dev and prod must use separate databases.** Otherwise running `skaffold dev` with a rules change would delete every production game. The plan already has `volley` and `volley_dev`. The server also refuses to start if `PGDATABASE` is `volley` while `NODE_ENV` isn't `production`.

The version from `package.json` is still stored, for display only.

### Pages

- `/replays`: recent games, newest first, 50 a page: date, mode (online / computer), final score, version. Games you played in this browser are marked (their ids are kept in `localStorage`); there are no accounts.
- `/replay/<id>`: the court, with play/pause, step (Space) and next rally. Ids are random 10-character strings, so a link can be shared but not guessed. The list is public, but there's nothing personal in a game.

## Storage

The existing Postgres in the `db` namespace, with a database and login role just for this app.

```sql
create table games (
  id          text primary key,           -- random, 10 chars
  mode        text not null check (mode in ('online', 'computer')),
  version     text not null,              -- '1.2.3', for display
  fingerprint text not null,              -- rules fingerprint; other values are deleted at startup
  seed        bigint not null,
  calls       jsonb not null,             -- RecordedCall[]
  score_a     int not null,
  score_b     int not null,
  winner      text not null,
  created_at  timestamptz not null default now()
);
create index games_recent on games (fingerprint, created_at desc);
```

- Client: [`postgres`](https://github.com/porsager/postgres) (small, no native build), pool of 5.
- Migrations: numbered `.sql` files in `server/migrations/`, applied at startup inside a transaction holding a Postgres advisory lock. During a rolling update the old and new pod overlap briefly, so two processes can start at once.
- No `PGHOST` set (for example `npm run dev` with no database) → an in-memory store. Everything works and nothing is kept.
- Games are kept until the rules change. Without the log, a row is a few KB.

### Connecting from the `volley` namespace

Kubernetes doesn't let a pod read a Secret from another namespace, which is why you end up copying it by hand into every app's namespace. Two ways to stop doing that:

1. **Recommended: [Reflector](https://github.com/emberstack/kubernetes-reflector).** Install it once (one Helm chart), then annotate the source Secret in `db`:
   ```yaml
   reflector.v1.k8s.emberstack.com/reflection-allowed: "true"
   reflector.v1.k8s.emberstack.com/reflection-allowed-namespaces: "volley,volley-dev"
   reflector.v1.k8s.emberstack.com/reflection-auto-enabled: "true"
   ```
   Setup, run once from a machine with cluster access:
   ```sh
   helm repo add emberstack https://emberstack.github.io/helm-charts
   helm upgrade --install reflector emberstack/reflector -n kube-system
   kubectl annotate secret <secret> -n db \
     reflector.v1.k8s.emberstack.com/reflection-allowed=true \
     reflector.v1.k8s.emberstack.com/reflection-allowed-namespaces=volley,volley-dev \
     reflector.v1.k8s.emberstack.com/reflection-auto-enabled=true
   ```
   If a Helm chart owns that Secret (the Postgres chart, say), a chart upgrade can strip annotations added by hand. Set them through the chart's values instead, if it has a setting for Secret annotations.
   A copy appears in each listed namespace and stays in sync when the password changes. A new app means adding its namespace to that list, nothing else. There's nothing to commit in this repo.
2. **[External Secrets Operator](https://external-secrets.io)** with its Kubernetes provider. Each app commits an `ExternalSecret` (names and keys, never the values) that pulls from `db`, and it can template the parts into a `DATABASE_URL`. It's declarative and lives in each repo, but it's more setup: the operator, a `ClusterSecretStore` and a service account allowed to read `db`'s Secrets.

Reflector fixes the copying with the least setup. ESO is better if you want each app's database access visible in its own repo.

Either way, each app gets **the same login** if the Secret you mirror is the Postgres admin one, so every app can read and drop every other app's data. That's an accepted risk for a homelab, but the cleaner version is cheap: a role and database per app (`create role volley login password '…'; create database volley owner volley;`, plus `volley_dev`), each with its own Secret in `db`, mirrored to just that app's namespace.

**No URL to assemble.** The `postgres` client reads the standard `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD` variables, so the Deployment maps each one to whatever keys the mirrored Secret has (`secretKeyRef`). The Secret doesn't need a `DATABASE_URL` key. `PGHOST` is the Service's DNS name, `<service>.db.svc.cluster.local`, not its ClusterIP: the IP changes if the Service is ever recreated, and the name doesn't.

If the `db` namespace has NetworkPolicies, they need to let `volley` and `volley-dev` in on 5432.

## Server

SvelteKit switches from `adapter-static` to `adapter-node`. The adapter builds a `handler(req, res, next)` that serves the pages, the `/api` routes and the static files. It already caches `_app/immutable/*` for a year and sets `precompress` for gzip and brotli, so it covers what `nginx.conf` does now. The game and replay pages keep `ssr = false`. SvelteKit 3.0.1 has no WebSocket support (checked in its source), so Socket.IO is attached in a small server of our own.

- `src/lib/server/store.ts`: the `GameStore` interface (`save`, `get`, `recent`) with Postgres and in-memory versions.
- `src/lib/replay.ts`: `record` and `replay`, shared by the browser, the upload check and the online rooms.
- `src/routes/api/games/+server.ts`: `POST` (upload a computer game) and `GET` (recent). `src/routes/api/games/[id]/+server.ts`: `GET` one.
- `server/room.ts`: pure room logic, with no sockets. `Room { code, game, seats: {A, B}, pending: {shot?, defence?}, calls: RecordedCall[], rematch: Set<TeamId>, lastActive }`, plus `handle(room, team, msg) → { send, broadcast, save? }`. All the turn rules live here, so they can be unit tested.
- `server/sockets.ts`: `attachSockets(httpServer, store)` creates the Socket.IO `Server` with `connectionStateRecovery` on. Socket.IO only takes requests under `/socket.io/`, so in dev it sits next to Vite's own hot-reload socket on the same server without clashing. It maps `playerId`s to seats, puts each room's sockets in a Socket.IO room for broadcasts, owns the one clock timer per room, and runs the cleanup.
- `server/index.ts`: the production entry. A `node:http` server on 8080 that runs migrations, mounts `build/handler.js` and calls `attachSockets`.
- Room codes: 4 letters from `BCDFGHJKLMNPQRSTVWXZ`, checked for clashes. That's consonants only, so codes can't spell words, and leaving out I and O avoids mixing them up with 1 and 0. 20 letters give 20⁴ = 160k codes, which is enough for a handful of rooms at once.
- Seeds come from `crypto.randomInt`.
- Rooms are deleted after 30 minutes with nobody connected, or 2 hours without a move.
- Run with `tsx server/index.ts`. The engine imports files without extensions (`'./rules'`), which Node's own loader won't resolve, so the socket side needs tsx.

The SvelteKit routes are bundled by Vite and the socket server runs under tsx, so the store module loads twice in production, giving two pools of 5 connections. That's fine at this size, and simpler than sharing one between them.

### Reconnecting

This is part of v1, not an extra: a phone that locks its screen drops the connection. Most of it comes with Socket.IO:

- The client reconnects by itself, with backoff.
- After a drop of under 2 minutes, `connectionStateRecovery` replays the events missed in between, so a chain of states isn't lost partway through.
- After a longer drop, the server finds the seat by `playerId` and sends a `snapshot`.
- Either way, the opponent gets `presence: 'connected'`. A seat stays held while its player is away, until the room expires.

`playerId` is kept in `localStorage`, so it works across tabs and a browser restart. Opening the same room in two tabs makes the newer tab take the seat; the older one is told and stops sending.

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

There's still one image, one Deployment and one Service, and the Ingress doesn't change. Traefik passes WebSocket upgrades through without extra config. With one replica, Socket.IO's long-polling fallback needs no sticky sessions.

- `Dockerfile`: the build stage stays as it is. The serve stage changes from `nginx-unprivileged` to `node:26-bookworm-slim` with production dependencies plus tsx, `build/`, `server/`, `src/lib/engine/` and `src/lib/replay.ts`, `USER node` and `CMD tsx server/index.ts` on port 8080. `nginx.conf` is deleted.
- `k8s/deployment.yaml`: `PGHOST`, `PGDATABASE` as plain values and `PGUSER`, `PGPASSWORD` from the mirrored Secret. `runAsUser` changes from 101 (nginx) to 1000 (node). Raise the memory limit from 64Mi to 128Mi: Node with tsx idles around 50–70 MB (an estimate, not measured), where nginx used a few. Keep `replicas: 1`, because rooms are in memory. The read-only root and the `/tmp` volume still work. Add a `/healthz` route for the probes that doesn't touch the database, so a database outage doesn't restart the pod. Saving fails and logs instead.
- Dev, both `npm run dev` and `skaffold dev`: a small Vite plugin in `vite.config.ts` calls `attachSockets(server.httpServer, store)` from `configureServer`, so Socket.IO works on the dev server itself. `k8s-dev` gets the same variables with `PGDATABASE=volley_dev`. Locally, leave them unset for the in-memory store, or `kubectl port-forward -n db svc/<service> 5432` and point at a local dev database. Changes to the server code need a dev server restart; Vite won't hot-reload them.

The cost of a single server is that any deploy, even a CSS change, restarts the process and ends games in progress. You deploy by hand from tags, so check nobody's playing first.

## Testing

- `src/lib/replay.test.ts`: for 200 seeds, play a game where each call is randomly made by the player or the computer, record it, replay it, and check the final state matches exactly. Also check that a tampered computer call is caught, and that the fingerprint is stable across runs and changes when a number in `config.ts` changes.
- `server/room.test.ts` (Vitest, no sockets) with a fixed seed: create and join, the third person is refused, a call out of turn or from the wrong team is ignored, a lone call gets only `locked` to the opponent (never the call's contents), both calls give the same chain as `step` with those calls plus the auto phases, `rngState` and `seed` are never in anything sent, connecting again with the same `playerId` gives the seat back, rematch needs both, and game over saves a record that replays to the same game. Clock: it starts after the chain's playback time, a timed-out call is made by the computer and replays exactly, a late call after a timeout is ignored, a lone lock-in stops only that side's clock, and the clocks stop with both players away.
- Upload route: a valid record is stored with the server's own score, and a game that doesn't finish, a bad computer call, an oversized body or an old fingerprint are refused.
- One integration test: start an `http` server on port 0 with `attachSockets` and the in-memory store, connect two `socket.io-client` clients and play a rally. Drop one mid-rally and check it gets the missed chain (short drop) or a snapshot (long drop).
- The Postgres store, migrations and the startup delete run against a test database when `TEST_PGHOST` is set, and are skipped otherwise.
- By hand: two browser windows locally, then a phone on mobile data against the dev deploy, locking the screen partway through a rally.

## Build order

1. `src/lib/replay.ts` and its tests, plus the rules fingerprint. That's the riskiest part, and it needs no server.
2. `server/room.ts` + tests (the rules and the clock, with no networking). Move the timing constants to `timing.ts`.
3. Switch to `adapter-node`. The store, migrations and the `/api/games` routes, against the in-memory store first.
4. `server/sockets.ts`, the Vite plugin, and the integration test.
5. The driver split and `playChain` in the page, with single player checked to still work exactly as before. Upload games against the computer at game over.
6. The lobby UI, `socketDriver`, waiting and serve states, the clocks, and You/Them labels.
7. The replay pages.
8. Reconnecting: the `playerId` seat lookup, snapshots and the second-tab case.
9. Reflector (or ESO) and the databases, `server/index.ts`, the Dockerfile and deployment changes. Deploy to `volley-dev` first, then `skaffold run`.

## Open questions

- **The Postgres Service and Secret.** The Service's name in `db`, and the key names in the Secret (they vary: the Bitnami chart uses `postgres-password`, CloudNativePG uses `username` / `password`). Which Postgres is it?
- **What a timeout picks.** The computer picks at random, as asked. If you'd rather it used what the player had highlighted but not locked in, the client would send its current pick to the server as it changes (never passed on to the opponent). That's one more message type.
- **Who's A and B.** The creator is A for now. Rematch swaps sides so the serve alternates.
