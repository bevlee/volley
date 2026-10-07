# Volley Beach MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A single-page SvelteKit app that plays a 2v2 beach volleyball dice game to 21 with random calls and seeded dice, shown on an SVG court with a rally log.

**Architecture:** A plain TypeScript engine (`src/lib/engine/`) holds all rules and the rally phase switch; it never imports Svelte, so Vitest tests it directly with scripted dice. The page keeps one `$state.raw` game object; controls replace it with the result of `step`, `playRally` or `playGame`; Svelte components only read it.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest, tsx (for the sim script).

**Design:** [2026-10-07-volley-beach-mvp-design.md](2026-10-07-volley-beach-mvp-design.md)

**Conventions**
- Each code block is preceded by `<!-- file: path -->`; that is the exact file it belongs in.
- Engine files use relative imports (no `$lib`) so `scripts/sim.ts` can run them with tsx.
- Dice order inside a step is fixed and the rally tests depend on it: pass → set → power → partner (hard shots only) → accuracy → tie pick (drift ties only) → block → dig → partner (only if `partnerPoolOnDig`).
- Commit after each task once the folder is a git repo.

---

### Task 1: Scaffold

**Step 1: Create the project in the existing folder**

```bash
cd /Users/bevan/projects/volley
npx sv create . --template minimal --types ts --add vitest="usages:unit" --no-install --no-dir-check
npx npm@11 install        # npm 10.9 crashes resolving this tree ("reading 'edgesOut'")
npx npm@11 install -D tsx
rm -rf src/lib/vitest-examples
```

This scaffolds SvelteKit 3: import from `src/lib` with `#lib/...` (not `$lib`), including the file extension, e.g. `#lib/engine/rally.ts`.

**Step 2: Check the test runner works**

Run: `npx vitest run`
Expected: "No test files found" (exit 1 until Task 2 adds tests).

**Step 3: Add scripts to `package.json`**

```json
"test": "vitest run",
"sim": "tsx scripts/sim.ts"
```

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/lib/engine/rng.ts`
- Test: `src/lib/engine/rng.test.ts`

**Step 1: Write the failing test**

<!-- file: src/lib/engine/rng.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { d6, int, mulberry32, pick, scriptedDice } from './rng';

describe('mulberry32', () => {
	it('repeats the same sequence for the same seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const roll = (rng: typeof a) => Array.from({ length: 5 }, () => rng.next());
		expect(roll(a)).toEqual(roll(b));
	});

	it('resumes from a saved state', () => {
		const a = mulberry32(7);
		a.next();
		a.next();
		const resumed = mulberry32(a.state);
		expect(resumed.next()).toBe(a.next());
	});
});

describe('d6', () => {
	it('only rolls 1-6 and hits every face', () => {
		const rng = mulberry32(1);
		const seen = new Set(Array.from({ length: 600 }, () => d6(rng)));
		expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
	});
});

describe('scriptedDice', () => {
	it('returns the scripted dice in order', () => {
		const rng = scriptedDice([3, 6, 1]);
		expect([d6(rng), d6(rng), d6(rng)]).toEqual([3, 6, 1]);
	});

	it('throws when it runs out', () => {
		const rng = scriptedDice([2]);
		d6(rng);
		expect(() => d6(rng)).toThrow(/ran out/);
	});
});

describe('int and pick', () => {
	it('stay in range', () => {
		const rng = mulberry32(3);
		for (let i = 0; i < 200; i++) {
			const n = int(rng, 3, 6);
			expect(n).toBeGreaterThanOrEqual(3);
			expect(n).toBeLessThanOrEqual(6);
			expect(['x', 'y']).toContain(pick(rng, ['x', 'y']));
		}
	});
});
```

**Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/engine/rng.test.ts`
Expected: FAIL, cannot resolve `./rng`.

**Step 3: Implement**

<!-- file: src/lib/engine/rng.ts -->
```ts
export interface Rng {
	next(): number;
}

export interface SeededRng extends Rng {
	readonly state: number;
}

/** mulberry32: small, fast and seedable. Pass `state` back in to resume the same sequence. */
export function mulberry32(seed: number): SeededRng {
	let a = seed >>> 0;
	return {
		next() {
			a = (a + 0x6d2b79f5) >>> 0;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		},
		get state() {
			return a;
		}
	};
}

/** Test RNG: each d6() call returns the next die in the list. Throws when it runs out. */
export function scriptedDice(dice: number[]): Rng {
	let i = 0;
	return {
		next() {
			if (i >= dice.length) throw new Error(`scriptedDice ran out after ${dice.length} rolls`);
			return (dice[i++] - 0.5) / 6;
		}
	};
}

export const d6 = (rng: Rng) => Math.floor(rng.next() * 6) + 1;

export const int = (rng: Rng, min: number, max: number) =>
	min + Math.floor(rng.next() * (max - min + 1));

export const pick = <T>(rng: Rng, items: readonly T[]): T =>
	items[Math.floor(rng.next() * items.length)];
```

**Step 4: Run it to make sure it passes**

Run: `npx vitest run src/lib/engine/rng.test.ts`
Expected: PASS (6 tests).

---

### Task 3: Types and config

No tests: these are declarations. They are checked by the compiler in Task 4.

<!-- file: src/lib/engine/types.ts -->
```ts
export type TeamId = 'A' | 'B';
export type Slot = 'blocker' | 'defender';
export type Shot = 'line' | 'cross' | 'tip';
export type Channel = 'line' | 'cross';
export type Stance = 'deep' | 'short';
export type Zone = 1 | 2 | 3 | 4 | 5 | 6;
export type BlockResult = 'stuff' | 'touch' | 'clean';
export type PointKind = 'shank' | 'guaranteed kill' | 'stuff' | 'kill';

export interface Player {
	name: string;
	slot: Slot;
	attack: number;
	defense: number;
}

export interface Team {
	id: TeamId;
	blocker: Player;
	defender: Player;
}

export interface Calls {
	shot: Shot;
	block: Channel;
	stance: Stance;
}

/** Everything rolled so far by the side currently attacking, filled in phase by phase. */
export interface Attack {
	team: TeamId;
	hitter: Slot;
	firstDie: number;
	firstMod: number;
	setDie?: number;
	setMod?: number;
	calls?: Calls;
	powerDie?: number;
	incoming?: number;
	accuracy?: number;
	landing?: Zone;
}

export type Phase =
	| { kind: 'freeBall'; team: TeamId }
	| { kind: 'set' }
	| { kind: 'calls' }
	| { kind: 'hit' }
	| { kind: 'block' }
	| { kind: 'dig' }
	| { kind: 'pointOver' }
	| { kind: 'gameOver' };

export interface LogEntry {
	rally: number;
	text: string;
	/** Machine-readable tag for the sim script and UI: 'calls', 'accuracy', 'block', 'dig' or 'point'. */
	tag?: string;
	data?: Record<string, string | number | boolean>;
}

