import { randomChoosers, SERVE_TARGETS, type Choosers } from './choosers';
import { config } from './config';
import { playRally } from './rally';
import { mulberry32, type Rng } from './rng';
import { attackOptionsIn, availableSpends, blockModesIn, blocksIn, stancesIn } from './rules';
import type { BlockMode, Channel, DefenceSpecial, Game, ServeTarget, Shot, Stance, TeamId, Tempo, Touch } from './types';

/** The attacking side's half of a call. */
export interface AttackCall {
	shot: Shot;
	tempo?: Tempo;
	touch?: Touch;
	special?: boolean;
}

/** The defending side's half of a call. */
export interface DefenceCall {
	block: Channel;
	/** Left out when it makes no difference: against a quick ball. */
	stance?: Stance;
	blockMode?: BlockMode;
	defenceSpecial?: DefenceSpecial;
}

/** Rows are attack calls, columns are defence calls; each cell is the share of rallies the attacking side wins. */
type Payoffs = number[][];

/** One call's options, as the set leaves them, and how each attack does against each defence. */
export interface Table {
	attacks: AttackCall[];
	defences: DefenceCall[];
	payoffs: Payoffs;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const argmax = (xs: number[]) => xs.indexOf(Math.max(...xs));
const argmin = (xs: number[]) => xs.indexOf(Math.min(...xs));
const column = (m: Payoffs, j: number) => m.map((row) => row[j]);

function sample(rng: Rng, weights: number[]): number {
	let r = rng.next();
	for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
	return weights.length - 1;
}

/**
 * The balanced way to make a call: the mix of attacks, and the mix of defences, that the other side
 * can't exploit. Found by fictitious play (each side keeps answering the other's mix so far), which
 * settles on the equilibrium of a small zero-sum game like this one.
 */
export function equilibrium(m: Payoffs, rounds = 2000): { attack: number[]; defence: number[] } {
	const attack = new Array(m.length).fill(0);
	const defence = new Array(m[0].length).fill(0);
	let a = 0;
	let d = 0;
	for (let t = 0; t < rounds; t++) {
		attack[a]++;
		defence[d]++;
		a = argmax(m.map((row) => row.reduce((sum, v, j) => sum + v * defence[j], 0)));
		d = argmin(defence.map((_, j) => m.reduce((sum, row, i) => sum + row[j] * attack[i], 0)));
	}
	return { attack: attack.map((n) => n / rounds), defence: defence.map((n) => n / rounds) };
}

/**
 * Every attack and defence call open at this set: the shots and blocks it leaves on, tempos and
 * block modes when they're in play, stances unless it's a quick ball, and spending a special charge
 * when the hitter, blocker or digger has one.
 */
function options(game: Game): { attacks: AttackCall[]; defences: DefenceCall[] } {
	const { team, hitter } = game.attack!;
	const rival: TeamId = team === 'A' ? 'B' : 'A';
	const pips = config.specials ? game.pips : undefined;
	const blockModes = blockModesIn(game);
	const modes: (BlockMode | undefined)[] = blockModes.length ? blockModes : [undefined];
	const specials: (boolean | undefined)[] = pips && pips[team][hitter] > 0 ? [false, true] : [undefined];
	const open = pips ? availableSpends(pips[rival]) : [];
	const spends: (DefenceSpecial | undefined)[] = open.length > 1 ? open : [undefined];
	// The hitter's options (in run mode, their abilities or their team's playbook), and the defence's.
	const attacks = attackOptionsIn(game).flatMap(({ shot, tempo, touch }) => specials.map((special) => ({ shot, tempo, touch, special })));
	const stances = stancesIn(game);
	const defences = blocksIn(game).flatMap((block) =>
		(stances.length ? stances : [undefined]).flatMap((stance) =>
			modes.flatMap((blockMode) => spends.map((defenceSpecial) => ({ block, stance, blockMode, defenceSpecial })))
		)
	);
	return { attacks, defences };
}

/**
 * Computer players that look ahead. At each call, every attack is played against every defence
 * `rollouts` times, from the current set to the end of the rally, with random calls after that.
 * They see what a player sees at the call (the set, both sides' stats), not the other side's call,
 * and only weigh the calls the set leaves open. Every cell replays the same dice, so the comparison
 * isn't swamped by luck.
 *
 * A rally only looks as far as its own point, so special charges left at the end count for
 * `pipValue` of a point each (and the other side's against): otherwise saving one would look worthless.
 * 0.08 is about what spending one on a hit is worth, on average, to the rally it's spent in.
 *
 * Serves (when they're aimed) are picked the same way, and the same for all three: the receivers
 * make no call, so there's nothing to mix against.
 *
 * - `smart`: the best call against a side that calls at random.
 * - `reader`: attacks like `smart`, and defends knowing `smart`'s habits: it defends against the
 *   attack `smart` would make off this set. The opponent who has figured you out.
 * - `mixed`: the equilibrium mix, sampled. Can't be exploited, by a reader or anyone.
 */
export function lookahead(rollouts = 100, pipValue = 0.08) {
	// Both teams' calls for one attack come from the same table, so it's built once per call.
	let cached: { game: Game; steps: number; table: Table } | null = null;

	const table = (game: Game): Table => {
		if (cached?.game === game && cached.steps === game.steps) return cached.table;
		// The log isn't needed for the playout, and copying it is most of the cost.
		const start = { ...game, log: [] };
		const { team } = game.attack!;
		const rival: TeamId = team === 'A' ? 'B' : 'A';
		const { attacks, defences } = options(game);
		const sum = (pips: Record<string, number>) => Object.values(pips).reduce((a, b) => a + b, 0);
		const pipsAt = (g: Game) => (g.pips ? sum(g.pips[team]) - sum(g.pips[rival]) : 0);
		// The playout's first step replays this call; later calls in the rally are random.
		const thisCall = (g: Game) => g.steps === game.steps + 1;
		const payoffs = attacks.map((attack) =>
			defences.map((defence) => {
				const choosers: Choosers = {
					shot: (g, t, r) => (thisCall(g) ? attack.shot : randomChoosers.shot(g, t, r)),
					tempo: (g, t, r) => (thisCall(g) && attack.tempo) || randomChoosers.tempo!(g, t, r),
					touch: (g, t, r) => (thisCall(g) && attack.touch) || randomChoosers.touch!(g, t, r),
					block: (g, t, r) => (thisCall(g) ? defence.block : randomChoosers.block(g, t, r)),
					stance: (g, t, r) => (thisCall(g) && defence.stance) || randomChoosers.stance(g, t, r),
					blockMode: (g, t, r) => (thisCall(g) && defence.blockMode) || randomChoosers.blockMode!(g, t, r),
					special: (g, t, r) => (thisCall(g) ? (attack.special ?? false) : randomChoosers.special!(g, t, r)),
					defenceSpecial: (g, t, r) =>
						thisCall(g) ? (defence.defenceSpecial ?? 'none') : randomChoosers.defenceSpecial!(g, t, r)
				};
				let won = 0;
				for (let i = 0; i < rollouts; i++) {
					const end = playRally(start, choosers, mulberry32(i + 1));
					if (end.score[team] > game.score[team]) won++;
					won += pipValue * (pipsAt(end) - pipsAt(game));
				}
				return won / rollouts;
			})
		);
		cached = { game, steps: game.steps, table: { attacks, defences, payoffs } };
		return cached.table;
	};

	/** The serve target that wins the serving side the most rallies, with random calls after it. */
	const serve = (game: Game, team: TeamId): ServeTarget => {
		const start = { ...game, log: [] };
		const won = SERVE_TARGETS.map((target) => {
			let points = 0;
			for (let i = 0; i < rollouts; i++) {
				const end = playRally(start, { ...randomChoosers, serve: () => target }, mulberry32(i + 1));
				if (end.score[team] > game.score[team]) points++;
			}
			return points;
		});
		return SERVE_TARGETS[argmax(won)];
	};

	/** The attack `smart` makes: best on average against a random defence. */
	const smartAttack = (m: Payoffs) => argmax(m.map(mean));

	/**
	 * One side's call, picked whole by `pick` the first time any part of it is asked for, then handed
	 * out part by part (shot, then tempo or touch; or block, then stance and block mode).
	 */
	const calling = <T>(side: (t: Table) => T[], pick: (m: Payoffs, rng: Rng) => number) => {
		let last: { game: Game; steps: number; call: T } | null = null;
		return (game: Game, rng: Rng): T => {
			if (last?.game === game && last.steps === game.steps) return last.call;
			const t = table(game);
			last = { game, steps: game.steps, call: side(t)[pick(t.payoffs, rng)] };
			return last.call;
		};
	};

	const player = (pickAttack: (m: Payoffs, rng: Rng) => number, pickDefence: (m: Payoffs, rng: Rng) => number): Choosers => {
		const attack = calling((t) => t.attacks, pickAttack);
		const defence = calling((t) => t.defences, pickDefence);
		return {
			shot: (game, _team, rng) => attack(game, rng).shot,
			tempo: (game, team, rng) => attack(game, rng).tempo ?? randomChoosers.tempo!(game, team, rng),
			touch: (game, team, rng) => attack(game, rng).touch ?? randomChoosers.touch!(game, team, rng),
			block: (game, _team, rng) => defence(game, rng).block,
			stance: (game, team, rng) => defence(game, rng).stance ?? randomChoosers.stance(game, team, rng),
			blockMode: (game, team, rng) => defence(game, rng).blockMode ?? randomChoosers.blockMode!(game, team, rng),
			special: (game, _team, rng) => attack(game, rng).special ?? false,
			defenceSpecial: (game, _team, rng) => defence(game, rng).defenceSpecial ?? 'none',
			serve
		};
	};

	// Smart defends best against a random attack: lowest average down the column.
	const smart = player(smartAttack, (m) => argmin(m[0].map((_, j) => mean(column(m, j)))));
	const reader = player(smartAttack, (m) => argmin(m[smartAttack(m)]));
	const mixed = player(
		(m, rng) => sample(rng, equilibrium(m).attack),
		(m, rng) => sample(rng, equilibrium(m).defence)
	);

	return { smart, reader, mixed, table };
}
