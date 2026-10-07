import { describe, expect, it } from 'vitest';
import { fixedChoosers } from '../engine/choosers';
import { newGame, playRally, step } from '../engine/rally';
import type { Game } from '../engine/types';
import { scriptedDice } from '../engine/rng';
import { arcPoint, ballAt, calloutTop, flightKind, previewDefence, placeDice, positions, rollBall, rollPositions, roleOf, zoneBox, zoneCenter } from './layout';

describe('placeDice', () => {
	it('lines up each player’s dice under their zone centre', () => {
		const pos = { A: { blocker: 4, defender: 3 }, B: { blocker: 3, defender: 6 } } as const;
		const dice = placeDice(
			[
				{ team: 'A', slot: 'blocker', die: 2, label: 'power' },
				{ team: 'A', slot: 'defender', die: 5, label: 'pool' },
				{ team: 'A', slot: 'blocker', die: 4, label: 'aim' }
			],
			pos
		);
		// zone A4 centre is (60, 350): two 20px dice with a 6px gap span 37–83
		// zone A3 centre is (150, 350): one die starts at 140
		expect(dice.map((d) => [d.label, d.x, d.y])).toEqual([
			['power', 37, 376],
			['aim', 63, 376],
			['pool', 140, 376]
		]);
	});
});

describe('roleOf', () => {
	it('calls the attacking pair attacker and setter, and the other side blocker and defender', () => {
		const g = newGame(1);
		expect(roleOf(g, 'A', 'blocker')).toBe('Blocker');
		expect(roleOf(g, 'A', 'defender')).toBe('Defender');

		g.attack = { team: 'A', hitter: 'defender', source: 'free', firstDie: 4, firstMod: 0 };
		expect(roleOf(g, 'A', 'defender')).toBe('Attacker');
		expect(roleOf(g, 'A', 'blocker')).toBe('Setter');
		expect(roleOf(g, 'B', 'blocker')).toBe('Blocker');
		expect(roleOf(g, 'B', 'defender')).toBe('Defender');
	});
});

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
	const game = (edit: (g: Game) => void) => {
		const g = newGame(1);
		edit(g);
		return g;
	};

	it('has the server in their back court and the receivers back to pass', () => {
		// B serves first with B2; A's passer (A1, the blocker) waits in 5, A2 in 1
		expect(positions(newGame(1))).toEqual({ A: { blocker: 5, defender: 1 }, B: { blocker: 2, defender: 1 } });
	});

	it('keeps the passers in place until the set', () => {
		const g = game((g) => {
			g.phase = { kind: 'set' };
			g.attack = { team: 'A', hitter: 'blocker', source: 'free', firstDie: 4, firstMod: 0 };
		});
		expect(positions(g)).toEqual({ A: { blocker: 5, defender: 1 }, B: { blocker: 2, defender: 6 } });
	});

	it('keeps a digger where they dug, with their setter still at the net, until the set', () => {
		const g = game((g) => {
			g.phase = { kind: 'set' };
			g.attack = { team: 'B', hitter: 'defender', source: 'dig', dugAt: 3, firstDie: 4, firstMod: 0 };
		});
		expect(positions(g).B).toEqual({ defender: 3, blocker: 2 });
	});

	it('brings the hitter up to 4 once the ball is set, then places the defence by their calls', () => {
		const set = { team: 'A' as const, hitter: 'defender' as const, source: 'free' as const, firstDie: 4, firstMod: 0 };
		const beforeCalls = game((g) => {
			g.phase = { kind: 'calls' };
			g.attack = set;
		});
		expect(positions(beforeCalls)).toEqual({ A: { defender: 4, blocker: 3 }, B: { blocker: 2, defender: 6 } });
		const afterCalls = game((g) => {
			g.phase = { kind: 'hit' };
			g.attack = { ...set, calls: { shot: 'line', block: 'cross', stance: 'deep' } };
		});
		expect(positions(afterCalls).B).toEqual({ blocker: 2, defender: 1 });
	});
});

