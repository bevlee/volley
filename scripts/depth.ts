import { fixedChoosers, randomChoosers, type Choosers } from '../src/lib/engine/choosers';
import { config } from '../src/lib/engine/config';
import { LINEUP } from '../src/lib/engine/lineup';
import { equilibrium, lookahead } from '../src/lib/engine/lookahead';
import { newGame, other, step } from '../src/lib/engine/rally';
import { mulberry32, type Rng } from '../src/lib/engine/rng';
import { attackOptionsIn, blockModesIn, blocksIn, stancesIn } from '../src/lib/engine/rules';
import type { BlockMode, Channel, Game, Phase, Stance, TeamId } from '../src/lib/engine/types';

/**
 * How much the calls are worth, worked out exactly instead of simulated. Every attack in a rally
 * starts from a set and two calls, so the rally is a chain of small payoff tables: attack call ×
 * defence call → the chance the attacking side wins the rally. Each cell comes from the engine
 * itself (`step`), run down every way the dice can fall. An attack that doesn't end the rally (a
 * dig, a block touch, an easy ball) hands the other side a new attack, whose value is the
 * continuation; values are solved for the whole chain at once, so there's no sampling noise.
 *
 * For each variant it reports the numbers `sim:tempo` measures (exact, not sampled), and with
 * --detail the tables themselves, grouped by hitter and set.
 *
 * - mixed: the balanced player. It solves each exact table with the rest of the rally played at
 *   random (what the lookahead's rollouts do) and plays the equilibrium mix.
 * - eq: the true equilibrium of the whole rally, where every later call is balanced too. It plays
 *   almost exactly like mixed.
 * - smart, reader: as in the lookahead, off the same tables as mixed.
 *
 * --sampled[=rollouts] also plays the lookahead's own players, whose fixed rollout seeds give each
 * call one noisy table: that's what `sim:tempo` measures, and it lands inside the sim's margins.
 * The noise makes them play more like smart, so against random they do better than balanced.
 * --control checks the enumeration against seeded engine hits.
 *
 *   npm run sim:depth -- [--detail] [--control] [--sampled[=40]] [variant names...]
 */

/** Where a side gets the ball before its set: a free ball, or a dig or block touch and its die. */
interface Entry {
	key: string;
	team: TeamId;
	game: Game;
	/** The calls its set can lead to, and their chances. The rest is a shank before the calls. */
	calls: [call: number, chance: number][];
}

/** What one attack call against one defence call leads to, for the attacking side. */
interface Cell {
	win: number;
	/** The other side's next attack, and its chance. The rest is a lost point. */
	next: [entry: number, chance: number][];
}

/** One call: the set is in, and both sides choose. */
interface Call {
	key: string;
	team: TeamId;
	hitter: string;
	setMod: number;
	attacks: string[];
	defences: string[];
	/** Rows are attacks, columns defences. */
	cells: Cell[][];
}

interface Model {
	entries: Entry[];
	calls: Call[];
	/** A game at each call, for the lookahead to look ahead from. */
	games: Map<Call, Game>;
	/** The entry where each team receives a serve. */
	receives: Record<TeamId, number>;
}

const NEED = Symbol('another die');

/**
 * Every way the dice can fall, stepping from `start` until `done`, with the chance of each. Every
 * draw is read as a d6, which is also fair for the engine's picks between two or three zones.
 */
function enumerate(start: Game, done: (g: Game) => boolean, choosers: Choosers = randomChoosers): [Game, number][] {
	const out: [Game, number][] = [];
	const stack: number[][] = [[]];
	while (stack.length) {
		const prefix = stack.pop()!;
		let i = 0;
		const rng: Rng = {
			next() {
				if (i === prefix.length) throw NEED;
				return (prefix[i++] - 0.5) / 6;
			}
		};
		try {
			let g = start;
			do g = step(g, choosers, rng);
			while (!done(g));
			out.push([g, 6 ** -prefix.length]);
		} catch (e) {
			if (e !== NEED) throw e;
			for (let die = 1; die <= 6; die++) stack.push([...prefix, die]);
		}
	}
	return out;
}

const scored = (before: Game, after: Game) => after.score.A + after.score.B > before.score.A + before.score.B;
const atCalls = (g: Game) => g.phase.kind === 'calls' || g.phase.kind === 'pointOver';
/** The calls take no dice once every call is fixed: a die asked for here is a call this script doesn't make. */
const noDice: Rng = {
	next() {
		throw new Error('the calls asked for a die: a call is left to chance');
	}
};