export interface Game {
	seed: number;
	rngState: number;
	teams: Record<TeamId, Team>;
	score: Record<TeamId, number>;
	serving: TeamId;
	rally: number;
	phase: Phase;
	attack: Attack | null;
	log: LogEntry[];
	winner: TeamId | null;
}
```

<!-- file: src/lib/engine/config.ts -->
```ts
import type { Slot } from './types';

export const config = {
	statMin: 3,
	statMax: 6,
	targetScore: 21,
	winBy: 2,
	blockBonus: 3,
	readBonus: 1,
	blockMargin: 3,
	accuracyExact: 8,
	accuracyEasy: 2,
	/** Defense multiplier by distance to the landing zone: same zone, one step, two or more. */
	reach: [1, 0.5, 0.25],
	partnerPoolOnAttack: true,
	partnerPoolOnDig: false,
	freeBallReceiver: 'blocker' as Slot
};
```

---

### Task 4: Rules

**Files:**
- Create: `src/lib/engine/rules.ts`
- Test: `src/lib/engine/rules.test.ts`

**Step 1: Write the failing test**

<!-- file: src/lib/engine/rules.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { config } from './config';
import {
	accuracy,
	adjacent,
	blockResult,
	defenderZone,
	digTotal,
	distance,
	gameWinner,
	isGuaranteedKill,
	isRead,
	isShank,
	ladder,
	landing,
	power,
	reach,
	teamAttack
} from './rules';
import type { Zone } from './types';

const noTie = (): Zone => {
	throw new Error('unexpected tie');
};

describe('ladder', () => {
	it.each([
		[8, 2],
		[6, 2],
		[5, 0],
		[4, 0],
		[3, -1],
		[2, -2],
		[1, -3],
		[0, -4],
		[-3, -7]
	])('total %i gives %i', (total, mod) => expect(ladder(total)).toBe(mod));
});

describe('power', () => {
	it('adds attack, die and set modifier', () => expect(power(5, 4, -2)).toBe(7));
	it('team attack adds half the partner (attack + die), rounded down', () =>
		expect(teamAttack(7, 4, 3)).toBe(10));
});

describe('accuracy', () => {
	it('adds the die, both touch modifiers and the setter attack', () =>
		expect(accuracy(3, -1, 2, 5)).toBe(9));
});

describe('court geometry', () => {
	it('measures zone distance in grid steps', () => {
		expect(distance(1, 1)).toBe(0);
		expect(distance(1, 6)).toBe(1);
		expect(distance(1, 2)).toBe(1);
		expect(distance(5, 1)).toBe(2);
		expect(distance(3, 5)).toBe(2);
		expect(distance(4, 1)).toBe(3);
	});

	it('lists adjacent zones', () => {
		expect(adjacent(1)).toEqual([2, 6]);
		expect(adjacent(3)).toEqual([2, 4, 6]);
	});

	it('puts a deep defender in the channel the blocker leaves open', () => {
		expect(defenderZone('deep', 'line')).toBe(5);
		expect(defenderZone('deep', 'cross')).toBe(1);
		expect(defenderZone('short', 'line')).toBe(3);
	});
});

describe('landing', () => {
	it('hits the target at the exact threshold', () =>
		expect(landing('line', config.accuracyExact, 5, noTie)).toBe(1));

	it('is an easy ball at the easy threshold', () =>
		expect(landing('cross', config.accuracyEasy, 1, noTie)).toBe('easy'));

	it('drifts to the neighbour closest to the defender', () =>
		// line target 1 has neighbours 2 and 6; a deep-cross defender in 5 is closer to 6
		expect(landing('line', 5, 5, noTie)).toBe(6));

	it('breaks ties with the tie picker', () =>
		// tip target 3 has neighbours 2, 4, 6, all one step from a short defender in 3
		expect(landing('tip', 5, 3, (zones) => Math.max(...zones) as Zone)).toBe(6));
});

describe('reads', () => {
	it('deep reads a hard shot into the open channel', () => {
		expect(isRead('cross', 'line', 'deep')).toBe(true);
		expect(isRead('line', 'line', 'deep')).toBe(false);
	});

	it('short reads a tip only', () => {
		expect(isRead('tip', 'line', 'short')).toBe(true);
		expect(isRead('tip', 'cross', 'deep')).toBe(false);
		expect(isRead('cross', 'line', 'short')).toBe(false);
	});
});

describe('block', () => {
	it('stuffs when the block wins by the margin', () => expect(blockResult(12, 9)).toBe('stuff'));
	it('is clean when the attack wins by the margin', () => expect(blockResult(9, 12)).toBe('clean'));
	it('touches inside the margin', () => {
		expect(blockResult(11, 9)).toBe('touch');
		expect(blockResult(10, 12)).toBe('touch');
	});
});

describe('dig', () => {
	it('scales reach by distance', () => {
		expect(reach(0)).toBe(1);
		expect(reach(1)).toBe(0.5);
		expect(reach(2)).toBe(0.25);
		expect(reach(3)).toBe(0.25);
	});

	it('rounds Defense x reach down, then adds the die and read bonus', () => {
		expect(digTotal(5, 0.5, 3, false)).toBe(5);
		expect(digTotal(5, 1, 3, true)).toBe(8 + config.readBonus);
	});
});

describe('special dice', () => {
	it('shank needs two natural 1s', () => {
		expect(isShank(1, 1)).toBe(true);
		expect(isShank(1, 2)).toBe(false);
	});

	it('guaranteed kill needs 6 then 6', () => {
		expect(isGuaranteedKill(6, 6)).toBe(true);
		expect(isGuaranteedKill(6, 5)).toBe(false);
	});
});

describe('gameWinner', () => {
	it('needs the target score and a 2-point lead', () => {
		expect(gameWinner({ A: 21, B: 19 })).toBe('A');
		expect(gameWinner({ A: 21, B: 20 })).toBeNull();
		expect(gameWinner({ A: 24, B: 26 })).toBe('B');
		expect(gameWinner({ A: 20, B: 5 })).toBeNull();
	});
});
```

**Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/engine/rules.test.ts`
Expected: FAIL, cannot resolve `./rules`.

**Step 3: Implement**

<!-- file: src/lib/engine/rules.ts -->
```ts
import { config } from './config';
import type { BlockResult, Channel, Shot, Stance, TeamId, Zone } from './types';

export const ZONES: readonly Zone[] = [1, 2, 3, 4, 5, 6];

/** Row and column of each zone from the team's own view: front row 4-3-2, back row 5-6-1. */
export const GRID: Record<Zone, readonly [row: number, col: number]> = {
	4: [0, 0],
	3: [0, 1],
	2: [0, 2],
	5: [1, 0],
	6: [1, 1],
	1: [1, 2]
};

