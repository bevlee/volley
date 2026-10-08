import { describe, expect, it } from 'vitest';
import { fixedChoosers, randomChoosers, type Choosers } from './choosers';
import { config } from './config';
import { newGame, playGame, step } from './rally';
import { recordGame, ReplayError, replayGame, replaySteps, rulesFingerprint, type GameRecord, type RecordedCall } from './replay';
import { mulberry32, pick } from './rng';
import type { Game } from './types';

/**
 * Plays a game the way the page does: at each call, a player makes some parts (from their own RNG,
 * separate from the game's) and the computer makes the rest. Returns the game and who made each call.
 */
function playMixed(seed: number) {
	const player = mulberry32(seed * 7919);
	const byComputer: RecordedCall['byComputer'][] = [];
	const who = () => byComputer.at(-1)!;
	// The engine asks for the shot first at every call, so that's where the next call is shared out.
	const choosers: Choosers = {
		shot: (g, team, rng) => {
			byComputer.push({ shot: player.next() < 0.5, defence: player.next() < 0.5 });
			return who().shot ? randomChoosers.shot(g, team, rng) : pick(player, ['line', 'cross', 'tip'] as const);
		},
		block: (g, team, rng) => (who().defence ? randomChoosers.block(g, team, rng) : pick(player, ['line', 'cross'] as const)),
		stance: (g, team, rng) => (who().defence ? randomChoosers.stance(g, team, rng) : pick(player, ['deep', 'short'] as const))
	};
	return { game: playGame(newGame(seed), choosers), byComputer };
}

const states = (record: GameRecord) => [...replaySteps(record)];

const firstComputerCall = (r: GameRecord) => r.calls.findIndex((c) => c.byComputer.shot);

describe('replay', () => {
	it('replays games of mixed player and computer calls exactly', () => {
		for (let seed = 1; seed <= 200; seed++) {
			const { game, byComputer } = playMixed(seed);
			expect(replayGame(recordGame(game, byComputer))).toEqual(game);
		}
	});

	it('steps through every state from the start to the same end', () => {
		const { game, byComputer } = playMixed(3);
		const all = states(recordGame(game, byComputer));
		expect(all[0]).toEqual(newGame(3));
		expect(all.map((s) => s.steps)).toEqual(all.map((_, i) => i));
		expect(all.at(-1)!.log).toEqual(game.log);
		expect(all.at(-1)!.score).toEqual(game.score);
	});

	it("can't replay the computer's calls as fixed values: their draws from the dice RNG would be skipped", () => {
		const { game, byComputer } = playMixed(4);
		const record = recordGame(game, byComputer);
		let g = newGame(record.seed);
		let i = 0;
		while (g.phase.kind !== 'gameOver' && i < record.calls.length)
			g = step(g, g.phase.kind === 'calls' ? fixedChoosers(record.calls[i++]) : randomChoosers);
		expect(g.log).not.toEqual(game.log);
	});

	it('catches a computer call that was changed', () => {
		const { game, byComputer } = playMixed(5);
		const record = recordGame(game, byComputer);
		const call = record.calls[firstComputerCall(record)];
		call.shot = call.shot === 'line' ? 'cross' : 'line';
		expect(() => replayGame(record)).toThrow(/the computer's shot replays as/);
	});

	it('refuses a record that stops before the game ends; stepping stops at the next call', () => {
		const { game, byComputer } = playMixed(6);
		const record = recordGame(game, byComputer);
		record.calls = record.calls.slice(0, 10);
		expect(() => replayGame(record)).toThrow(ReplayError);
		const last = states(record).at(-1)!;
		expect(last.phase.kind).toBe('calls');
		expect(last.log.filter((e) => e.tag === 'calls')).toHaveLength(10);
	});

	it('refuses a record with calls left over after the game ends', () => {
		const { game, byComputer } = playMixed(7);
		const record = recordGame(game, byComputer);
		record.calls.push({ ...record.calls[0] });
		expect(() => replayGame(record)).toThrow(/ended after/);
	});

	it("records a game that's still going", () => {
		let g: Game = newGame(8);
		while (g.log.filter((e) => e.tag === 'calls').length < 3) g = step(g);
		const computer = { shot: true, defence: true };
		const replayed = states(recordGame(g, [computer, computer, computer]));
		expect(replayed[g.steps]).toEqual(g);
		// It plays on to the next call, then stops there: the record has nothing for it.
		expect(replayed.at(-1)!.phase.kind).toBe('calls');
	});

	it('needs to know who made every call', () => {
		const { game, byComputer } = playMixed(9);
		expect(() => recordGame(game, byComputer.slice(1))).toThrow(ReplayError);
	});
});

describe('rulesFingerprint', () => {
	it('is the same every time', () => {
		expect(rulesFingerprint(10)).toBe(rulesFingerprint(10));
	});

	it('changes when a balance number changes', () => {
		const before = rulesFingerprint(10);
		const bonus = config.blockBonus;
		try {
			config.blockBonus = bonus + 1;
			expect(rulesFingerprint(10)).not.toBe(before);
		} finally {
			config.blockBonus = bonus;
		}
		expect(rulesFingerprint(10)).toBe(before);
	});
});