function entryKey(g: Game): string {
	const phase: Phase = g.phase;
	if (phase.kind === 'freeBall') return `${phase.team} ${JSON.stringify(phase)}`;
	if (phase.kind === 'dug') return `${other(g.attack!.team)} dug ${g.attack!.digDie}`;
	if (phase.kind === 'touched') return `${other(g.attack!.team)} touched ${g.attack!.blockDie}`;
	throw new Error(`no attack starts from ${phase.kind}`);
}

function callKey(g: Game): string {
	const a = g.attack!;
	return `${a.team} ${a.hitter} ${a.source} ${a.firstMod} ${a.setDie} ${a.setMod}`;
}

const label = (o: { shot: string; touch?: string }) => (o.touch ? `${o.shot} ${o.touch}` : o.shot);

type DefenceCall = { block: Channel; stance?: Stance; blockMode?: BlockMode };

/**
 * The defence calls open at this call: a block, and a stance unless it's a quick ball. When the
 * blocker can stay down, that's a third job beside the two blocks (with a stance that makes no
 * difference), as the random chooser picks it.
 */
function defencesIn(g: Game): DefenceCall[] {
	const stances = stancesIn(g);
	const blocks = blocksIn(g);
	const calls = blocks.flatMap((block) => (stances.length ? stances : [undefined]).map((stance) => ({ block, stance })));
	if (!blockModesIn(g).includes('none')) return calls;
	return [
		...calls.map((c) => ({ ...c, blockMode: 'commit' as const })),
		...stances.map((stance) => ({ block: blocks[0], stance, blockMode: 'none' as const }))
	];
}

/** One name per defence call, the same whichever block a call that stays down carries. */
const defenceKey = ({ block, stance, blockMode }: DefenceCall) =>
	blockMode === 'none' ? `down ${stance}` : stance ? `${block} ${stance}` : block;

/** Plays one attack call against one defence call, up to the hit. */
function toHit(g: Game, attack: { shot: string; touch?: string }, defence: DefenceCall) {
	const calls = {
		shot: attack.shot,
		touch: attack.touch,
		block: defence.block,
		stance: defence.stance ?? 'deep',
		blockMode: defence.blockMode
	} as Parameters<typeof fixedChoosers>[0];
	return step(g, fixedChoosers(calls), noDice);
}

/** Every entry and call a rally can reach, from either side's serve receive, with each call's table. */
function explore(): Model {
	const entries: Entry[] = [];
	const calls: Call[] = [];
	const games = new Map<Call, Game>();
	const entryIds = new Map<string, number>();
	const callIds = new Map<string, number>();
	const pending: number[] = [];

	const entryId = (g: Game): number => {
		const key = entryKey(g);
		let id = entryIds.get(key);
		if (id === undefined) {
			id = entries.length;
			entryIds.set(key, id);
			const team = g.phase.kind === 'freeBall' ? g.phase.team : other(g.attack!.team);
			entries.push({ key, team, game: { ...g, log: [] }, calls: [] });
			pending.push(id);
		}
		return id;
	};

	const callId = (g: Game): number => {
		const key = callKey(g);
		const known = callIds.get(key);
		if (known !== undefined) return known;
		const id = calls.length;
		callIds.set(key, id);
		const a = g.attack!;
		const attacks = attackOptionsIn(g);
		const defences = defencesIn(g);
		const call: Call = {
			key,
			team: a.team,
			hitter: g.teams[a.team][a.hitter].name,
			setMod: a.setMod!,
			attacks: attacks.map(label),
			defences: defences.map(defenceKey),
			cells: []
		};
		calls.push(call);
		games.set(call, g);
		call.cells = attacks.map((attack) =>
			defences.map((defence) => {
				const hit = toHit(g, attack, defence);
				let win = 0;
				const next = new Map<number, number>();
				for (const [end, chance] of enumerate(hit, () => true)) {
					if (scored(hit, end)) win += end.score[a.team] > hit.score[a.team] ? chance : 0;
					else {
						const e = entryId(end);
						next.set(e, (next.get(e) ?? 0) + chance);
					}
				}
				return { win, next: [...next] };
			})
		);
		return id;
	};

	const serve = (team: TeamId) => step({ ...newGame(1), log: [], serving: other(team), phase: { kind: 'serve', team: other(team) } });
	const receives = { A: entryId(serve('A')), B: entryId(serve('B')) };
	while (pending.length) {
		const entry = entries[pending.pop()!];
		const found = new Map<number, number>();
		for (const [end, chance] of enumerate(entry.game, atCalls)) {
			if (scored(entry.game, end)) continue;
			const c = callId(end);
			found.set(c, (found.get(c) ?? 0) + chance);
		}
		entry.calls = [...found];
	}
	return { entries, calls, games, receives };
}

