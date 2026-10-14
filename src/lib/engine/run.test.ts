import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedChoosers } from './choosers';
import { config } from './config';
import { step } from './rally';
import { scriptedDice } from './rng';
import { attackOptions, blockModesFor, reach } from './rules';
import { ABILITIES, choose, finishMatch, matchGame, newRun, offer, OPPONENTS, useRunRules } from './run';
import type { AbilityId, Calls, Game, Player, Team } from './types';

const saved = structuredClone({ blockModes: config.blockModes, minSet: config.minSet, specials: config.specials, serveTargets: config.serveTargets });
beforeEach(useRunRules);
afterEach(() => Object.assign(config, structuredClone(saved)));

const player = (abilities: AbilityId[] = []): Player => ({ name: 'P', slot: 'blocker', attack: 4, defense: 4, abilities });
const kit: Team = { id: 'A', blocker: player(), defender: player(), runKit: true };
const options = (team: Team, hitter: Player, setMod: number) => attackOptions(team, hitter, setMod).map((o) => `${o.tempo} ${o.shot}`);

/** Steps a run game with fixed calls and scripted dice. */
function play(g: Game, n: number, calls: Calls, dice: number[]): Game {
	const rng = scriptedDice(dice);
	for (let i = 0; i < n; i++) g = step(g, fixedChoosers(calls), rng);
	return g;
}
const entry = (g: Game, tag: string) => g.log.filter((e) => e.tag === tag).at(-1)?.data;

describe('what a run player can hit', () => {
	it('starts with high line (off ±0 or better), high cross and dig over', () => {
		expect(options(kit, player(), 0)).toEqual(['high line', 'high cross', 'high over']);
		expect(options(kit, player(), -1)).toEqual(['high cross', 'high over']);
	});

	it('adds the tip and quick sets with abilities; quick needs a ±0 set', () => {
		expect(options(kit, player(['tip', 'quick']), 0)).toEqual(['high line', 'high cross', 'high tip', 'fast line', 'fast cross', 'high over']);
		expect(options(kit, player(['quick']), -1)).toEqual(['high cross', 'high over']);
	});

	it('lets a Line specialist hit line off a set one worse', () => {
		expect(options(kit, player(['lineSpecialist']), -1)).toEqual(['high line', 'high cross', 'high over']);
	});

	it('limits an opponent to its playbook, under the same set rules', () => {
		const opponent: Team = { id: 'B', blocker: player(), defender: player(), playbook: OPPONENTS[3].playbook };
		expect(options(opponent, player(), 0)).toEqual(['high cross', 'high line', 'fast cross', 'high over']);
		expect(options(opponent, player(), -1)).toEqual(['high cross', 'high over']);
	});
});

describe('run abilities on defence', () => {
	it('leaves every block mode open, and gives a Pancake full reach a zone away', () => {
		expect(blockModesFor(player(['wall']))).toEqual(['commit', 'read', 'none']);
		expect(reach(1, player(['pancake']))).toBe(1);
		expect(reach(1, player())).toBe(0.5);
		expect(reach(2, player(['pancake']))).toBe(0.25);
	});
});