/** Attacks always come from the attacker's left, so on the defending side line is zone 1 and cross is zone 5. */
export const TARGET: Record<Shot, Zone> = { line: 1, cross: 5, tip: 3 };

export function ladder(total: number): number {
	if (total >= 6) return 2;
	if (total >= 4) return 0;
	if (total === 3) return -1;
	if (total === 2) return -2;
	return total - 4;
}

export const power = (attack: number, die: number, setMod: number) => attack + die + setMod;

export const teamAttack = (power: number, partnerAttack: number, partnerDie: number) =>
	config.partnerPoolOnAttack ? power + Math.floor((partnerAttack + partnerDie) / 2) : power;

export const accuracy = (die: number, firstMod: number, setMod: number, setterAttack: number) =>
	die + firstMod + setMod + setterAttack;

export function distance(a: Zone, b: Zone): number {
	const [ra, ca] = GRID[a];
	const [rb, cb] = GRID[b];
	return Math.abs(ra - rb) + Math.abs(ca - cb);
}

export const adjacent = (zone: Zone) => ZONES.filter((z) => distance(zone, z) === 1);

/** Deep covers the hard shot the blocker leaves open; short reads the tip. */
export function defenderZone(stance: Stance, block: Channel): Zone {
	if (stance === 'short') return TARGET.tip;
	return block === 'line' ? TARGET.cross : TARGET.line;
}

/** Where the ball lands. A miss drifts to the target's neighbour closest to the defender. */
export function landing(
	shot: Shot,
	acc: number,
	defender: Zone,
	pickTie: (zones: Zone[]) => Zone
): Zone | 'easy' {
	if (acc <= config.accuracyEasy) return 'easy';
	const target = TARGET[shot];
	if (acc >= config.accuracyExact) return target;
	const options = adjacent(target);
	const best = Math.min(...options.map((z) => distance(z, defender)));
	const closest = options.filter((z) => distance(z, defender) === best);
	return closest.length === 1 ? closest[0] : pickTie(closest);
}

export const isRead = (shot: Shot, block: Channel, stance: Stance) =>
	shot === 'tip' ? stance === 'short' : stance === 'deep' && shot !== block;

export function blockResult(block: number, attack: number): BlockResult {
	if (block - attack >= config.blockMargin) return 'stuff';
	if (attack - block >= config.blockMargin) return 'clean';
	return 'touch';
}

export const reach = (dist: number) => config.reach[Math.min(dist, config.reach.length - 1)];

export const digTotal = (defense: number, reach: number, die: number, read: boolean) =>
	Math.floor(defense * reach) + die + (read ? config.readBonus : 0);

export const isShank = (previousDie: number, die: number) => previousDie === 1 && die === 1;

export const isGuaranteedKill = (setDie: number, powerDie: number) => setDie === 6 && powerDie === 6;

export function gameWinner(score: Record<TeamId, number>): TeamId | null {
	for (const [team, rival] of [
		['A', 'B'],
		['B', 'A']
	] as const) {
		if (score[team] >= config.targetScore && score[team] - score[rival] >= config.winBy) return team;
	}
	return null;
}
```

**Step 4: Run it to make sure it passes**

Run: `npx vitest run src/lib/engine/rules.test.ts`
Expected: PASS.

---

### Task 5: Choosers

No separate test: exercised by the rally tests (fixed) and the simulation test (random).

<!-- file: src/lib/engine/choosers.ts -->
```ts
import { pick, type Rng } from './rng';
import type { Calls, Channel, Game, Shot, Stance, TeamId } from './types';

/** Who makes each call. Random for now; a human UI or scripted team implements the same interface later. */
export interface Choosers {
	shot(game: Game, team: TeamId, rng: Rng): Shot;
	block(game: Game, team: TeamId, rng: Rng): Channel;
	stance(game: Game, team: TeamId, rng: Rng): Stance;
}

export const randomChoosers: Choosers = {
	shot: (_game, _team, rng) => pick(rng, ['line', 'cross', 'tip'] as const),
	block: (_game, _team, rng) => pick(rng, ['line', 'cross'] as const),
	stance: (_game, _team, rng) => pick(rng, ['deep', 'short'] as const)
};

