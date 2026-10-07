# Volley

A 2v2 beach volleyball dice game in the browser. You call the shots, the dice decide the rally.

## What it is

Two teams of two play to 21, win by 2. Every rally runs like real beach volleyball: serve, pass, set, attack, then block and dig. Each touch is a dice roll, and the quality of one touch carries into the next.

The game is a guessing duel:

- **On attack** you pick the shot: **line**, **cross** or a **tip**.
- **On defence** you pick where your **blocker** goes (line or cross) and whether your **defender** plays **deep** or creeps **short** for the tip.

Read the other side right and you stuff the block or dig the ball. Guess wrong and it's a kill. The court shows every roll, the ball's flight, and pop-up calls for the big moments: kills, stuff blocks and dive saves. A plain-English commentary log follows the rally.

## Run it

You need [Node.js](https://nodejs.org/) 22.17 or newer.

```sh
npm install
npm run dev
```

Then open http://localhost:5173. Press **Space** to play each step, or use the buttons. If `npm install` fails with `Cannot read properties of null (reading 'edgesOut')`, run `npx npm@11 install` instead.

Other scripts:

```sh
npm test       # run the tests
npm run sim    # simulate 1,000 games and print balance stats
```

## Built with

[SvelteKit](https://svelte.dev/docs/kit) and TypeScript, with [Vitest](https://vitest.dev/) for tests. The game rules live in a plain TypeScript engine in `src/lib/engine/`, and the design notes are in `docs/plans/`.
