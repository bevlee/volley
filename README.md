# Volley

A 2v2 beach volleyball dice game in the browser. You call the shots, the dice decide the rally.

## What it is

Two teams of two play to 21, win by 2. Every rally runs like real beach volleyball: serve, pass, set, attack, then block and dig. Each touch is a dice roll, and the quality of one touch carries into the next.

The game is a guessing duel:

- **On attack** you pick the shot: **line**, **cross** or a **tip**.
- **On defence** you pick where your **blocker** goes (line or cross) and whether your **defender** plays **deep** or creeps **short** for the tip.

Read the other side right and you stuff the block or dig the ball. Guess wrong and it's a kill. The court shows every roll, the ball's flight, and pop-up calls for the big moments: kills, stuff blocks and dive saves. When a defence is set, the court shades each shot red (covered) or green (open), so you can see why a point went the way it did. A score panel beside the court shows the attack, block and dig totals and what the set adds to the hit; hover a score to see how it adds up.

## Run it

You need [Node.js](https://nodejs.org/) 22.17 or newer.

```sh
npm install
npm run dev
```

Then open http://localhost:5173. The serve, pass and set play on their own. When it's your call, pick a shot (or your block and dig) and press **Space** to roll the attack; press **Space** again to serve the next rally. **?** opens the rules, and **D** opens the debug panel with the rally log, dice maths, seed and auto-play. If `npm install` fails with `Cannot read properties of null (reading 'edgesOut')`, run `npx npm@11 install` instead.

Other scripts:

```sh
npm test       # run the tests
npm run sim    # simulate 1,000 games and print balance stats
```

## Built with

[SvelteKit](https://svelte.dev/docs/kit) and TypeScript, with [Vitest](https://vitest.dev/) for tests. The game rules live in a plain TypeScript engine in `src/lib/engine/`, and the design notes are in `docs/plans/`.

## Deployment

The site is a static build (`@sveltejs/adapter-static`) served by unprivileged nginx at https://volley.bevsoft.com. Skaffold builds the image (`docker.io/bevdev1/volley`), pushes it, and applies the Kustomize manifests in `k8s/` (namespace, deployment, service, cert-manager certificate and Traefik ingress) to the `volley` namespace.

To release, tag the commit and deploy it from your machine:

```bash
git tag v0.1.0
git push origin v0.1.0
skaffold run
kubectl -n volley rollout status deployment/volley --timeout=5m
```

The image tag follows `git describe --tags`: `v0.1.0` on a tagged commit, `v0.1.0-3-gabc1234` three commits later, plus `-dirty` for uncommitted changes.

`skaffold dev` runs the Vite dev server in the `volley-dev` namespace at https://volley-dev.bevsoft.com, syncing edits under `src/` and `static/` into the pod.