/** Always makes the same calls. For tests. */
export const fixedChoosers = (calls: Calls): Choosers => ({
	shot: () => calls.shot,
	block: () => calls.block,
	stance: () => calls.stance
});
```

---

### Task 6: Rally engine

**Files:**
- Create: `src/lib/engine/rally.ts`
- Test: `src/lib/engine/rally.test.ts`

Every player in these tests has Attack 4 and Defense 4, so each test's dice can be checked by hand. Each test's comment gives the arithmetic.

**Step 1: Write the failing test**

<!-- file: src/lib/engine/rally.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { fixedChoosers } from './choosers';
import { config } from './config';
import { newGame, playGame, playRally, step } from './rally';
import { scriptedDice } from './rng';
import type { Calls, Game } from './types';

/** A new game where every stat is 4, so the arithmetic in each test is easy to follow. */
function evenGame(): Game {
	const g = newGame(1);
	for (const team of [g.teams.A, g.teams.B]) {
		for (const p of [team.blocker, team.defender]) {
			p.attack = 4;
			p.defense = 4;
		}
	}
	return g;
}

function run(n: number, calls: Calls, dice: number[], start = evenGame()): Game {
	const choosers = fixedChoosers(calls);
	const rng = scriptedDice(dice);
	let g = start;
	for (let i = 0; i < n; i++) g = step(g, choosers, rng);
	return g;
}

const lastPoint = (g: Game) => g.log.filter((e) => e.tag === 'point').at(-1);
const lineIntoBlock: Calls = { shot: 'line', block: 'line', stance: 'deep' };

describe('rally', () => {
	it('starts with a free ball to A and B serving', () => {
		const g = newGame(5);
		expect(g.phase).toEqual({ kind: 'freeBall', team: 'A' });
		expect(g.serving).toBe('B');
	});

	it('shanks on a natural 1 pass then a natural 1 set', () => {
		const g = playRally(evenGame(), fixedChoosers(lineIntoBlock), scriptedDice([1, 1]));
		expect(g.score).toEqual({ A: 0, B: 1 });
		expect(lastPoint(g)?.data?.kind).toBe('shank');
		expect(g.phase.kind).toBe('pointOver');
	});

	it('scores a guaranteed kill on a 6 set then a 6 power die', () => {
		// pass 4 → 0, set 6 → +2, power die 6
		const g = playRally(evenGame(), fixedChoosers(lineIntoBlock), scriptedDice([4, 6, 6]));
		expect(g.score).toEqual({ A: 1, B: 0 });
		expect(lastPoint(g)?.data?.kind).toBe('guaranteed kill');
	});

	it('stuffs a hard shot into the block', () => {
		// pass 4 → 0, set 4 → 0, power 4+2 = 6, team 6 + (4+2)/2 = 9,
		// accuracy 4+0+0+4 = 8 → zone 1, block 4+6+3 = 13 vs 9 → stuff
		const g = playRally(evenGame(), fixedChoosers(lineIntoBlock), scriptedDice([4, 4, 2, 2, 4, 6]));
		expect(g.score).toEqual({ A: 0, B: 1 });
		expect(lastPoint(g)?.data?.kind).toBe('stuff');
	});

	it('kills when the defender misreads', () => {
		// cross past a line block, defender short in 3. power 4+5 = 9, team 9 + (4+4)/2 = 13,
		// accuracy 5+4 = 9 → zone 5, dig from 3: 4 × ¼ = 1, + 6 = 7 vs 13 → kill
		const calls: Calls = { shot: 'cross', block: 'line', stance: 'short' };
		const g = playRally(evenGame(), fixedChoosers(calls), scriptedDice([4, 4, 5, 4, 5, 6]));
		expect(g.score).toEqual({ A: 1, B: 0 });
		expect(lastPoint(g)?.data?.kind).toBe('kill');
	});

	it('digs a read tip and passes the ball to the defender to hit', () => {
		// tip power 4+3 = 7 (no partner die), accuracy 4+4 = 8 → zone 3,
		// dig 4 × 1 + 3 + 1 read = 8 vs 7 → up, first touch ladder(3) = −1
		const calls: Calls = { shot: 'tip', block: 'line', stance: 'short' };
		const g = run(5, calls, [4, 4, 3, 4, 3]);
		expect(g.phase.kind).toBe('set');
		expect(g.attack).toMatchObject({ team: 'B', hitter: 'defender', firstDie: 3, firstMod: -1 });
	});

	it('turns a wild hit into a free ball for the other side', () => {
		// pass 1 → −3, set 2 − 3 = −1 → −5, power 4+3−5 = 2, team 2 + 3 = 5,
		// accuracy 2 − 3 − 5 + 4 = −2 → easy ball
		const g = run(4, lineIntoBlock, [1, 2, 3, 3, 2]);
		expect(g.phase).toEqual({ kind: 'freeBall', team: 'B' });
	});

	it('turns a block touch into a free ball for the blockers', () => {
		// power 4+4 = 8, team 8 + 4 = 12, accuracy 8 → zone 1, block 4+5+3 = 12 vs 12 → touch
		const g = run(5, lineIntoBlock, [4, 4, 4, 4, 4, 5]);
		expect(g.phase).toEqual({ kind: 'freeBall', team: 'B' });
	});

	it('gives the next free ball to the team that lost the point', () => {
		const afterPoint = playRally(evenGame(), fixedChoosers(lineIntoBlock), scriptedDice([1, 1]));
		const g = step(afterPoint);
		expect(g.rally).toBe(2);
		expect(g.serving).toBe('B');
		expect(g.phase).toEqual({ kind: 'freeBall', team: 'A' });
	});

	it(`ends the game at ${config.targetScore} with a 2-point lead`, () => {
		const start = evenGame();
		start.score = { A: config.targetScore - 1, B: config.targetScore - 2 };
		const g = playRally(start, fixedChoosers(lineIntoBlock), scriptedDice([4, 6, 6]));
		expect(g.winner).toBe('A');
		expect(g.phase.kind).toBe('gameOver');
		expect(step(g)).toEqual(g);
	});

	it('keeps playing at a 1-point lead', () => {
		const start = evenGame();
		start.score = { A: config.targetScore - 1, B: config.targetScore - 1 };
		const g = playRally(start, fixedChoosers(lineIntoBlock), scriptedDice([4, 6, 6]));
		expect(g.winner).toBeNull();
		expect(g.phase.kind).toBe('pointOver');
	});
});

describe('whole games', () => {
	it('replays exactly from the same seed', () => {
		expect(playGame(newGame(42)).log).toEqual(playGame(newGame(42)).log);
	});

	it('finishes 200 random games with valid scores', () => {
		for (let seed = 1; seed <= 200; seed++) {
			const g = playGame(newGame(seed));
			const high = Math.max(g.score.A, g.score.B);
			const lead = Math.abs(g.score.A - g.score.B);
			expect(g.winner, `seed ${seed}`).not.toBeNull();
			expect(high).toBeGreaterThanOrEqual(config.targetScore);
			expect(lead).toBeGreaterThanOrEqual(config.winBy);
			if (high > config.targetScore) expect(lead).toBe(config.winBy);
		}
	});
});
```

**Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/engine/rally.test.ts`
Expected: FAIL, cannot resolve `./rally`.

**Step 3: Implement**

<!-- file: src/lib/engine/rally.ts -->
```ts
import { randomChoosers, type Choosers } from './choosers';
import { config } from './config';
import { d6, int, mulberry32, pick, type Rng, type SeededRng } from './rng';
import * as rules from './rules';
import type { Game, LogEntry, Player, PointKind, Slot, Team, TeamId } from './types';

export const other = (team: TeamId): TeamId => (team === 'A' ? 'B' : 'A');
export const partner = (slot: Slot): Slot => (slot === 'blocker' ? 'defender' : 'blocker');

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const plus = (n: number) => (n >= 0 ? ` + ${n}` : ` − ${-n}`);

export function newGame(seed: number): Game {
	const rng = mulberry32(seed);
	const player = (team: TeamId, slot: Slot): Player => ({
		name: `${team} ${slot}`,
		slot,
		attack: int(rng, config.statMin, config.statMax),
		defense: int(rng, config.statMin, config.statMax)
	});
	const team = (id: TeamId): Team => ({
		id,
		blocker: player(id, 'blocker'),
		defender: player(id, 'defender')
	});
	return {
		seed,
		rngState: rng.state,
		teams: { A: team('A'), B: team('B') },
		score: { A: 0, B: 0 },
		serving: 'B',
		rally: 1,
		phase: { kind: 'freeBall', team: 'A' },
		attack: null,
		log: [{ rally: 1, text: 'Free ball to A' }],
		winner: null
	};
}

/** Advance one phase. Pass `rng` only in tests; otherwise the game's own seeded state is used and saved. */
export const step = (game: Game, choosers = randomChoosers, rng?: Rng) =>
	run(game, 1, () => true, choosers, rng);

/** Advance until the current rally's point is scored. */
export const playRally = (game: Game, choosers = randomChoosers, rng?: Rng) =>
	run(game, 10_000, (g) => g.phase.kind === 'pointOver', choosers, rng);

/** Advance until the game is won. */
export const playGame = (game: Game, choosers = randomChoosers, rng?: Rng) =>
	run(game, 1_000_000, () => false, choosers, rng);