describe('a run match', () => {
	const first = () => matchGame(newRun(1));
	// Nekoma serves (a step, no dice); Hinata passes 4 (±0) and Nishinoya sets 4 (±0); then the call, then the hit.
	const build = [4, 4];

	it('pits your pair, with their abilities, against the opponent and its playbook', () => {
		const run = { ...newRun(1), abilities: { blocker: ['tip' as const], defender: [] } };
		const g = matchGame(run);
		expect(g.teams.A.blocker).toMatchObject({ name: 'Hinata', abilities: ['tip'] });
		expect(g.teams.A.runKit).toBe(true);
		expect(g.teams.B).toMatchObject({ blocker: { name: 'Kenma' }, defender: { name: 'Yaku' }, playbook: OPPONENTS[0].playbook });
	});

	it('digs a ball over deep: no block, power 3 plus the roll, full reach and a read for a deep defender', () => {
		const calls: Calls = { shot: 'over', tempo: 'high', block: 'line', stance: 'deep', blockMode: 'commit' };
		// Power 3: 3 + 3 = 6. Aim 6 + Nishinoya's 2 = 8, on target. Yaku playing deep is there:
		// 6 × 1 + dig 1 + 3 read = 10, up.
		const deep = play(first(), 5, calls, [...build, 3, 6, 1]);
		expect(deep.attack!.incoming).toBe(6);
		expect(deep.log.some((e) => e.tag === 'block')).toBe(false);
		expect(entry(deep, 'dig')).toMatchObject({ read: true, reach: 1, total: 10, up: true });
		// Playing short, Yaku has to turn and chase it: 6 × 0.25 + 1 = 2, and it drops.
		const short = play(first(), 5, { ...calls, stance: 'short' }, [...build, 3, 6, 1]);
		expect(entry(short, 'dig')).toMatchObject({ read: false, reach: 0.25, total: 2, up: false });
	});

	const highCross: Calls = { shot: 'cross', tempo: 'high', block: 'line', stance: 'deep', blockMode: 'commit' };

	it("reads a Setter's touch set roll of 4 or 5 one higher", () => {
		const touch = first();
		touch.teams.A.defender.abilities = ['settersTouch'];
		// Pass 4 (±0), set 5 reads as 6: great (+2) instead of good (±0).
		expect(play(touch, 3, highCross, [4, 5]).attack!.setMod).toBe(2);
		// Pass 5 (+1), set 4 reads as 5: 5 + 1 = 6, great.
		expect(play(touch, 3, highCross, [5, 4]).attack!.setMod).toBe(2);
		// Other rolls are untouched: a 3 is −1.
		expect(play(touch, 3, highCross, [4, 3]).attack!.setMod).toBe(-1);
	});

	it("plays a Soft block's touches up to the setter: +1 as a first touch instead of −1", () => {
		const g = first();
		g.teams.B.blocker.abilities = ['softBlock'];
		// Hinata's line (12) into Kenma's line block: 3 + 6 + 3 = 12, a touch. Nekoma's attack starts at +1.
		const lineIntoBlock: Calls = { ...highCross, shot: 'line' };
		const touched = play(g, 6, lineIntoBlock, [...build, 3, 6, 6, 4]);
		expect(touched.attack).toMatchObject({ team: 'B', source: 'touch', firstMod: 1 });
	});

	it("makes a Libero instincts dig one grade better as a first touch", () => {
		const g = first();
		g.teams.B.defender.abilities = ['liberoInstincts'];
		// Hinata's high cross goes around Kenma's line block; Yaku, deep, digs it with a 4 (normally ±0),
		// which reads as a 5: +1. Then Kenma sets (3).
		const dug = play(g, 6, highCross, [...build, 3, 6, 4, 3]);
		expect(dug.attack).toMatchObject({ team: 'B', source: 'dig', firstDie: 4, firstMod: 1 });
	});

	it("adds 1 to a Steady passer's pass roll", () => {
		const g = first();
		g.teams.A.blocker.abilities = ['steadyPasser'];
		// Pass 5 reads as 6: perfect (+2) instead of +1.
		expect(play(g, 2, highCross, [5]).attack!.firstMod).toBe(2);
	});

	it("hits a Quick hitter's quick sets harder, with no aim penalty", () => {
		const g = first();
		g.teams.A.blocker.abilities = ['quick'];
		// Power 6 + 3 + 1 quick = 10, plus (2 + 4) ÷ 2 = 13. Aim 4 + Nishinoya's 2, no penalty: 6.
		const hit = play(g, 5, { ...highCross, tempo: 'fast' }, [...build, 3, 4, 6, 6]);
		expect(hit.attack!.incoming).toBe(13);
		expect(hit.attack!.accuracy).toBe(6);
	});

	it('knocks a block touch off the hands for a point with Tool the block', () => {
		const g = first();
		g.teams.A.blocker.abilities = ['toolTheBlock'];
		const calls: Calls = { shot: 'line', tempo: 'high', block: 'line', stance: 'deep', blockMode: 'commit' };
		// Hinata: 6 + power 3 = 9, plus Nishinoya's (2 + set 4) ÷ 2 = 12. Aim 6 + 2 = 8, on target.
		// Kenma blocks 3 + 6 + 3 = 12: a touch. Tool 5: off the hands, point Karasuno.
		const tooled = play(g, 5, calls, [...build, 3, 6, 6, 5]);
		expect(entry(tooled, 'block')).toMatchObject({ result: 'touch' });
		expect(entry(tooled, 'tool')).toMatchObject({ out: true });
		expect(tooled.score).toEqual({ A: 1, B: 0 });
	});

	it('refuses an attack the hitter has no ability for', () => {
		expect(() => play(first(), 4, { shot: 'tip', tempo: 'high', block: 'line', stance: 'deep', blockMode: 'commit' }, build)).toThrow(
			"high tip isn't on off a 0 set"
		);
	});
});

describe('a run', () => {
	it('ends on a loss, is won by winning the fifth match, and offers two abilities after any other win', () => {
		const run = newRun(7);
		expect(finishMatch(run, false).status).toBe('lost');
		expect(finishMatch({ ...run, match: 4 }, true).status).toBe('won');
		const won = finishMatch(run, true);
		expect(won.status).toBe('picking');
		expect(new Set(won.offer).size).toBe(2);
	});

	it('gives each pick to its player and moves on; both can go to one player', () => {
		const run = { ...newRun(7), status: 'picking' as const, offer: ['quick', 'tip'] as AbilityId[] };
		const next = choose(run, [
			{ ability: 'quick', slot: 'blocker' },
			{ ability: 'tip', slot: 'blocker' }
		]);
		expect(next).toMatchObject({ match: 1, status: 'playing', abilities: { blocker: ['quick', 'tip'], defender: [] } });
	});

	it('refuses an ability the player already has', () => {
		const run = { ...newRun(7), status: 'picking' as const, abilities: { blocker: ['tip'] as AbilityId[], defender: [] }, offer: ['tip', 'wall'] as AbilityId[] };
		expect(() => choose(run, [{ ability: 'tip', slot: 'blocker' }])).toThrow("blocker can't take tip");
		expect(choose(run, [{ ability: 'tip', slot: 'defender' }]).abilities.defender).toEqual(['tip']);
	});

	it('only offers what someone can still take', () => {
		const all = Object.keys(ABILITIES) as AbilityId[];
		const rest = all.filter((id) => id !== 'tip' && id !== 'wall');
		const o = offer({ ...newRun(3), abilities: { blocker: all, defender: rest } });
		expect(o.sort()).toEqual(['tip', 'wall']);
	});
});
