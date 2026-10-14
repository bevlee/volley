import { describe, expect, it } from 'vitest';
import { NUMBERED } from './lineup';
import { fixedChoosers, withDefence, withShot } from './choosers';
import { config } from './config';
import { newGame, playGame, playRally, step } from './rally';
import { scriptedDice } from './rng';
import type { Calls, Game } from './types';

/**
 * A new game where every stat is 4, so the arithmetic in each test is easy to follow.
 * B has already served (no dice), so the next step is A's pass.
 */
function evenGame(): Game {
	const g = newGame(1, NUMBERED);
	for (const team of [g.teams.A, g.teams.B]) {
		for (const p of [team.blocker, team.defender]) {
			p.attack = 4;
			p.defense = 4;
		}
	}
	return step(g);
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
	describe('with special charges', () => {
		const specials = (check: () => void) => {
			try {
				config.specials = true;
				check();
			} finally {
				config.specials = false;
			}
		};
		const pipsLog = (g: Game) => g.log.filter((e) => e.tag === 'pips').map((e) => e.data);
		const none = { blocker: 0, defender: 0 };

		it("charges the player who made the touch: 2 for a perfect pass, 1 for a great set, up to 4", () => {
			specials(() => {
				// A1 passes 6 (+2, perfect): A1 has 2. A2 sets 6 (+2, great): A2 has 1.
				const g = run(2, lineIntoBlock, [6, 6]);
				expect(g.pips).toEqual({ A: { blocker: 2, defender: 1 }, B: none });
				expect(pipsLog(g)).toEqual([
					{ team: 'A', slot: 'blocker', player: 'A1', gained: 2, wasted: 0, pips: 2 },
					{ team: 'A', slot: 'defender', player: 'A2', gained: 1, wasted: 0, pips: 1 }
				]);
				// Two more perfect passes by A1: 4, then 4 with 2 wasted.
				g.phase = { kind: 'freeBall', team: 'A' };
				const twice = run(1, lineIntoBlock, [6], g);
				twice.phase = { kind: 'freeBall', team: 'A' };
				const capped = run(1, lineIntoBlock, [6], twice);
				expect(capped.pips!.A.blocker).toBe(4);
				expect(pipsLog(capped).at(-1)).toMatchObject({ slot: 'blocker', gained: 0, wasted: 2, pips: 4 });
			});
		});

		it("a special hit spends the hitter's charge and adds power and accuracy", () => {
			specials(() => {
				const g = evenGame();
				g.pips = { A: { blocker: 1, defender: 3 }, B: none };
				// A1 passes and hits. Pass 4, set 4 (±0), power 3: 4 + 3 + 2 special = 9, plus the setter's 4 = 13.
				// Aim 2 + 4 + 2 special = 8. A2's charges are untouched.
				const calls: Calls = { shot: 'cross', block: 'line', stance: 'short', special: true };
				const hit = run(4, calls, [4, 4, 3, 2, 1], g);
				expect(hit.pips!.A).toEqual({ blocker: 0, defender: 3 });
				expect(hit.attack!.incoming).toBe(13);
				expect(hit.attack!.accuracy).toBe(8);
			});
		});

		it("a dig special spends the digger's charge and adds 4, even when the shot goes elsewhere", () => {
			specials(() => {
				const g = evenGame();
				g.pips = { A: none, B: { blocker: 2, defender: 2 } };
				// Cross lands on target in 5; the short defender in 3 is two away: 4 × 0.25 + 6 + 4 special = 11.
				const calls: Calls = { shot: 'cross', block: 'line', stance: 'short', defenceSpecial: 'dig' };
				const dug = run(4, calls, [4, 4, 3, 4, 6], g);
				expect(dug.pips!.B).toEqual({ blocker: 2, defender: 1 });
				expect(dug.log.filter((e) => e.tag === 'dig').at(-1)?.data).toMatchObject({ total: 11 });
			});
		});

		it("won't spend a charge the player doesn't have", () => {
			specials(() => {
				const g = evenGame();
				g.pips = { A: none, B: { blocker: 0, defender: 1 } };
				const calls: Calls = { shot: 'cross', block: 'line', stance: 'short', defenceSpecial: 'block' };
				expect(() => run(3, calls, [4, 4], g)).toThrow('B has no charge to spend on the block');
			});
		});
	});

	describe('with set tempos and block modes', () => {
		const modes = (check: () => void) => {
			try {
				config.blockModes = true;
				check();
			} finally {
				config.blockModes = false;
			}
		};
		// Pass 4 and set 4 (±0), power 3 (line hits 11 with the setter's share), aim 4 (8: on target).
		const build = [4, 4, 3, 4];
		const entry = (g: Game, tag: string) => g.log.filter((e) => e.tag === tag).at(-1)?.data;

		it('a reading blocker gets across to the other channel off a high set, late', () => {
			modes(() => {
				const calls: Calls = { shot: 'line', block: 'cross', stance: 'deep', tempo: 'high', blockMode: 'read' };
				// Read 5 (high sets: 5 or less gets across), block 5: 4 + 5 + 2 = 11 vs 11, a touch.
				const g = run(4, calls, [...build, 5, 5]);
				expect(entry(g, 'read')).toMatchObject({ across: true });
				expect(entry(g, 'block')).toMatchObject({ total: 11, mode: 'read', result: 'touch' });
			});
		});

		it("a fast set beats the read, but it's harder to aim", () => {
			modes(() => {
				const calls: Calls = { shot: 'line', block: 'cross', stance: 'deep', tempo: 'fast', blockMode: 'read' };
				// Read 3 is too slow for a fast set (2 or less); the aim of 4 + 4 drops to 6 and drifts.
				const g = run(4, calls, [...build, 3, 6]);
				expect(entry(g, 'read')).toMatchObject({ across: false });
				expect(g.attack!.accuracy).toBe(6);
				expect(g.log.some((e) => e.rally === g.rally && e.tag === 'block')).toBe(false);
			});
		});

		it('with no block, a shot down the called channel goes past, and the dig gets help', () => {
			modes(() => {
				const calls: Calls = { shot: 'line', block: 'line', stance: 'deep', tempo: 'high', blockMode: 'none' };
				// The deep defender is across in 5, two zones from line's 1: 4 × 0.25 + dig 6 + 2 help = 9.
				const g = run(4, calls, [...build, 6]);
				expect(g.log.some((e) => e.rally === g.rally && e.tag === 'block')).toBe(false);
				expect(entry(g, 'dig')).toMatchObject({ total: 9 });
			});
		});
	});

	it('aims serves when they are on: the passer is the one served, and their defense counts', () => {
		const before = config.serveTargets;
		try {
			config.serveTargets = true;
			const at = (serve: 'blocker' | 'defender' | 'seam') => ({ ...fixedChoosers(lineIntoBlock), serve: () => serve });
			const g = newGame(5, NUMBERED);
			g.teams.A.defender.defense = 6;
			// Straight at A's defender: pass 3, plus 6 − 4 for their defense, reads as a 5: +1.
			const served = step(step(g, at('defender'), scriptedDice([])), at('defender'), scriptedDice([3]));
			expect(served.attack).toMatchObject({ team: 'A', hitter: 'defender', firstDie: 3, firstMod: 1 });
			// Into the seam: a 5 picks the defender, and the pass of 6 reads as a 5 (−1): +1, not +2.
			g.teams.A.defender.defense = 4;
			const seam = step(step(g, at('seam'), scriptedDice([5])), at('seam'), scriptedDice([6]));
			expect(seam.attack).toMatchObject({ hitter: 'defender', firstDie: 6, firstMod: 1 });
		} finally {
			config.serveTargets = before;
		}
	});

	it("won't hit a shot the set doesn't leave on", () => {
		const before = config.minSet;
		try {
			config.minSet = { line: 0, cross: null, tip: null };
			// Pass 3 (±0), set 1: a −3 set, too poor for line.
			expect(() => run(3, lineIntoBlock, [3, 1])).toThrow("line isn't on off a −3 set");
			expect(run(3, { ...lineIntoBlock, shot: 'cross' }, [3, 1]).phase).toEqual({ kind: 'hit' });
		} finally {
			config.minSet = before;
		}
	});

	it('starts with B2 holding the serve, then serving it to A without rolling', () => {
		const g = newGame(5, NUMBERED);
		expect(g.phase).toEqual({ kind: 'serve', team: 'B' });
		expect(g.serving).toBe('B');
		const served = step(g);
		expect(served.phase).toEqual({ kind: 'freeBall', team: 'A' });
		expect(served.rolls).toEqual([]);
		expect(served.log.at(-1)).toMatchObject({ tag: 'serve', data: { team: 'B', player: 'B2' } });
	});

	it('alternates servers when a team wins the serve back', () => {
		// A wins with a guaranteed kill: a side-out, so A's server switches from A2 to A1
		const afterPoint = playRally(evenGame(), fixedChoosers(lineIntoBlock), scriptedDice([4, 6, 6]));
		const g = step(afterPoint);
		expect(g.phase).toEqual({ kind: 'serve', team: 'A' });
		expect(step(g).log.at(-1)?.data?.player).toBe('A1');
	});

	it('remembers where a dig was played for the next possession', () => {
		const calls: Calls = { shot: 'tip', block: 'line', stance: 'short' };
		expect(run(5, calls, [4, 4, 3, 4, 3, 4]).attack).toMatchObject({ team: 'B', source: 'dig', dugAt: 3 });
		expect(run(1, calls, [4]).attack).toMatchObject({ team: 'A', source: 'free' });
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
		// there's no aim roll, so the ball lands where the shot was called
		expect(g.attack?.landing).toBe(1);
	});

	it('stuffs a hard shot into the block', () => {
		// pass 4 → 0, set 4 → 0, power 4+2 = 6, team 6 + (setter 4 + set die 4)/2 = 10,
		// accuracy 4+0+0+4 = 8 → zone 1, block 4+6+3 = 13 vs 10 → stuff
		const g = playRally(evenGame(), fixedChoosers(lineIntoBlock), scriptedDice([4, 4, 2, 4, 6]));
		expect(g.score).toEqual({ A: 0, B: 1 });
		expect(lastPoint(g)?.data?.kind).toBe('stuff');
	});

	it('kills when the defender misreads', () => {
		// cross past a line block, defender short in 3. power 4+5 = 9, team 9 + (4+4)/2 = 13,
		// accuracy 5+4 = 9 → zone 5, dig from 3: 4 × ¼ = 1, + 6 = 7 vs 13 → kill
		const calls: Calls = { shot: 'cross', block: 'line', stance: 'short' };
		const g = playRally(evenGame(), fixedChoosers(calls), scriptedDice([4, 4, 5, 5, 6]));
		expect(g.score).toEqual({ A: 1, B: 0 });
		expect(lastPoint(g)?.data?.kind).toBe('kill');
	});

	it('digs a read tip in the same step as the hit', () => {
		// tip power 4+3 = 7 (no partner die), accuracy 4+4 = 8 → zone 3,
		// dig 4 × 1 + 3 + 3 read = 10 vs 7 → up
		const calls: Calls = { shot: 'tip', block: 'line', stance: 'short' };
		const g = run(4, calls, [4, 4, 3, 4, 3]);
		expect(g.phase.kind).toBe('dug');
		expect(g.attack).toMatchObject({ team: 'A', landing: 3, digDie: 3 });
	});

	it('after a dig, the digger becomes the hitter and their partner sets', () => {
		// dig die 3 is the first touch: firstTouch(3) = 0; set 4 + 0 = 4 → 0
		const calls: Calls = { shot: 'tip', block: 'line', stance: 'short' };
		const g = run(5, calls, [4, 4, 3, 4, 3, 4]);
		expect(g.phase.kind).toBe('calls');
		expect(g.attack).toMatchObject({ team: 'B', hitter: 'defender', firstDie: 3, firstMod: 0, setDie: 4, setMod: 0 });
		expect(g.rolls).toEqual([{ team: 'B', slot: 'blocker', die: 4, label: 'set' }]);
	});

	it('sends a badly aimed hard shot into the block, even when the blocker took the other channel', () => {
		// cross past a line block. pass 4 → 0, set 3 → −1, power 4+4−1 = 7, team 7 + (4+3)/2 = 10,
		// aim 1 + 0 − 1 + 4 = 4 → into the block, block 4+6+3 = 13 vs 10 → stuff
		const calls: Calls = { shot: 'cross', block: 'line', stance: 'deep' };
		const g = run(4, calls, [4, 3, 4, 1, 6]);
		const entries = g.log.slice(g.logStart);
		expect(entries.find((e) => e.tag === 'accuracy')?.data).toMatchObject({ result: 'block' });
		expect(entries.find((e) => e.tag === 'block')?.data).toMatchObject({ result: 'stuff', intoBlock: true });
		expect(g.attack?.aim).toBe('block');
		expect(lastPoint(g)?.data?.kind).toBe('stuff');
	});

	it('turns a wild hit into a free ball for the other side', () => {
		// pass 1 → −2, set 2 − 2 = 0 → −4, power 4+3−4 = 3, team 3 + (4+2)/2 = 6,
		// accuracy 2 − 2 − 4 + 4 = 0 → easy ball
		const g = run(4, lineIntoBlock, [1, 2, 3, 2]);
		expect(g.phase).toEqual({ kind: 'freeBall', team: 'B' });
	});

	it('counts a block touch as the blockers’ first contact, not a free ball', () => {
		// power 4+4 = 8, team 8 + (4+4)/2 = 12, accuracy 8 → zone 1, block 4+5+3 = 12 vs 12 → touch
		const g = run(4, lineIntoBlock, [4, 4, 4, 4, 5]);
		expect(g.phase).toEqual({ kind: 'touched' });
		expect(g.attack).toMatchObject({ team: 'A', blockDie: 5 });
	});

	it('after a block touch, the defender sets straight away and the blocker attacks, with no pass bonus', () => {
		// no pass, so the touch penalty stands in for it: set 4 − 1 = 3 → −1
		const g = run(5, lineIntoBlock, [4, 4, 4, 4, 5, 4]);
		expect(config.touchFirstMod).toBe(-1);
		expect(g.phase.kind).toBe('calls');
		expect(g.attack).toMatchObject({
			team: 'B',
			hitter: 'blocker',
			source: 'touch',
			firstDie: 5,
			firstMod: -1,
			setDie: 4,
			setMod: -1
		});
		expect(g.rolls).toEqual([{ team: 'B', slot: 'defender', die: 4, label: 'set' }]);
	});

	it('has the team that won the point serve the next rally', () => {
		const afterPoint = playRally(evenGame(), fixedChoosers(lineIntoBlock), scriptedDice([1, 1]));
		const g = step(afterPoint);
		expect(g.rally).toBe(2);
		expect(g.serving).toBe('B');
		expect(g.phase).toEqual({ kind: 'serve', team: 'B' });
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
		expect(playGame(newGame(42, NUMBERED)).log).toEqual(playGame(newGame(42, NUMBERED)).log);
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

describe('dice record', () => {
	it('names players by team and number', () => {
		const g = newGame(1, NUMBERED);
		expect(g.teams.A.blocker.name).toBe('A1');
		expect(g.teams.B.defender.name).toBe('B2');
	});

	it('records who rolled each die in the latest step', () => {
		const afterPass = run(1, lineIntoBlock, [4]);
		expect(afterPass.rolls).toEqual([{ team: 'A', slot: 'blocker', die: 4, label: 'pass' }]);
		expect(afterPass.steps).toBe(2);
	});

	it('rolls the attackers, blocker and defender together in the hit step', () => {
		// power 4+6 = 10, team 10 + (4+4)/2 = 14, accuracy 8 → zone 1,
		// block 4+1+3 = 8 vs 14 → clean, dig from 5: 4 × ¼ = 1, + 6 = 7 vs 14 → kill.
		// The setter's share uses their set die, so they roll nothing here.
		const g = run(4, lineIntoBlock, [4, 4, 6, 4, 1, 6]);
		expect(g.rolls).toEqual([
			{ team: 'A', slot: 'blocker', die: 6, label: 'power' },
			{ team: 'A', slot: 'blocker', die: 4, label: 'aim' },
			{ team: 'B', slot: 'blocker', die: 1, label: 'block' },
			{ team: 'B', slot: 'defender', die: 6, label: 'dig' }
		]);
		expect(lastPoint(g)?.data?.kind).toBe('kill');
	});

	it('marks where the latest step’s log entries start, with details for the UI', () => {
		// the stuff rally: power 6, team 10, block 13
		const g = run(4, lineIntoBlock, [4, 4, 2, 4, 6]);
		const entries = g.log.slice(g.logStart);
		expect(entries.map((e) => e.tag)).toEqual(['hit', 'accuracy', 'block', 'point']);
		expect(entries[0].data).toMatchObject({ team: 'A', player: 'A1', shot: 'line', attack: 10 });
		expect(entries[1].data).toMatchObject({ result: 'exact', zone: 1 });
		expect(entries[2].data).toMatchObject({ result: 'stuff', total: 13, attack: 10, player: 'B1' });
		expect(entries[3].data).toMatchObject({ winner: 'B', kind: 'stuff', scoreA: 0, scoreB: 1, gameOver: false });
	});

	it('tags passes, sets and digs with who did it and how well', () => {
		const calls: Calls = { shot: 'tip', block: 'line', stance: 'short' };
		// pass 6 → +2, set 4 + 2 → +2, tip 4 + 3 + 2 = 9, aim 4 + 2 + 2 + 4 = 12 → zone 3, dig 4 + 5 + 3 = 12 → up
		const g = run(4, calls, [6, 4, 3, 4, 5]);
		const byTag = (tag: string) => g.log.find((e) => e.tag === tag)?.data;
		expect(byTag('pass')).toMatchObject({ team: 'A', player: 'A1', mod: 2 });
		expect(byTag('set')).toMatchObject({ team: 'A', player: 'A2', mod: 2 });
		expect(byTag('dig')).toMatchObject({ player: 'B2', stance: 'short', read: true, up: true });
	});

	it('clears the dice on a step that rolls nothing', () => {
		// step 3 is the calls, which use no dice
		expect(run(3, lineIntoBlock, [4, 4]).rolls).toEqual([]);
	});
});

describe('choosing the shot', () => {
	it('uses the chosen shot while the defence still calls at random', () => {
		// pass and set, then the calls with the shot chosen as a tip
		const atCalls = run(2, lineIntoBlock, [4, 4]);
		const g = step(atCalls, withShot('tip'));
		expect(g.attack?.calls?.shot).toBe('tip');
		expect(['line', 'cross']).toContain(g.attack?.calls?.block);
		expect(['deep', 'short']).toContain(g.attack?.calls?.stance);
	});
});

describe('choosing the defence', () => {
	it('uses the chosen block and defender position while the attacker picks at random', () => {
		const atCalls = run(2, lineIntoBlock, [4, 4]);
		const g = step(atCalls, withDefence('cross', 'short'));
		expect(g.attack?.calls).toMatchObject({ block: 'cross', stance: 'short' });
		expect(['line', 'cross', 'tip']).toContain(g.attack?.calls?.shot);
	});
});
