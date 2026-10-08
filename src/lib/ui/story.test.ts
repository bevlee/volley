import { describe, expect, it } from 'vitest';
import { NUMBERED } from '../engine/lineup';
import { fixedChoosers } from '../engine/choosers';
import { newGame, step } from '../engine/rally';
import { scriptedDice } from '../engine/rng';
import type { Calls, Game } from '../engine/types';
import { callout, commentary, duels, narrate, quietLine, needsDefence, needsShot, nextAction, playerActions, playsItself, playSummary, statusLine, stepEntries } from './story';

function evenGame(): Game {
	const g = newGame(1, NUMBERED);
	for (const team of [g.teams.A, g.teams.B]) {
		for (const p of [team.blocker, team.defender]) {
			p.attack = 4;
			p.defense = 4;
		}
	}
	return step(g); // B serves; the next step is A's pass
}

/** Play `n` steps with fixed calls and scripted dice. Every stat is 4. */
function run(n: number, calls: Calls, dice: number[], start = evenGame()): Game {
	const choosers = fixedChoosers(calls);
	const rng = scriptedDice(dice);
	let g = start;
	for (let i = 0; i < n; i++) g = step(g, choosers, rng);
	return g;
}

const line: Calls = { shot: 'line', block: 'line', stance: 'deep' };
const crossPastBlock = (stance: Calls['stance']): Calls => ({ shot: 'cross', block: 'line', stance });
const tip = (stance: Calls['stance']): Calls => ({ shot: 'tip', block: 'line', stance });

describe('callout', () => {
	it('is quiet for routine touches', () => {
		expect(callout(run(2, line, [4, 4]))).toBeNull();
	});

	it('calls a stuff "Block!", however big', () => {
		// block 13 vs attack 10
		expect(callout(run(4, line, [4, 4, 2, 4, 6]))).toMatchObject({ text: 'Block!', sub: 'B1 blocks A1', team: 'B', epic: true, impact: 'slam' });
		// set 3 → −1, attack 4 + 1 − 1 + (4 + 3)/2 = 7: block 13 vs 7
		expect(callout(run(4, line, [4, 3, 1, 5, 6]))?.text).toBe('Block!');
	});

	it('calls every kill "Kill!", shaking the court for a big one', () => {
		// attack 13 vs dig 7 from a defender caught short
		const kill = callout(run(4, crossPastBlock('short'), [4, 4, 5, 5, 6]));
		// every hard kill shakes the court; a big one smashes it
		expect(kill).toMatchObject({ text: 'Kill!', team: 'A', epic: false, impact: 'shake' });
		expect(kill?.sub).toMatch(/out of position/);
		// attack 13 vs dig 2
		expect(callout(run(4, crossPastBlock('short'), [4, 4, 5, 5, 1]))).toMatchObject({ text: 'Kill!', epic: true, impact: 'smash' });
		// a tip that falls in: tip 7 vs a deep defender's dig 3, a softer kind of impact
		expect(callout(run(4, tip('deep'), [4, 4, 3, 4, 2]))).toMatchObject({ text: 'Kill!', sub: 'A1 tips it in', team: 'A', impact: 'tip' });
		// a perfect set and hit
		// the set die may not grade Perfect (a block touch takes 1 off it), so the callout names the dice
		expect(callout(run(4, line, [4, 6, 6]))).toMatchObject({ text: 'Kill!', sub: 'Double six: set roll 6, power roll 6', team: 'A', epic: true, impact: 'smash' });
	});

	it('calls every dig "Dig!"', () => {
		expect(callout(run(4, tip('short'), [6, 4, 3, 4, 5]))).toMatchObject({ text: 'Dig!', sub: 'B2 dives for the tip', team: 'B', epic: true, impact: 'shake' });
		// cross 10 into a deep defender on the spot: dig 4 + 6 + 3 = 13
		expect(callout(run(4, crossPastBlock('deep'), [4, 4, 2, 4, 6]))).toMatchObject({ text: 'Dig!', sub: 'B2 reads it', team: 'B' });
	});

	it('calls a block touch "Block touch"', () => {
		expect(callout(run(4, line, [4, 4, 4, 4, 5]))).toMatchObject({ text: 'Block touch', team: 'B' });
	});

	it('calls two natural 1s an error', () => {
		expect(callout(run(2, line, [1, 1]))).toMatchObject({ text: 'Error!', team: 'B' });
		// pass 4, set 1, power die 1
		expect(callout(run(4, line, [4, 1, 1]))).toMatchObject({ text: 'Error!', sub: 'A1 hits it into the net', team: 'B' });
	});

	it('says the short defender couldn’t reach a tip that still falls in', () => {
		// set 6 → +2, tip 4 + 5 + 2 = 11 vs dig 4 + 1 + 3 = 8
		expect(callout(run(4, tip('short'), [4, 6, 5, 2, 1]))?.sub).toBe("B2 can't reach the tip");
	});

	it('keeps callout captions short', () => {
		for (const dice of [[4, 4, 5, 5, 6], [4, 4, 5, 5, 1]]) {
			expect(callout(run(4, crossPastBlock('short'), dice))!.sub.length).toBeLessThanOrEqual(34);
		}
	});

	it('calls the end of the game', () => {
		const start = evenGame();
		start.score = { A: 20, B: 19 };
		expect(callout(run(4, line, [4, 6, 6], start))).toMatchObject({ text: 'Team A wins!', sub: '21–19' });
		const bWins = evenGame();
		bWins.score = { A: 17, B: 20 };
		// the winner's score comes first
		expect(callout(run(2, line, [1, 1], bWins))).toMatchObject({ text: 'Team B wins!', sub: '21–17' });
	});
});