/** The value of a zero-sum table to its row player and both sides' equilibrium mixes, by the simplex method. */
export function solve(m: number[][]): { value: number; attack: number[]; defence: number[] } {
	const rows = m.length;
	const cols = m[0].length;
	const shift = 1 - Math.min(...m.flat());
	const width = cols + rows;
	// The column player's LP: maximise Σy subject to (m + shift) y ≤ 1. Its duals are the row player's mix.
	const t = m.map((row, i) => [...row.map((v) => v + shift), ...Array.from({ length: rows }, (_, k) => Number(k === i)), 1]);
	t.push([...new Array(cols).fill(-1), ...new Array(rows + 1).fill(0)]);
	const basis = Array.from({ length: rows }, (_, i) => cols + i);
	const eps = 1e-12;
	for (;;) {
		const enter = t[rows].findIndex((v, j) => j < width && v < -eps);
		if (enter < 0) break;
		let leave = -1;
		let best = Infinity;
		for (let i = 0; i < rows; i++) {
			if (t[i][enter] <= eps) continue;
			const ratio = t[i][width] / t[i][enter];
			if (ratio < best - eps || (ratio <= best + eps && basis[i] < basis[leave])) [best, leave] = [ratio, i];
		}
		const pivot = t[leave];
		const p = pivot[enter];
		for (let j = 0; j <= width; j++) pivot[j] /= p;
		for (let i = 0; i <= rows; i++) {
			const f = t[i][enter];
			if (i !== leave && f !== 0) for (let j = 0; j <= width; j++) t[i][j] -= f * pivot[j];
		}
		basis[leave] = enter;
	}
	const total = t[rows][width];
	const defence = new Array(cols).fill(0);
	basis.forEach((b, i) => b < cols && (defence[b] = t[i][width] / total));
	const attack = Array.from({ length: rows }, (_, i) => t[rows][cols + i] / total);
	const value = 1 / total - shift;
	const worst = Math.min(...defence.map((_, j) => attack.reduce((s, x, i) => s + x * m[i][j], 0)));
	const best = Math.max(...m.map((row) => row.reduce((s, v, j) => s + v * defence[j], 0)));
	if (Math.abs(worst - value) > 1e-9 || Math.abs(best - value) > 1e-9)
		throw new Error(`simplex missed the equilibrium: ${worst} ≤ ${value} ≤ ${best}`);
	return { value, attack, defence };
}

type Mix = number[];
/** How one side calls: its attack mix at each call where it attacks, and its defence mix where it defends. */
interface Player {
	attack(call: Call): Mix;
	defence(call: Call): Mix;
}
type Values = Float64Array;

const uniform = (n: number): Mix => new Array(n).fill(1 / n);
const oneHot = (n: number, i: number): Mix => Array.from({ length: n }, (_, k) => Number(k === i));
const argmax = (xs: number[]) => xs.indexOf(Math.max(...xs));
const argmin = (xs: number[]) => xs.indexOf(Math.min(...xs));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const cellValue = (cell: Cell, v: Values) => cell.next.reduce((sum, [e, chance]) => sum + chance * (1 - v[e]), cell.win);
const table = (call: Call, v: Values) => call.cells.map((row) => row.map((cell) => cellValue(cell, v)));
const play = (m: number[][], attack: Mix, defence: Mix) =>
	m.reduce((s, row, i) => s + attack[i] * row.reduce((t, x, j) => t + defence[j] * x, 0), 0);