function run(
	game: Game,
	maxSteps: number,
	stop: (g: Game) => boolean,
	choosers: Choosers,
	rng?: Rng
): Game {
	const g = structuredClone(game);
	const r = rng ?? mulberry32(g.rngState);
	for (let i = 0; i < maxSteps && g.phase.kind !== 'gameOver'; i++) {
		advance(g, choosers, r);
		if (stop(g)) break;
	}
	if (!rng) g.rngState = (r as SeededRng).state;
	return g;
}

function advance(g: Game, choosers: Choosers, rng: Rng): void {
	const log = (text: string, tag?: string, data?: LogEntry['data']) =>
		g.log.push({ rally: g.rally, text, tag, data });
	const phase = g.phase;

	switch (phase.kind) {
		case 'gameOver':
			return;

		case 'pointOver': {
			g.rally++;
			g.attack = null;
			freeBallTo(g, other(g.serving));
			return;
		}

		case 'freeBall': {
			const slot = config.freeBallReceiver;
			const die = d6(rng);
			g.attack = { team: phase.team, hitter: slot, firstDie: die, firstMod: rules.ladder(die) };
			log(`${g.teams[phase.team][slot].name} passes · d6 ${die} → ${signed(g.attack.firstMod)}`);
			g.phase = { kind: 'set' };
			return;
		}

		case 'set': {
			const a = g.attack!;
			const setter = g.teams[a.team][partner(a.hitter)];
			const die = d6(rng);
			a.setDie = die;
			a.setMod = rules.ladder(die + a.firstMod);
			log(`${setter.name} sets · d6 ${die}${plus(a.firstMod)} → ${signed(a.setMod)}`);
			if (rules.isShank(a.firstDie, die)) return scorePoint(g, other(a.team), 'shank', 'two natural 1s');
			g.phase = { kind: 'calls' };
			return;
		}

		case 'calls': {
			const a = g.attack!;
			const defending = other(a.team);
			a.calls = {
				shot: choosers.shot(g, a.team, rng),
				block: choosers.block(g, defending, rng),
				stance: choosers.stance(g, defending, rng)
			};
			log(
				`Calls · ${a.team} ${a.calls.shot} · ${defending} blocks ${a.calls.block}, defender ${a.calls.stance}`,
				'calls',
				{ ...a.calls }
			);
			g.phase = { kind: 'hit' };
			return;
		}

		case 'hit': {
			const a = g.attack!;
			const calls = a.calls!;
			const setMod = a.setMod!;
			const team = g.teams[a.team];
			const hitter = team[a.hitter];
			const setter = team[partner(a.hitter)];

			const powerDie = d6(rng);
			a.powerDie = powerDie;
			if (rules.isShank(a.setDie!, powerDie)) {
				log(`${hitter.name} swings · d6 1`);
				return scorePoint(g, other(a.team), 'shank', 'two natural 1s');
			}
			if (rules.isGuaranteedKill(a.setDie!, powerDie)) {
				log(`${hitter.name} swings · d6 6`);
				return scorePoint(g, a.team, 'guaranteed kill', '6 on the set, 6 on the hit');
			}

			const power = rules.power(hitter.attack, powerDie, setMod);
			const powerText = `${hitter.attack} + ${powerDie}${plus(setMod)} = ${power}`;
			if (calls.shot === 'tip') {
				a.incoming = power;
				log(`${hitter.name} tips · ${powerText}`);
			} else {
				a.incoming = rules.teamAttack(power, setter.attack, d6(rng));
				log(`${hitter.name} hits ${calls.shot} · ${powerText}, team ${a.incoming}`);
			}

			const accDie = d6(rng);
			a.accuracy = rules.accuracy(accDie, a.firstMod, setMod, setter.attack);
			const accText = `Accuracy ${accDie}${plus(a.firstMod)}${plus(setMod)} + ${setter.attack} = ${a.accuracy}`;
			const defenderAt = rules.defenderZone(calls.stance, calls.block);
			const where = rules.landing(calls.shot, a.accuracy, defenderAt, (zones) => pick(rng, zones));
			if (where === 'easy') {
				log(`${accText} → easy ball`, 'accuracy', { result: 'easy' });
				return freeBallTo(g, other(a.team));
			}
			a.landing = where;
			const onTarget = where === rules.TARGET[calls.shot];
			log(`${accText} → ${onTarget ? 'on target' : 'drifts'}, zone ${where}`, 'accuracy', {
				result: onTarget ? 'exact' : 'drift'
			});
			g.phase = calls.shot !== 'tip' && calls.shot === calls.block ? { kind: 'block' } : { kind: 'dig' };
			return;
		}

		case 'block': {
			const a = g.attack!;
			const defending = other(a.team);
			const blocker = g.teams[defending].blocker;
			const die = d6(rng);
			const total = blocker.defense + die + config.blockBonus;
			const result = rules.blockResult(total, a.incoming!);
			log(
				`${blocker.name} blocks · ${blocker.defense} + ${die} + ${config.blockBonus} = ${total} vs ${a.incoming} → ${result}`,
				'block',
				{ result }
			);
			if (result === 'stuff') return scorePoint(g, defending, 'stuff', `block ${total} vs ${a.incoming}`);
			if (result === 'touch') return freeBallTo(g, defending);
			g.phase = { kind: 'dig' };
			return;
		}

		case 'dig': {
			const a = g.attack!;
			const calls = a.calls!;
			const defending = other(a.team);
			const { blocker, defender } = g.teams[defending];
			const zone = rules.defenderZone(calls.stance, calls.block);
			const reach = rules.reach(rules.distance(zone, a.landing!));
			const read = rules.isRead(calls.shot, calls.block, calls.stance);
			const die = d6(rng);
			let total = rules.digTotal(defender.defense, reach, die, read);
			if (config.partnerPoolOnDig) total += Math.floor((blocker.defense + d6(rng)) / 2);
			const up = total >= a.incoming!;
			const firstMod = rules.ladder(die);
			log(
				`${defender.name} digs · ${defender.defense} × ${reach} + ${die}${read ? ` + ${config.readBonus} read` : ''} = ${total} vs ${a.incoming} → ${up ? `up, first touch ${signed(firstMod)}` : 'kill'}`,
				'dig',
				{ shot: calls.shot, read, up }
			);
			if (!up) return scorePoint(g, a.team, 'kill', `${a.incoming} vs dig ${total}`);
			g.attack = { team: defending, hitter: 'defender', firstDie: die, firstMod };
			g.phase = { kind: 'set' };
			return;
		}
	}
}

function freeBallTo(g: Game, team: TeamId): void {
	g.phase = { kind: 'freeBall', team };
	g.log.push({ rally: g.rally, text: `Free ball to ${team}` });
}