describe('narrate', () => {
	it('describes each step in volleyball terms', () => {
		const g = run(4, line, [6, 4, 2, 4, 6]);
		expect(g.log.map(narrate)).toEqual([
			'B2 to serve',
			'B2 serves to Team A',
			'Perfect pass from A1',
			'Perfect set from A2',
			'A1 is going down the line · B1 takes away the line · B2 stays deep',
			'A1 swings down the line',
			'Right where they wanted it',
			// attack 8 + (4 + 4) / 2 = 12 vs block 13: inside the margin. The touch is B's first contact.
			'Block touch by B1'
		]);
	});
});

describe('narrate a pass', () => {
	it('grades it from the first-touch bonus', () => {
		const pass = (die: number) => narrate(run(1, line, [die]).log.at(-1)!);
		expect([6, 5, 3, 2, 1].map(pass)).toEqual([
			'Perfect pass from A1',
			'Good pass from A1',
			'Good pass from A1',
			'Shaky pass from A1',
			'Poor pass from A1'
		]);
	});
});

describe('narrate a shot aimed into the block', () => {
	it('says it went straight into the block', () => {
		// cross past a line block, aim 4 → into the block, block 13 vs 10 → stuff
		const g = run(4, crossPastBlock('deep'), [4, 3, 4, 1, 6]);
		expect(stepEntries(g).map(narrate).slice(1, 3)).toEqual(['Straight into the block', 'Block by B1!']);
	});
});

describe('commentary', () => {
	it('tells the rally so far, one line per moment', () => {
		// pass 4, set 4, power 2, aim 4 → on target, block 13 vs 10 → stuff
		expect(commentary(run(4, line, [4, 4, 2, 4, 6]))).toEqual([
			'B2 serves to Team A',
			'Good pass from A1',
			'Good set from A2',
			'A1 is going down the line · B1 takes away the line · B2 stays deep',
			'A1 swings down the line',
			'Right where they wanted it',
			'Block by B1!',
			'Point Team B · block · 0–1'
		]);
	});
});

describe('quietLine', () => {
	it('says nothing about the touches, only the player’s call and how the point ended', () => {
		expect(quietLine(run(1, line, [4]), null)).toBe('');
		expect(quietLine(run(2, line, [4, 4]), 'A')).toBe('Your attack · A1 is hitting');
		expect(quietLine(run(4, line, [4, 4, 2, 4, 6]), 'A')).toBe('Point Team B · block · 0–1');
	});
});

describe('narrate a dig', () => {
	it('grades it from the dig roll, like a pass', () => {
		// cross into a deep defender on the spot, dig die 6 → Perfect
		const dug = run(4, crossPastBlock('deep'), [4, 4, 2, 4, 6]);
		expect(narrate(dug.log.at(-1)!)).toBe('Perfect dig from B2');
		// a read tip, dig die 5 → Good
		const saved = run(4, tip('short'), [6, 4, 3, 4, 5]);
		expect(narrate(saved.log.at(-1)!)).toBe('Good dig from B2, diving for the tip');
	});
});