/** Each entry's chance that the side attacking from it wins the rally, when each call is worth `callValue`. */
function solveValues(model: Model, callValue: (call: Call, v: Values) => number): Values {
	let v: Values = new Float64Array(model.entries.length);
	for (let round = 0; round < 1000; round++) {
		const values = model.calls.map((call) => callValue(call, v));
		const next = new Float64Array(model.entries.map((e) => e.calls.reduce((sum, [c, chance]) => sum + chance * values[c], 0)));
		const change = Math.max(...next.map((x, i) => Math.abs(x - v[i])));
		v = next;
		if (change < 1e-12) return v;
	}
	throw new Error('rally values did not settle');
}

const mixesOf = (players: Record<TeamId, Player>) => (call: Call) => ({
	attack: players[call.team].attack(call),
	defence: players[other(call.team)].defence(call)
});

function evaluate(model: Model, players: Record<TeamId, Player>): Values {
	const mixes = model.calls.map(mixesOf(players));
	const index = new Map(model.calls.map((call, c) => [call, c]));
	return solveValues(model, (call, v) => {
		const { attack, defence } = mixes[index.get(call)!];
		return play(table(call, v), attack, defence);
	});
}

/** Chance A wins the game, and each side's expected points, from each side's chance of winning a rally it receives. */
function game(aReceives: number, bReceives: number) {
	const pointToA: Record<TeamId, number> = { A: 1 - bReceives, B: aReceives };
	const memo = new Map<string, { win: number; a: number; b: number }>();
	const from = (a: number, b: number, serving: TeamId): { win: number; a: number; b: number } => {
		if (Math.max(a, b) >= config.targetScore && Math.abs(a - b) >= config.winBy) return { win: Number(a > b), a: 0, b: 0 };
		if (a + b > 100) return { win: 0.5, a: 0, b: 0 };
		const key = `${a} ${b} ${serving}`;
		const known = memo.get(key);
		if (known) return known;
		const p = pointToA[serving];
		const won = from(a + 1, b, 'A');
		const lost = from(a, b + 1, 'B');
		const result = {
			win: p * won.win + (1 - p) * lost.win,
			a: p * (1 + won.a) + (1 - p) * lost.a,
			b: p * won.b + (1 - p) * (1 + lost.b)
		};
		memo.set(key, result);
		return result;
	};
	return from(0, 0, 'B');
}

/** `first` against `second` from both sides of the net, as `matchup` in scripts/matchups.ts plays it. */
function matchup(model: Model, first: Player, second: Player) {
	const sides = (['A', 'B'] as const).map((team) => {
		const v = evaluate(model, { [team]: first, [other(team)]: second } as Record<TeamId, Player>);
		const g = game(v[model.receives.A], v[model.receives.B]);
		const total = g.a + g.b;
		return team === 'A' ? { games: g.win, points: g.a, total } : { games: 1 - g.win, points: g.b, total };
	});
	return { games: mean(sides.map((s) => s.games)), points: (sides[0].points + sides[1].points) / (sides[0].total + sides[1].total) };
}

/** Expected visits to each call per rally, from either side's receive, weighted by how often each side receives. */
function visits(model: Model, players: Record<TeamId, Player>) {
	const mixes = model.calls.map(mixesOf(players));
	const v = evaluate(model, players);
	// The serving side keeps the serve while it wins, so in the long run each side receives this often.
	const receivesA = v[model.receives.A] / (v[model.receives.A] + v[model.receives.B]);
	const perCall = new Float64Array(model.calls.length);
	let pastOne = 0;
	for (const [team, weight] of [
		['A', receivesA],
		['B', 1 - receivesA]
	] as const) {
		let mass = new Map([[model.receives[team], weight]]);
		for (let attack = 1; mass.size; attack++) {
			const next = new Map<number, number>();
			for (const [e, m] of mass)
				for (const [c, chance] of model.entries[e].calls) {
					perCall[c] += m * chance;
					if (attack === 2) pastOne += m * chance;
					const { attack: p, defence: q } = mixes[c];
					model.calls[c].cells.forEach((row, i) =>
						row.forEach((cell, j) => {
							for (const [e2, ce] of cell.next) next.set(e2, (next.get(e2) ?? 0) + m * chance * p[i] * q[j] * ce);
						})
					);
				}
			mass = new Map([...next].filter(([, m]) => m > 1e-13));
		}
	}
	const kills = { quick: { n: 0, kills: 0 }, high: { n: 0, kills: 0 } };
	model.calls.forEach((call, c) => {
		const tempo = call.setMod >= config.quickBallMinSet ? 'quick' : 'high';
		const wins = call.cells.map((row) => row.map((cell) => cell.win));
		kills[tempo].n += perCall[c];
		kills[tempo].kills += perCall[c] * play(wins, mixes[c].attack, mixes[c].defence);
	});
	return { perCall, kills, pastOne };
}