function scorePoint(g: Game, winner: TeamId, kind: PointKind, detail: string): void {
	g.score[winner]++;
	g.serving = winner;
	g.winner = rules.gameWinner(g.score);
	g.phase = g.winner ? { kind: 'gameOver' } : { kind: 'pointOver' };
	g.log.push({
		rally: g.rally,
		text: `${winner} scores · ${kind} (${detail}) · ${g.score.A}–${g.score.B}${g.winner ? ` · Team ${g.winner} wins` : ''}`,
		tag: 'point',
		data: { winner, kind }
	});
}
```

**Step 4: Run it to make sure it passes**

Run: `npx vitest run src/lib/engine`
Expected: PASS, all engine tests.

---

### Task 7: Simulation script

<!-- file: scripts/sim.ts -->
```ts
import { newGame, playGame } from '../src/lib/engine/rally';
import type { LogEntry } from '../src/lib/engine/types';

const games = Number(process.argv[2] ?? 1000);
const entries: LogEntry[] = [];
let rallies = 0;
let margin = 0;

for (let seed = 1; seed <= games; seed++) {
	const g = playGame(newGame(seed));
	entries.push(...g.log);
	rallies += g.rally;
	margin += Math.abs(g.score.A - g.score.B);
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '–');
const tagged = (tag: string) => entries.filter((e) => e.tag === tag);
const share = (tag: string, key: string) => {
	const list = tagged(tag);
	const counts = new Map<string, number>();
	for (const e of list) counts.set(String(e.data?.[key]), (counts.get(String(e.data?.[key])) ?? 0) + 1);
	return Object.fromEntries([...counts].map(([k, n]) => [k, pct(n, list.length)]));
};

console.log(`${games} games · ${(rallies / games).toFixed(1)} rallies per game · average margin ${(margin / games).toFixed(1)}`);
console.log(`${(tagged('calls').length / rallies).toFixed(2)} attacks per rally`);
console.log('\nHow points end');
console.table(share('point', 'kind'));
console.log('Accuracy');
console.table(share('accuracy', 'result'));
console.log('Block (hard shots into the blocked channel)');
console.table(share('block', 'result'));

console.log('Dig: share of balls kept up');
const digs = tagged('dig');
const rows: Record<string, { digs: number; up: string }> = {};
for (const shot of ['hard', 'tip']) {
	for (const read of [true, false]) {
		const list = digs.filter((e) => (e.data?.shot === 'tip') === (shot === 'tip') && e.data?.read === read);
		rows[`${shot}, ${read ? 'read' : 'misread'}`] = {
			digs: list.length,
			up: pct(list.filter((e) => e.data?.up).length, list.length)
		};
	}
}
console.table(rows);
```

**Run:** `npm run sim`
Expected: prints the tables; no errors. Compare the dig and block rows with the design doc's Expected balance (they will differ somewhat, because full games include drift and transition).

---

### Task 8: Court layout helpers

**Files:**
- Create: `src/lib/ui/layout.ts`
- Test: `src/lib/ui/layout.test.ts`

**Step 1: Write the failing test**

<!-- file: src/lib/ui/layout.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/rally';
import { ballAt, positions, zoneBox, zoneCenter } from './layout';

describe('zoneBox', () => {
	it('puts A on the bottom half with its front row at the net', () => {
		expect(zoneBox('A', 4)).toEqual({ x: 15, y: 285, w: 90, h: 130 });
		expect(zoneBox('A', 1)).toEqual({ x: 195, y: 415, w: 90, h: 130 });
	});

	it('mirrors B on the top half', () => {
		expect(zoneBox('B', 4)).toEqual({ x: 195, y: 145, w: 90, h: 130 });
		expect(zoneBox('B', 1)).toEqual({ x: 15, y: 15, w: 90, h: 130 });
	});
});

describe('positions', () => {
	it('places the attackers at 4 (hitter) and 3 (setter) and the defence by their calls', () => {
		const g = newGame(1);
		g.attack = {
			team: 'A',
			hitter: 'defender',
			firstDie: 4,
			firstMod: 0,
			calls: { shot: 'line', block: 'cross', stance: 'deep' }
		};
		expect(positions(g)).toEqual({
			A: { defender: 4, blocker: 3 },
			B: { blocker: 2, defender: 1 }
		});
	});
});

describe('ballAt', () => {
	it('sits with the free-ball receiver before the pass', () => {
		const g = newGame(1);
		expect(ballAt(g, positions(g))).toEqual(zoneCenter('A', 3));
	});

	it('sits in the landing zone once the ball has landed', () => {
		const g = newGame(1);
		g.phase = { kind: 'dig' };
		g.attack = { team: 'A', hitter: 'blocker', firstDie: 4, firstMod: 0, landing: 6 };
		expect(ballAt(g, positions(g))).toEqual(zoneCenter('B', 6));
	});
});
```

**Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ui/layout.test.ts`
Expected: FAIL, cannot resolve `./layout`.

**Step 3: Implement**

<!-- file: src/lib/ui/layout.ts -->
```ts
import { config } from '../engine/config';
import { other, partner } from '../engine/rally';
import { defenderZone, GRID } from '../engine/rules';
import type { Game, Slot, TeamId, Zone } from '../engine/types';

/** SVG viewBox is 300 × 560: B's half 15–275, net 275–285, A's half 285–545. */
export const VIEW = { width: 300, height: 560, netY: 280 };
const COL = 90;
const ROW = 130;

export interface Point {
	x: number;
	y: number;
}

/** A zone's rectangle. A faces up from the bottom; B is mirrored at the top. */
export function zoneBox(team: TeamId, zone: Zone) {
	const [row, col] = GRID[zone];
	if (team === 'A') return { x: 15 + col * COL, y: 285 + row * ROW, w: COL, h: ROW };
	return { x: 15 + (2 - col) * COL, y: 145 - row * ROW, w: COL, h: ROW };
}