describe('narrate a set off a block touch', () => {
	it('says it came off the block', () => {
		// set die 6 − 1 for the missing pass = 5 → good, not perfect
		const g = run(5, line, [6, 4, 2, 4, 6, 6]);
		expect(narrate(g.log[g.log.length - 1])).toBe('Good set from B2 off the block');
	});
});

describe('narrate a stuff', () => {
	it('names the blocker and the point', () => {
		const g = run(4, line, [4, 4, 2, 4, 6]);
		expect(stepEntries(g).map(narrate).slice(-2)).toEqual(['Block by B1!', 'Point Team B · block · 0–1']);
	});
});

describe('stepEntries', () => {
	it('returns only the latest step’s log entries', () => {
		expect(stepEntries(run(2, line, [4, 4])).map((e) => e.tag)).toEqual(['set']);
	});
});

describe('nextAction', () => {
	it('names what the next step will do', () => {
		expect(nextAction(newGame(1, NUMBERED))).toBe('Serve');
		const g = evenGame();
		expect(nextAction(g)).toBe('Pass');
		expect(nextAction(run(1, line, [4]))).toBe('Set');
		// Space at the call reveals both sides' calls and rolls the attack in one go
		expect(nextAction(run(2, line, [4, 4]))).toBe('Attack!');
		// once the calls are in, the attack is already on its way: Space only skips its animation
		expect(nextAction(run(3, line, [4, 4]))).toBe('Skip');
		expect(nextAction(run(4, line, [4, 4, 2, 4, 6]))).toBe('Next rally');
	});

	it('asks you to choose when it’s your team’s attack', () => {
		const atCalls = run(2, line, [4, 4]);
		expect(needsShot(atCalls, 'A')).toBe(true);
		expect(nextAction(atCalls, 'A')).toBe('Choose your shot');
		expect(needsShot(atCalls, 'B')).toBe(false);
		expect(needsShot(atCalls, null)).toBe(false);
		expect(needsShot(run(1, line, [4]), 'A')).toBe(false);
	});

	it('asks you to set your defence when the other team attacks', () => {
		const atCalls = run(2, line, [4, 4]); // A is attacking
		expect(needsDefence(atCalls, 'B')).toBe(true);
		expect(nextAction(atCalls, 'B')).toBe('Set your defence');
		expect(needsDefence(atCalls, 'A')).toBe(false);
		expect(needsDefence(atCalls, null)).toBe(false);
		expect(needsDefence(run(1, line, [4]), 'B')).toBe(false);
	});
});

describe('playsItself', () => {
	it('runs the serve, pass and set on its own, and waits at the call and at the end of a point', () => {
		const start = newGame(1, NUMBERED);
		expect(playsItself(start)).toBe(true); // serve
		expect(playsItself(run(0, line, []))).toBe(true); // pass
		expect(playsItself(run(1, line, [4]))).toBe(true); // set
		expect(playsItself(run(2, line, [4, 4]))).toBe(false); // the call
		expect(playsItself(run(4, line, [4, 4, 2, 4, 6]))).toBe(false); // point over
		// the set after a dig or a block touch plays itself too
		expect(playsItself(run(4, tip('short'), [6, 4, 3, 4, 5]))).toBe(true);
		expect(playsItself(run(4, line, [4, 4, 4, 4, 5]))).toBe(true);
	});
});