/**
 * The lookahead's own players, exactly as `sim:tempo` plays them: its rollouts use the same seeds
 * every time, so each call gets one fixed, noisy table, and its mixes come from that.
 */
function sampledPlayers(model: Model, rollouts: number) {
	const ai = lookahead(rollouts);
	// The lookahead lists its calls in its own order (and each call that stays down once per block
	// and stance): each of its mixes is mapped onto this model's calls by name.
	const onto = (names: string[], theirs: string[], mix: number[]) =>
		names.map((name) => theirs.reduce((sum, t, k) => sum + (t === name ? mix[k] : 0), 0));
	const looked = new Map(
		model.calls.map((call) => {
			const t = ai.table(model.games.get(call)!);
			return [call, { t, attacks: t.attacks.map(label), defences: t.defences.map(defenceKey) }];
		})
	);
	const mixes = new Map(
		[...looked].map(([call, { t, attacks, defences }]) => {
			const eq = equilibrium(t.payoffs);
			return [call, { attack: onto(call.attacks, attacks, eq.attack), defence: onto(call.defences, defences, eq.defence) }];
		})
	);
	const pure = (names: string[], theirs: string[], k: number) => onto(names, theirs, oneHot(theirs.length, k));
	const smartAttack = (c: Call) => argmax(looked.get(c)!.t.payoffs.map(mean));
	return {
		mixed: { attack: (c) => mixes.get(c)!.attack, defence: (c) => mixes.get(c)!.defence } as Player,
		smart: {
			attack: (c) => pure(c.attacks, looked.get(c)!.attacks, smartAttack(c)),
			defence: (c) => {
				const { t, defences } = looked.get(c)!;
				return pure(c.defences, defences, argmin(t.defences.map((_, j) => mean(t.payoffs.map((row) => row[j])))));
			}
		} as Player,
		readerDefence: (c: Call) => {
			const { t, defences } = looked.get(c)!;
			return pure(c.defences, defences, argmin(t.payoffs[smartAttack(c)]));
		}
	};
}

