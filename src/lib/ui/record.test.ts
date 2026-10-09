import { describe, expect, it } from 'vitest';
import { withDefence, withShot } from '../engine/choosers';
import { newGame, step } from '../engine/rally';
import { replayGame } from '../engine/replay';
import { mulberry32, pick } from '../engine/rng';
import type { Game } from '../engine/types';
import { callsSoFar, recordVsComputer, replayer, type CallMakers } from './record';
import { playsItself } from './story';

/** The same chains the page plays: one step, the attack after the calls, then whatever plays itself. */
function chainFrom(g: Game, choosers?: Parameters<typeof step>[1]): Game[] {
	const chain = [step(g, choosers)];
	let last = chain[0];
	if (last.phase.kind === 'hit') chain.push((last = step(last)));
	while (playsItself(last)) chain.push((last = step(last)));
	return chain;
}

/** Plays a game as /computer does, with the player on `team` making some calls and leaving others. */
function playAsPage(seed: number, team: 'A' | 'B') {
	const player = mulberry32(seed * 31);
	const makers: CallMakers = new Map();
	const chains: Game[][] = [];
	let g = newGame(seed);
	while (g.phase.kind !== 'gameOver') {
		let choosers;
		if (g.phase.kind === 'calls' && player.next() < 0.7) {
			const attacking = g.attack!.team === team;
			makers.set(callsSoFar(g), { shot: !attacking, defence: attacking });
			choosers = attacking
				? withShot(pick(player, ['line', 'cross', 'tip'] as const))
				: withDefence(pick(player, ['line', 'cross'] as const), pick(player, ['deep', 'short'] as const));
		}
		const chain = chainFrom(g, choosers);
		chains.push(chain);
		g = chain.at(-1)!;
	}
	return { game: g, makers, chains };
}

describe('recording a game against the computer', () => {
	it('replays to the same game, whichever calls the player made', () => {
		for (let seed = 1; seed <= 20; seed++) {
			const { game, makers } = playAsPage(seed, seed % 2 ? 'A' : 'B');
			expect(makers.size).toBeGreaterThan(0);
			expect(replayGame(recordVsComputer(game, makers))).toEqual(game);
		}
	});
});

describe('replayer', () => {
	it('hands out the same chains the game was played in', () => {
		for (const seed of [3, 42]) {
			const { game, makers, chains } = playAsPage(seed, 'A');
			const r = replayer(recordVsComputer(game, makers));
			expect(r.first).toEqual(newGame(seed));
			for (const chain of chains) expect(r.next()).toEqual(chain);
			expect(r.next()).toEqual([]);
		}
	});

	it('skips to the end of each point, then of the game', () => {
		const { game, makers } = playAsPage(5, 'B');
		const r = replayer(recordVsComputer(game, makers));
		let last: Game | null = null;
		for (let end: Game | null; (end = r.toPointEnd()); last = end) expect(['pointOver', 'gameOver']).toContain(end.phase.kind);
		expect(last).toEqual(game);
	});
});