describe('positions after a free ball mid-rally', () => {
	it('holds the attack’s picture until the pass', () => {
		// A hit line into B1's block and it was touched: a free ball to B
		const g = newGame(1);
		g.phase = { kind: 'freeBall', team: 'B' };
		g.attack = {
			team: 'A',
			hitter: 'blocker',
			source: 'free',
			firstDie: 4,
			firstMod: 0,
			calls: { shot: 'line', block: 'line', stance: 'deep' },
			landing: 1
		};
		expect(positions(g)).toEqual({ A: { blocker: 4, defender: 3 }, B: { blocker: 2, defender: 5 } });
	});
});

describe('rollPositions', () => {
	it('sends the passer to their passing spot, with the ball, before they roll the pass', () => {
		const g = newGame(1);
		g.phase = { kind: 'freeBall', team: 'B' };
		g.attack = {
			team: 'A',
			hitter: 'blocker',
			source: 'free',
			firstDie: 4,
			firstMod: 0,
			calls: { shot: 'line', block: 'line', stance: 'deep' },
			landing: 1
		};
		const rolls = [{ team: 'B' as const, slot: 'blocker' as const, die: 4, label: 'pass' as const }];
		const at = rollPositions(g, rolls);
		// B2 is already deep in 5, so B1 takes the free ball in the middle of the back court
		expect(at.B).toEqual({ blocker: 6, defender: 5 });
		expect(rollBall(g, rolls, at)).toEqual(zoneCenter('B', 6));
	});

	it('moves the setter to the setting spot before they roll the set', () => {
		const before = newGame(1);
		before.phase = { kind: 'set' };
		before.attack = { team: 'A', hitter: 'blocker', source: 'free', firstDie: 4, firstMod: 0 };
		const rolls = [{ team: 'A' as const, slot: 'defender' as const, die: 5, label: 'set' as const }];
		expect(rollPositions(before, rolls).A).toEqual({ blocker: 5, defender: 3 });
	});

	it('sets from where they stand when the digger is already on the setting spot', () => {
		const before = newGame(1);
		before.phase = { kind: 'dug' };
		before.attack = {
			team: 'A',
			hitter: 'blocker',
			source: 'free',
			firstDie: 4,
			firstMod: 0,
			calls: { shot: 'tip', block: 'line', stance: 'short' },
			landing: 3
		};
		// B2 dug from 3 (short); B1 is at the net in 2 and sets from there
		const rolls = [{ team: 'B' as const, slot: 'blocker' as const, die: 5, label: 'set' as const }];
		expect(rollPositions(before, rolls).B).toEqual({ blocker: 2, defender: 3 });
	});

	it('leaves everyone else where they stand', () => {
		const g = newGame(1);
		expect(rollPositions(g, [])).toEqual(positions(g));
	});
});

describe('ballAt', () => {
	it('starts with the server', () => {
		const g = newGame(1);
		expect(ballAt(g, positions(g))).toEqual(zoneCenter('B', 1));
	});

	it('goes to the passer once served', () => {
		const g = step(newGame(1));
		expect(ballAt(g, positions(g))).toEqual(zoneCenter('A', 5));
	});

	it('stays with the passer until the set', () => {
		const g = newGame(1);
		g.phase = { kind: 'set' };
		g.attack = { team: 'A', hitter: 'blocker', source: 'free', firstDie: 4, firstMod: 0 };
		// A1 passed from 5; A2 is still back in 1
		expect(ballAt(g, positions(g))).toEqual(zoneCenter('A', 5));
	});

	it('sits in the landing zone once the ball has landed', () => {
		const g = newGame(1);
		g.phase = { kind: 'dug' };
		g.attack = { team: 'A', hitter: 'blocker', source: 'free', firstDie: 4, firstMod: 0, landing: 6 };
		expect(ballAt(g, positions(g))).toEqual(zoneCenter('B', 6));
	});

	it('drops back on the hitter’s side after a stuff block', () => {
		const g = playRally(
			newGame(1),
			fixedChoosers({ shot: 'line', block: 'line', stance: 'deep' }),
			// pass, set, power 1, pool 1, aim 6 (on target), block 6
			scriptedDice([4, 4, 1, 1, 6, 6])
		);
		expect(g.log.at(-1)?.data?.kind).toBe('stuff');
		expect(ballAt(g, positions(g))).toEqual(zoneCenter('A', 3));
	});
});