/** The players the lookahead offers, off exact tables whose rest of the rally is played at random, and the true equilibrium. */
function players(model: Model) {
	const random: Player = { attack: (c) => uniform(c.attacks.length), defence: (c) => uniform(c.defences.length) };
	const atRandom = evaluate(model, { A: random, B: random });
	const tables = new Map(model.calls.map((call) => [call, table(call, atRandom)]));
	const solved = new Map(model.calls.map((call) => [call, solve(tables.get(call)!)]));
	const mixed: Player = { attack: (c) => solved.get(c)!.attack, defence: (c) => solved.get(c)!.defence };
	const smartAttack = (c: Call) => argmax(tables.get(c)!.map(mean));
	const smart: Player = {
		attack: (c) => oneHot(c.attacks.length, smartAttack(c)),
		defence: (c) => oneHot(c.defences.length, argmin(c.defences.map((_, j) => mean(tables.get(c)!.map((row) => row[j])))))
	};
	const reader: Player = { attack: smart.attack, defence: (c) => oneHot(c.defences.length, argmin(tables.get(c)![smartAttack(c)])) };
	const eqValues = solveValues(model, (call, v) => solve(table(call, v)).value);
	const eqSolved = new Map(model.calls.map((call) => [call, solve(table(call, eqValues))]));
	const eq: Player = { attack: (c) => eqSolved.get(c)!.attack, defence: (c) => eqSolved.get(c)!.defence };
	return {
		random,
		mixed,
		smart,
		reader,
		eq,
		mixedDefence: { attack: random.attack, defence: mixed.defence } as Player,
		mixedAttack: { attack: mixed.attack, defence: random.defence } as Player,
		tables,
		solved
	};
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const per100 = (x: number) => (100 * x).toFixed(1);

/** What `sim:tempo` measures with the lookahead's own (sampled) players: the same numbers, less its game-to-game noise. */
function sampledSummary(model: Model, rollouts: number) {
	const random = players(model).random;
	const s = sampledPlayers(model, rollouts);
	const vsRandom = matchup(model, s.mixed, random);
	const balanced = visits(model, { A: s.mixed, B: s.mixed });
	const v = evaluate(model, { A: s.mixed, B: s.mixed });
	return {
		'quick kills': pct(balanced.kills.quick.kills / balanced.kills.quick.n),
		'high kills': pct(balanced.kills.high.kills / balanced.kills.high.n),
		'past one attack': pct(balanced.pastOne),
		"A's games": pct(game(v[model.receives.A], v[model.receives.B]).win),
		'mixed vs random: games': pct(vsRandom.games),
		'· points': pct(vsRandom.points),
		'mixed defence: points': pct(matchup(model, { attack: random.attack, defence: s.mixed.defence }, random).points),
		'reader vs smart: points': pct(matchup(model, { attack: s.smart.attack, defence: s.readerDefence }, s.smart).points),
		'smart vs random: points': pct(matchup(model, s.smart, random).points)
	};
}

function summary(model: Model) {
	const p = players(model);
	const balanced = visits(model, { A: p.mixed, B: p.mixed });
	const vsRandom = matchup(model, p.mixed, p.random);
	const v = evaluate(model, { A: p.mixed, B: p.mixed });
	return {
		row: {
			'quick kills': pct(balanced.kills.quick.kills / balanced.kills.quick.n),
			'high kills': pct(balanced.kills.high.kills / balanced.kills.high.n),
			'past one attack': pct(balanced.pastOne),
			"A's games": pct(game(v[model.receives.A], v[model.receives.B]).win),
			'mixed vs random: games': pct(vsRandom.games),
			'· points': pct(vsRandom.points),
			'mixed defence: points': pct(matchup(model, p.mixedDefence, p.random).points),
			'mixed attack: points': pct(matchup(model, p.mixedAttack, p.random).points),
			'reader vs smart: points': pct(matchup(model, p.reader, p.smart).points),
			'smart vs random: points': pct(matchup(model, p.smart, p.random).points),
			'eq vs random: points': pct(matchup(model, p.eq, p.random).points)
		},
		players: p,
		balanced
	};
}

/**
 * Each call's table, grouped by who hits and off what set, weighted by how often balanced play
 * reaches it: the balanced value, the value when both call at random, what a random attacker and
 * a random defender each give up against the balanced side (in rallies per 100 attacks), and the
 * balanced mixes. Off the same tables as `mixed` (the rest of the rally at random).
 */
function detail(model: Model, { players: p, balanced }: ReturnType<typeof summary>) {
	type Group = {
		weight: number;
		eq: number;
		uniform: number;
		attackLoss: number;
		defenceLoss: number;
		attack: Map<string, number>;
		defence: Map<string, number>;
		smart: Map<string, number>;
	};
	const groups = new Map<string, Group>();
	const add = (mix: Map<string, number>, key: string, x: number) => mix.set(key, (mix.get(key) ?? 0) + x);
	const total = balanced.perCall.reduce((a, b) => a + b, 0);
	model.calls.forEach((call, c) => {
		const w = balanced.perCall[c];
		if (w === 0) return;
		const m = p.tables.get(call)!;
		const { value, attack, defence } = p.solved.get(call)!;
		const ua = uniform(call.attacks.length);
		const ud = uniform(call.defences.length);
		const key = `${call.hitter.padEnd(10)} ${call.setMod > 0 ? '+' : ''}${call.setMod}`;
		const g: Group = groups.get(key) ?? {
			weight: 0,
			eq: 0,
			uniform: 0,
			attackLoss: 0,
			defenceLoss: 0,
			attack: new Map(),
			defence: new Map(),
			smart: new Map()
		};
		g.weight += w;
		g.eq += w * value;
		g.uniform += w * play(m, ua, ud);
		g.attackLoss += w * (value - play(m, ua, defence));
		g.defenceLoss += w * (play(m, attack, ud) - value);
		call.attacks.forEach((a, i) => add(g.attack, a, w * attack[i]));
		call.defences.forEach((d, j) => add(g.defence, d, w * defence[j]));
		add(g.smart, call.attacks[argmax(m.map(mean))], w);
		groups.set(key, g);
	});
	const mixText = (mix: Map<string, number>, w: number) =>
		[...mix]
			.filter(([, x]) => x / w >= 0.005)
			.map(([k, x]) => `${k} ${Math.round((100 * x) / w)}`)
			.join(', ');
	console.table(
		Object.fromEntries(
			[...groups]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, g]) => [
					key,
					{
						share: pct(g.weight / total),
						balanced: pct(g.eq / g.weight),
						random: pct(g.uniform / g.weight),
						'attack loses': per100(g.attackLoss / g.weight),
						'defence loses': per100(g.defenceLoss / g.weight),
						'attack mix': mixText(g.attack, g.weight),
						'defence mix': mixText(g.defence, g.weight),
						'smart hits': mixText(g.smart, g.weight)
					}
				])
		)
	);
	const all = [...groups.values()];
	const sum = (f: (g: Group) => number) => all.reduce((s, g) => s + f(g), 0) / total;
	console.log(
		`All calls · balanced ${pct(sum((g) => g.eq))} · random ${pct(sum((g) => g.uniform))} · a random attack gives up ${per100(sum((g) => g.attackLoss))} and a random defence ${per100(sum((g) => g.defenceLoss))} rallies per 100 attacks\n`
	);
}

