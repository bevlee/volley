import { randomChoosers, type Choosers } from './choosers';
import { newGame, playGame, step } from './rally';
import type { Calls, Game } from './types';

/**
 * A game is its seed plus the calls made at each attack. Dice and the computer's calls share one
 * seeded RNG, so the computer's calls aren't replayed as fixed values: that would skip their draws
 * and shift every die after them. Replay lets the computer choose again from the same RNG, which
 * gives the same call, and checks it against the one recorded.
 */
export interface RecordedCall extends Calls {
	/** Which parts the computer chose: the attacking shot, and the block and dig. */
	byComputer: { shot: boolean; defence: boolean };
}

export interface GameRecord {
	seed: number;
	calls: RecordedCall[];
}

export class ReplayError extends Error {}

/** The calls made in `game` so far, read from its log, with who made each. */
export function recordGame(game: Game, byComputer: RecordedCall['byComputer'][]): GameRecord {
	const calls = game.log.filter((e) => e.tag === 'calls').map((e) => e.data!);
	if (calls.length !== byComputer.length)
		throw new ReplayError(`${calls.length} calls in the log but ${byComputer.length} records of who made them`);
	return {
		seed: game.seed,
		calls: calls.map((d, i) => ({
			shot: d.shot as Calls['shot'],
			block: d.block as Calls['block'],
			stance: d.stance as Calls['stance'],
			byComputer: { ...byComputer[i] }
		}))
	};
}

/**
 * Choosers that hand out the recorded calls in order: the player's parts as recorded, the computer's
 * drawn again and checked. The engine asks for the shot first at every call, so that's where it
 * moves on to the next one.
 */
function recordedChoosers(record: GameRecord) {
	let index = -1;
	const call = () => record.calls[index];
	const check = <T>(part: string, drawn: T, recorded: T) => {
		if (drawn !== recorded)
			throw new ReplayError(`call ${index + 1}: the computer's ${part} replays as ${drawn}, recorded ${recorded}`);
		return drawn;
	};
	const choosers: Choosers = {
		shot: (g, team, rng) => {
			if (++index >= record.calls.length)
				throw new ReplayError(`the record ends after ${record.calls.length} calls, before the game does`);
			const c = call();
			return c.byComputer.shot ? check('shot', randomChoosers.shot(g, team, rng), c.shot) : c.shot;
		},
		block: (g, team, rng) =>
			call().byComputer.defence ? check('block', randomChoosers.block(g, team, rng), call().block) : call().block,
		stance: (g, team, rng) =>
			call().byComputer.defence ? check('stance', randomChoosers.stance(g, team, rng), call().stance) : call().stance
	};
	return { choosers, used: () => index + 1, more: () => index + 1 < record.calls.length };
}

/**
 * The final state of a recorded, finished game. Fast (the engine copies the game once), so it's
 * what checks an uploaded record. Throws `ReplayError` if the record doesn't add up.
 */
export function replayGame(record: GameRecord): Game {
	const { choosers, used } = recordedChoosers(record);
	const g = playGame(newGame(record.seed), choosers);
	if (g.phase.kind !== 'gameOver') throw new ReplayError('the game never ends');
	if (used() !== record.calls.length)
		throw new ReplayError(`the game ended after ${used()} of ${record.calls.length} recorded calls`);
	return g;
}

/**
 * Every state of a recorded game, one step at a time, for watching it. Each step copies the whole
 * game, so this is for the screen, not for checking records. It stops at the end of the game, or at
 * the first call past the end of the record (a game still going).
 */
export function* replaySteps(record: GameRecord): Generator<Game> {
	const { choosers, more } = recordedChoosers(record);
	let g = newGame(record.seed);
	yield g;
	while (g.phase.kind !== 'gameOver') {
		if (g.phase.kind === 'calls' && !more()) return;
		g = step(g, choosers);
		yield g;
	}
}

/** cyrb53: a small, fast 53-bit string hash that runs the same in the browser and in Node. */
function hash(text: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 2654435761);
		h2 = Math.imul(h2 ^ c, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const FINGERPRINT_SEEDS = 50;

/**
 * Changes whenever the rules or balance change how a game plays out, and not for comments,
 * refactors or log wording. Saved games with another fingerprint would replay wrongly, so they're
 * deleted. A change only on a branch none of these games reaches can slip past it.
 */
export function rulesFingerprint(seeds = FINGERPRINT_SEEDS): string {
	const results: string[] = [];
	for (let seed = 1; seed <= seeds; seed++) {
		const g = playGame(newGame(seed));
		results.push(`${g.score.A}-${g.score.B}:${g.steps}:${g.rngState}`);
	}
	return hash(results.join('|'));
}