export function zoneCenter(team: TeamId, zone: Zone): Point {
	const b = zoneBox(team, zone);
	return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export type Positions = Record<TeamId, Record<Slot, Zone>>;

/** Where each player stands. The hitter attacks from 4; the blocker is at the net in 2. */
export function positions(g: Game): Positions {
	const pos: Positions = { A: { blocker: 3, defender: 6 }, B: { blocker: 3, defender: 6 } };
	const a = g.attack;
	if (!a) return pos;
	pos[a.team][a.hitter] = 4;
	pos[a.team][partner(a.hitter)] = 3;
	if (a.calls) {
		const defending = other(a.team);
		pos[defending].blocker = 2;
		pos[defending].defender = defenderZone(a.calls.stance, a.calls.block);
	}
	return pos;
}

export function ballAt(g: Game, pos: Positions): Point {
	if (g.phase.kind === 'freeBall') {
		const team = g.phase.team;
		return zoneCenter(team, pos[team][config.freeBallReceiver]);
	}
	const a = g.attack;
	if (!a) return { x: VIEW.width / 2, y: VIEW.netY };
	if (a.landing) return zoneCenter(other(a.team), a.landing);
	const holder = g.phase.kind === 'set' ? partner(a.hitter) : a.hitter;
	return zoneCenter(a.team, pos[a.team][holder]);
}
```

**Step 4: Run it to make sure it passes**

Run: `npx vitest run src/lib/ui/layout.test.ts`
Expected: PASS.

---

### Task 9: Page shell, scoreboard and controls

<!-- file: src/app.css -->
```css
:root {
	--bg: #f7f6f2;
	--surface: #ffffff;
	--text: #1f1f1c;
	--muted: #6b6a64;
	--border: #d9d7cf;
	--team-a: #0f6e56;
	--team-a-bg: #e1f5ee;
	--team-b: #993c1d;
	--team-b-bg: #faece7;
	--target: #fbe3b8;
	--landing: #f2b55a;
	--block: #534ab7;
	--ball: #ef9f27;
	color-scheme: light dark;
	font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
	line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
	:root {
		--bg: #1b1b19;
		--surface: #252523;
		--text: #ecebe6;
		--muted: #a3a29b;
		--border: #3d3d3a;
		--team-a: #5dcaa5;
		--team-a-bg: #0b3d31;
		--team-b: #f0997b;
		--team-b-bg: #4a1b0c;
		--target: #4a3410;
		--landing: #8a5a12;
		--block: #afa9ec;
	}
}

body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
}

button,
input {
	font: inherit;
	color: inherit;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 6px;
	padding: 4px 12px;
}

button:hover:not(:disabled) {
	border-color: var(--muted);
}

button:disabled {
	opacity: 0.5;
}
```

Import it at the top of the `<script>` in `src/routes/+layout.svelte`, keeping the rest of the template:

```svelte
	import '../app.css';
```

<!-- file: src/routes/+page.ts -->
```ts
// The seed comes from Math.random on load, so render on the client only.
export const ssr = false;
```

<!-- file: src/lib/ui/Scoreboard.svelte -->
```svelte
<script lang="ts">
	import { config } from '#lib/engine/config.ts';
	import { other } from '#lib/engine/rally.ts';
	import type { Game } from '#lib/engine/types.ts';

	let { game }: { game: Game } = $props();
</script>

<div class="scoreboard" aria-live="polite">
	<span class="name a">Team A</span>
	<span class="score">{game.score.A}</span>
	<span class="serve" class:on={game.serving === 'A'} title="Serving"></span>
	<span class="dash">–</span>
	<span class="serve" class:on={game.serving === 'B'} title="Serving"></span>
	<span class="score">{game.score.B}</span>
	<span class="name b">Team B</span>