/**
 * The enumeration against the engine with real dice: for every 17th call, each cell's chance of a
 * win, a loss and each continuation, enumerated and from `runs` seeded hits. Prints the worst gap
 * in standard errors; much above 4 means the enumeration isn't playing the engine's dice.
 */
function control(model: Model, runs = 20_000) {
	let worst = 0;
	let cells = 0;
	for (const call of model.calls.filter((_, i) => i % 17 === 0)) {
		const entry = model.entries.find((e) => e.calls.some(([c]) => model.calls[c] === call))!;
		const start = enumerate(entry.game, atCalls).find(([g]) => g.phase.kind === 'calls' && callKey(g) === call.key)![0];
		const defences = defencesIn(start);
		attackOptionsIn(start).forEach((attack, i) =>
			defences.forEach((defence, j) => {
				const hit = toHit(start, attack, defence);
				const counts = new Map<string, number>();
				for (let r = 0; r < runs; r++) {
					const end = step(hit, randomChoosers, mulberry32(r + 1));
					const k = scored(hit, end) ? (end.score[call.team] > hit.score[call.team] ? 'win' : 'lose') : entryKey(end);
					counts.set(k, (counts.get(k) ?? 0) + 1);
				}
				const cell = call.cells[i][j];
				const exact = new Map<string, number>([['win', cell.win], ...cell.next.map(([e, c]): [string, number] => [model.entries[e].key, c])]);
				exact.set('lose', 1 - [...exact.values()].reduce((a, b) => a + b, 0));
				for (const k of new Set([...exact.keys(), ...counts.keys()])) {
					const pe = exact.get(k) ?? 0;
					const pm = (counts.get(k) ?? 0) / runs;
					worst = Math.max(worst, Math.abs(pe - pm) / Math.sqrt(Math.max(pe * (1 - pe), 1 / runs) / runs));
				}
				cells++;
			})
		);
	}
	console.log(`control: ${cells} cells, worst gap between enumeration and ${runs} seeded hits: ${worst.toFixed(2)} standard errors`);
}

const variants: [string, () => void][] = [
	['today', () => (config.advanced = false)],
	['default', () => {}]
];

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const sampled = flag('sampled') && Number(flag('sampled')!.split('=')[1] ?? 40);
const only = args.filter((a) => !a.startsWith('--'));
const defaults = structuredClone(config);
const lineup = structuredClone(LINEUP);
const results: Record<string, Record<string, string>> = {};
const sampledResults: Record<string, Record<string, string>> = {};
for (const [name, apply] of variants) {
	if (only.length && !only.includes(name)) continue;
	Object.assign(config, structuredClone(defaults), { advanced: true });
	Object.assign(LINEUP, structuredClone(lineup));
	apply();
	const started = performance.now();
	const model = explore();
	const s = summary(model);
	results[name] = { ...s.row, seconds: ((performance.now() - started) / 1000).toFixed(1) };
	if (flag('detail')) {
		console.log(`${name}: ${model.calls.length} calls, ${model.entries.length} entries`);
		detail(model, s);
	}
	if (flag('control')) control(model);
	if (sampled) sampledResults[name] = sampledSummary(model, sampled);
}
console.table(results);
if (sampled) {
	console.log(`The lookahead's own players (${sampled} rollouts per cell), as sim:tempo plays them`);
	console.table(sampledResults);
}