describe('playerActions', () => {
	it('has the hitter spike and the blocker jump, with only the block named when it stuffs the spike', () => {
		// block 13 vs 10 → stuff: "block!" is the moment, so the hitter's spike goes unlabelled
		expect(playerActions(run(4, line, [4, 4, 2, 4, 6]))).toEqual({
			'A-blocker': { move: 'spike', label: '' },
			'B-blocker': { move: 'block', label: 'block!' }
		});
		// block 4 + 5 + 3 = 12 vs 12 → touch: the spike still gets its label
		expect(playerActions(run(4, line, [4, 4, 4, 4, 5]))['A-blocker']).toEqual({ move: 'spike', label: 'spike!' });
	});

	it('has a short defender dive for a tip', () => {
		expect(playerActions(run(4, tip('short'), [6, 4, 3, 4, 5]))).toEqual({
			'A-blocker': { move: 'tip', label: 'tip!' },
			'B-defender': { move: 'dive', label: 'dive!' }
		});
	});

	it('has a defender on the spot dig without diving', () => {
		expect(playerActions(run(4, crossPastBlock('deep'), [4, 4, 2, 4, 6]))).toEqual({
			'A-blocker': { move: 'spike', label: 'spike!' },
			'B-defender': { move: 'dig', label: 'dig!' }
		});
	});

	it('plays a beaten block and a dig that comes too late without a label', () => {
		// block 8 vs 14 → through, dig 7 vs 14 → kill
		expect(playerActions(run(4, line, [4, 4, 6, 4, 1, 6]))).toMatchObject({
			'B-blocker': { move: 'block', label: '' },
			'B-defender': { move: 'dive', label: '' }
		});
	});

	it('calls two 1s a shank, on the hitter or, on the pass and set, the setter', () => {
		// pass 4, set 1, power 1: the hit goes into the net
		expect(playerActions(run(4, line, [4, 1, 1]))).toEqual({ 'A-blocker': { move: 'spike', label: 'shank!' } });
		// a tip shanked the same way still says shank
		expect(playerActions(run(4, tip('short'), [4, 1, 1]))).toEqual({ 'A-blocker': { move: 'tip', label: 'shank!' } });
		// pass 1, set 1: the setter (A2) can't keep it in play
		expect(playerActions(run(2, line, [1, 1]))).toEqual({ 'A-defender': { move: 'dig', label: 'shank!' } });
	});

	it('has the hitter spike on an unstoppable swing', () => {
		expect(playerActions(run(4, line, [4, 6, 6]))).toEqual({ 'A-blocker': { move: 'spike', label: 'spike!' } });
	});
});

describe('duels', () => {
	it('shows attack against block for a stuff', () => {
		expect(duels(run(4, line, [4, 4, 2, 4, 6]))).toEqual([
			{ attacker: 'A1 attack', attack: 10, attackTeam: 'A', defender: 'B1 block', defence: 13, defenceTeam: 'B', verdict: 'Block', attackWins: false }
		]);
	});

	it('shows attack against block, then against the dig, when the ball gets through', () => {
		expect(duels(run(4, line, [4, 4, 6, 4, 1, 6])).map((d) => [d.defender, d.attack, d.defence, d.verdict])).toEqual([
			['B1 block', 14, 8, 'Through'],
			['B2 dig', 14, 7, 'Kill']
		]);
	});

	it('shows a tip against the dig', () => {
		expect(duels(run(4, tip('short'), [6, 4, 3, 4, 5]))).toMatchObject([
			{ attacker: 'A1 tip', attack: 9, defender: 'B2 dig', defence: 12, verdict: 'Dig', attackWins: false }
		]);
	});

	it('is empty when nobody hit', () => {
		expect(duels(run(2, line, [4, 4]))).toEqual([]);
	});
});

describe('playSummary', () => {
	it('says whether the hit went into, around or over the block', () => {
		expect(playSummary(run(4, line, [4, 4, 2, 4, 6]))).toBe('A1 down the line, into the block · B1 blocks line · B2 deep');
		expect(playSummary(run(4, crossPastBlock('deep'), [4, 4, 2, 4, 6]))).toBe(
			'A1 cross-court, around the block · B1 blocks line · B2 deep'
		);
		expect(playSummary(run(4, tip('short'), [6, 4, 3, 4, 5]))).toBe('A1 tips over the block · B1 blocks line · B2 short');
	});

	it('is empty before the calls', () => {
		expect(playSummary(run(2, line, [4, 4]))).toBeNull();
	});
});

describe('errors on a tip', () => {
	it('says the tip went into the net and labels it a shank', () => {
		// pass 4, set 1, power die 1: a shank on the tip
		const g = run(4, tip('short'), [4, 1, 1]);
		expect(stepEntries(g).map(narrate)[0]).toBe('A1 tips it into the net');
		expect(playerActions(g)).toEqual({ 'A-blocker': { move: 'tip', label: 'shank!' } });
	});
});

describe('statusLine', () => {
	it('tells you when the call is yours', () => {
		const atCalls = run(2, line, [4, 4]); // A is attacking
		const hitter = atCalls.teams.A[atCalls.attack!.hitter].name;
		expect(statusLine(atCalls, 'A')).toBe(`Your attack · ${hitter} is hitting`);
		expect(statusLine(atCalls, 'B')).toBe(`Your defence · ${hitter} is about to attack`);
	});

	it('otherwise says what just happened', () => {
		const g = run(1, line, [4]);
		expect(statusLine(g, null)).toBe(narrate(g.log[g.log.length - 1]));
	});
});