</div>
{#if game.winner}
	<p class="winner">
		Team {game.winner} wins {game.score[game.winner]}–{game.score[other(game.winner)]}
	</p>
{:else}
	<p class="meta">Rally {game.rally} · to {config.targetScore}, win by {config.winBy}</p>
{/if}

<style>
	.scoreboard {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.score {
		font-size: 2rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.name.a {
		color: var(--team-a);
	}
	.name.b {
		color: var(--team-b);
	}
	.dash {
		color: var(--muted);
	}
	.serve {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.serve.on {
		background: var(--text);
	}
	.meta,
	.winner {
		margin: 0 0 12px;
		color: var(--muted);
	}
	.winner {
		color: var(--text);
		font-weight: 600;
	}
</style>
```

<!-- file: src/lib/ui/Controls.svelte -->
```svelte
<script lang="ts">
	let {
		seed = $bindable(),
		over,
		onstep,
		onrally,
		ongame,
		onreset,
		onnewseed
	}: {
		seed: number;
		over: boolean;
		onstep: () => void;
		onrally: () => void;
		ongame: () => void;
		onreset: () => void;
		onnewseed: () => void;
	} = $props();
</script>

<div class="controls">
	<button onclick={onstep} disabled={over}>Step</button>
	<button onclick={onrally} disabled={over}>Play rally</button>
	<button onclick={ongame} disabled={over}>Play game</button>
	<button onclick={onreset}>Reset</button>
	<button onclick={onnewseed}>New seed</button>
	<label>Seed <input type="number" bind:value={seed} onchange={onreset} /></label>
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 16px;
	}
	label {
		display: flex;
		gap: 6px;
		align-items: center;
		color: var(--muted);
	}
	input {
		width: 7rem;
	}
</style>
```

<!-- file: src/routes/+page.svelte -->
```svelte
<script lang="ts">
	import { newGame, playGame, playRally, step } from '#lib/engine/rally.ts';
	import Controls from '#lib/ui/Controls.svelte';
	import Court from '#lib/ui/Court.svelte';
	import RallyLog from '#lib/ui/RallyLog.svelte';
	import Scoreboard from '#lib/ui/Scoreboard.svelte';

	const randomSeed = () => Math.floor(Math.random() * 1_000_000);

	const initialSeed = randomSeed();
	let seed = $state(initialSeed);
	let game = $state.raw(newGame(initialSeed));

	const reset = () => (game = newGame(Number(seed) || 0));
	const newSeed = () => {
		seed = randomSeed();
		reset();
	};
</script>

<svelte:head>
	<title>Volley</title>
</svelte:head>

<main>
	<h1>Volley · beach 2v2</h1>
	<Scoreboard {game} />
	<Controls
		bind:seed
		over={game.phase.kind === 'gameOver'}
		onstep={() => (game = step(game))}
		onrally={() => (game = playRally(game))}
		ongame={() => (game = playGame(game))}
		onreset={reset}
		onnewseed={newSeed}
	/>
	<div class="layout">
		<Court {game} />
		<RallyLog {game} />
	</div>
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 16px;
	}
	h1 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 8px;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
		gap: 24px;
		align-items: start;
	}
	@media (max-width: 720px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
```

---

### Task 10: Rally log

<!-- file: src/lib/ui/RallyLog.svelte -->
```svelte
<script lang="ts">
	import type { Game, LogEntry } from '#lib/engine/types.ts';

	let { game }: { game: Game } = $props();

	const rallies = $derived.by(() => {
		const byRally = new Map<number, LogEntry[]>();
		for (const entry of game.log) {
			const list = byRally.get(entry.rally) ?? [];
			list.push(entry);
			byRally.set(entry.rally, list);
		}
		return [...byRally]
			.map(([rally, entries]) => ({ rally, entries, point: entries.find((e) => e.tag === 'point') }))
			.reverse();
	});
</script>

<section aria-label="Rally log">
	{#each rallies as r, i (r.rally)}
		<details open={i === 0}>
			<summary>Rally {r.rally} · {r.point ? r.point.text : 'in progress'}</summary>
			<ol>
				{#each r.entries as entry, j (j)}
					<li class:point={entry.tag === 'point'}>{entry.text}</li>
				{/each}
			</ol>
		</details>
	{/each}
</section>

<style>
	section {
		max-height: 560px;
		overflow-y: auto;
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.8rem;
	}
	details {
		border-bottom: 1px solid var(--border);
		padding: 4px 0;
	}
	summary {
		cursor: pointer;
		color: var(--muted);
	}
	details[open] summary {
		color: var(--text);
	}
	ol {
		list-style: none;
		margin: 4px 0;
		padding-left: 16px;
	}
	.point {
		font-weight: 600;
	}
</style>
```

---

### Task 11: SVG court and player chips

`Tween.of` re-targets the tween whenever the function's value changes, so chips and the ball glide between zones.

<!-- file: src/lib/ui/PlayerChip.svelte -->
```svelte
<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import type { Player, TeamId } from '#lib/engine/types.ts';

	let {
		player,
		team,
		x,
		y,
		hitter = false
	}: { player: Player; team: TeamId; x: number; y: number; hitter?: boolean } = $props();

	const pos = Tween.of(() => ({ x, y }), { duration: 350, easing: cubicOut });
</script>

<g class="chip {team}" class:hitter transform="translate({pos.current.x - 36} {pos.current.y - 20})">
	<rect width="72" height="40" rx="6" />
	<text x="36" y="16">{player.slot === 'blocker' ? 'Blocker' : 'Defender'}</text>
	<text x="36" y="32" class="stats">A{player.attack} · D{player.defense}</text>
</g>

<style>
	rect {
		stroke-width: 1;
	}
	.A rect {
		fill: var(--team-a-bg);
		stroke: var(--team-a);
	}
	.B rect {
		fill: var(--team-b-bg);
		stroke: var(--team-b);
	}
	.hitter rect {
		stroke-width: 2.5;
	}
	text {
		text-anchor: middle;
		font-size: 11px;
		font-weight: 600;
	}
	.A text {
		fill: var(--team-a);
	}
	.B text {
		fill: var(--team-b);
	}
	.stats {
		font-weight: 400;
	}
</style>
```

<!-- file: src/lib/ui/Court.svelte -->
```svelte
<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { other } from '#lib/engine/rally.ts';
	import { TARGET, ZONES } from '#lib/engine/rules.ts';
	import type { Game, TeamId } from '#lib/engine/types.ts';
	import { ballAt, positions, VIEW, zoneBox, zoneCenter } from './layout';
	import PlayerChip from './PlayerChip.svelte';

	let { game }: { game: Game } = $props();

	const TEAMS: TeamId[] = ['A', 'B'];
	const pos = $derived(positions(game));
	const a = $derived(game.attack);
	const defending = $derived(a ? other(a.team) : null);
	const target = $derived(a?.calls ? TARGET[a.calls.shot] : null);
	const ball = Tween.of(() => ballAt(game, pos), { duration: 300, easing: cubicOut });

	const arrow = $derived.by(() => {
		if (!a?.calls) return null;
		return { from: zoneCenter(a.team, 4), to: zoneCenter(other(a.team), TARGET[a.calls.shot]) };
	});

	// Line block sits straight in front of the hitter (zone 2's column); cross shades toward the middle.
	const blockBar = $derived.by(() => {
		if (!a?.calls || !defending) return null;
		const box = zoneBox(defending, a.calls.block === 'line' ? 2 : 3);
		return { x: box.x + 10, y: defending === 'A' ? VIEW.netY + 6 : VIEW.netY - 12, w: box.w - 20 };
	});
</script>

<figure>
	<svg viewBox="0 0 {VIEW.width} {VIEW.height}" role="img" aria-label="Court">
		<defs>
			<marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
				<path d="M2 1L8 5L2 9" fill="none" stroke="var(--muted)" stroke-width="1.5" />
			</marker>
		</defs>

		{#each TEAMS as team (team)}
			{#each ZONES as zone (zone)}
				{@const b = zoneBox(team, zone)}
				<rect
					class="zone"
					class:target={team === defending && zone === target}
					class:landing={team === defending && zone === a?.landing}
					x={b.x}
					y={b.y}
					width={b.w}
					height={b.h}
				/>
				<text class="zone-label" x={b.x + 6} y={b.y + 14}>{zone}</text>
			{/each}
		{/each}

		<rect class="net" x="8" y={VIEW.netY - 4} width={VIEW.width - 16} height="8" />
		{#if blockBar}
			<rect class="block" x={blockBar.x} y={blockBar.y} width={blockBar.w} height="6" rx="2" />
		{/if}
		{#if arrow}
			<line
				class="arrow"
				x1={arrow.from.x}
				y1={arrow.from.y}
				x2={arrow.to.x}
				y2={arrow.to.y}
				marker-end="url(#head)"
			/>
		{/if}

		{#each TEAMS as team (team)}
			{#each ['blocker', 'defender'] as const as slot (slot)}
				{@const at = zoneCenter(team, pos[team][slot])}
				<PlayerChip
					player={game.teams[team][slot]}
					{team}
					x={at.x}
					y={at.y}
					hitter={a?.team === team && a.hitter === slot}
				/>
			{/each}
		{/each}

		<circle class="ball" cx={ball.current.x + 30} cy={ball.current.y - 20} r="7" />
	</svg>
	<figcaption>
		<span class="a">Team A</span> bottom · <span class="b">Team B</span> top · bar = block ·
		arrow = called shot
	</figcaption>
</figure>

<style>
	figure {
		margin: 0;
	}
	svg {
		width: 100%;
		display: block;
	}
	.zone {
		fill: var(--surface);
		stroke: var(--border);
		stroke-width: 1;
	}
	.zone.target {
		fill: var(--target);
	}
	.zone.landing {
		fill: var(--landing);
	}
	.zone-label {
		font-size: 10px;
		fill: var(--muted);
	}
	.net {
		fill: var(--muted);
	}
	.block {
		fill: var(--block);
	}
	.arrow {
		stroke: var(--muted);
		stroke-width: 1.5;
		stroke-dasharray: 4 4;
	}
	.ball {
		fill: var(--ball);
		stroke: #854f0b;
		stroke-width: 1;
	}
	figcaption {
		font-size: 0.8rem;
		color: var(--muted);
		margin-top: 4px;
	}
	.a {
		color: var(--team-a);
	}
	.b {
		color: var(--team-b);
	}
</style>
```

---

### Task 12: Check it in the browser

1. `npm run check` — expect 0 errors.
2. `npm test` — expect all tests to pass.
3. `npm run dev`, open the page and check:
   - Step walks one phase at a time and the log shows each roll.
   - After the calls, the block bar, arrow and defender position match the log line.
   - Play rally stops at a point; Play game runs to 21 with a 2-point lead and shows the winner.
   - Reset with the same seed replays the same game; New seed changes the stats.
   - At phone width (375px) the log stacks under the court with no sideways scroll.
   - Dark mode is readable.