describe('calloutTop', () => {
	it('picks the emptiest band of the favoured team’s half, clear of the players', () => {
		// A's pair at 4 and 3 (front row): the callout goes to A's back court
		const attacking = { A: { blocker: 4, defender: 3 }, B: { blocker: 2, defender: 6 } } as const;
		expect(calloutTop('A', attacking)).toBeGreaterThan(85);
		// B's defender deep in 6 and blocker at the net in 2: the callout sits between them
		const top = calloutTop('B', attacking);
		expect(top).toBeGreaterThan(20);
		expect(top).toBeLessThan(35);
	});
});

describe('rollBall', () => {
	it('sends the ball straight to the setting spot as the setter gets there', () => {
		const before = newGame(1);
		before.phase = { kind: 'set' };
		before.attack = { team: 'A', hitter: 'blocker', source: 'free', firstDie: 4, firstMod: 0 };
		const rolls = [{ team: 'A' as const, slot: 'defender' as const, die: 5, label: 'set' as const }];
		expect(rollBall(before, rolls, rollPositions(before, rolls))).toEqual(zoneCenter('A', 3));
	});

	it('leaves the ball where it is for other rolls', () => {
		const g = step(newGame(1));
		const rolls = [{ team: 'A' as const, slot: 'blocker' as const, die: 4, label: 'pass' as const }];
		expect(rollBall(g, rolls, rollPositions(g, rolls))).toEqual(ballAt(g, positions(g)));
	});
});

describe('ball flight', () => {
	const from = { x: 0, y: 100 };
	const to = { x: 100, y: 300 };

	it('starts and ends on the ground at each end', () => {
		expect(arcPoint(from, to, 50, 0)).toEqual({ x: 0, y: 100, ground: from, height: 0 });
		expect(arcPoint(from, to, 50, 1)).toEqual({ x: 100, y: 300, ground: to, height: 0 });
	});

	it('peaks halfway, raised by the apex above its shadow', () => {
		expect(arcPoint(from, to, 50, 0.5)).toEqual({ x: 50, y: 150, ground: { x: 50, y: 200 }, height: 50 });
	});

	it('flies a serve, a spike and a tip differently', () => {
		const served = step(newGame(1));
		expect(flightKind(served, false)).toBe('serve');
		const stuffed = playRally(
			newGame(1),
			fixedChoosers({ shot: 'line', block: 'line', stance: 'deep' }),
			scriptedDice([4, 4, 1, 1, 6, 6])
		);
		expect(flightKind(stuffed, false)).toBe('spike');
		const tipped = playRally(
			newGame(1),
			fixedChoosers({ shot: 'tip', block: 'line', stance: 'deep' }),
			scriptedDice([4, 4, 3, 4, 1])
		);
		expect(flightKind(tipped, false)).toBe('tip');
		// a pass or a set floats up high
		expect(flightKind(served, true)).toBe('lob');
	});
});

describe('previewDefence', () => {
	it('moves the defending pair to the spots being chosen', () => {
		const g = newGame(1);
		g.phase = { kind: 'calls' };
		g.attack = { team: 'A', hitter: 'blocker', source: 'free', firstDie: 4, firstMod: 0 };
		// blocking cross leaves the line open, so a deep defender covers the line in 1
		expect(previewDefence(g, 'cross', 'deep').B).toEqual({ blocker: 2, defender: 1 });
		expect(previewDefence(g, 'line', 'short').B).toEqual({ blocker: 2, defender: 3 });
		// the attackers don't move
		expect(previewDefence(g, 'line', 'short').A).toEqual(positions(g).A);
	});
});
