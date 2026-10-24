import { config } from '../engine/config';
import { other, partner } from '../engine/rally';
import { CORNER, GRID, LANDING, readOutcome, tempoIn } from '../engine/rules';
import type { BlockMode, Calls, Channel, Game, ReadOutcome, Stance, TeamId, Tempo, Touch, Zone } from '../engine/types';
import { setGrade } from './grades';
import { clearsSheet } from './scores';
import { stepEntries, touchPhrase } from './story';

/**
 * Advanced mode on screen: the tempo banner over the court, what each call covers on the sand, the
 * line about the shot being picked, and the reveal after the hit. Words and tables only; the
 * components draw them.
 */

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The defence the player is setting up, or the one called. */
export interface TempoDefence {
	block: Channel;
	stance: Stance;
	blockMode: BlockMode;
}

export interface TempoBanner {
	/** Null before the set: there's no tempo yet. */
	tempo: Tempo | null;
	label: string;
	/** The set, in bold: e.g. "Perfect set +2." */
	lead: string;
	text: string;
}

const LABEL: Record<Tempo, string> = { fast: 'Quick ball', high: 'High ball' };

/**
 * The banner over the court in advanced mode: before the set, how the set decides; after it, the
 * tempo, told from the side of the player who calls (the attack when watching).
 */
export function tempoBanner(g: Game, controlled: TeamId | null): TempoBanner {
	const a = g.attack;
	const tempo = a && a.setMod !== undefined ? tempoIn(g) : undefined;
	if (!a || !tempo)
		return {
			tempo: null,
			label: 'Advanced',
			lead: 'The set decides.',
			text: `${signed(config.quickBallMinSet)} or better is a quick ball; anything worse is a high ball you place.`
		};
	const theirs = g.teams[other(a.team)];
	const hitter = g.teams[a.team][a.hitter].name;
	const setter = g.teams[a.team][partner(a.hitter)].name;
	const set = `${setGrade(a.setMod!)} set ${signed(a.setMod!)}`;
	const label = LABEL[tempo];
	if (controlled !== null && controlled !== a.team) {
		const lead = `${set} from ${setter}.`;
		return tempo === 'fast'
			? { tempo, label, lead, text: `${hitter} swings now, so call the block. ${theirs.defender.name} has no time to move.` }
			: { tempo, label, lead, text: `${hitter} has time to place it. Read the shot.` };
	}
	return tempo === 'fast'
		? { tempo, label, lead: `${set}.`, text: `Swing now. ${theirs.defender.name} has no time to move.` }
		: { tempo, label, lead: `${set}.`, text: `Time to place it, and ${theirs.blocker.name} and ${theirs.defender.name} have time to set up.` };
}

/** What the defence does to a ball landing in a zone: blocks it, reads it, scrambles for it, or leaves it open. */
export type Cover = 'blocked' | 'read' | 'close' | 'open';

export const ZONE_WORD: Record<Cover, string> = { blocked: 'blocked', read: 'dug', close: 'scramble', open: 'open' };

const FROM_READ: Record<ReadOutcome, Cover> = { read: 'read', close: 'close', wrong: 'open' };

export interface ZoneCover {
	zone: Zone;
	cover: Cover;
	/** The roll goes over the block into the zone the hard shot down it is aimed at: how the dig does there. */
	roll?: Cover;
}

const CORNERS: readonly Zone[] = [1, 2, 4, 5];

/**
 * What a defence covers in each zone a shot can land in, from the engine's tables. A quick ball goes
 * hard to the line or cross corner: the block takes one, the other is open. Against a high ball the
 * block takes the hard shot down its channel, and the defender's corner against each other zone is a
 * read, a scramble (one corner off) or open; pulling off, every ball is a scramble.
 */
export function tempoCoverage(tempo: Tempo, d: TempoDefence): ZoneCover[] {
	const blocked = LANDING[d.block].hard;
	if (tempo === 'fast')
		return [
			{ zone: blocked, cover: 'blocked' },
			{ zone: LANDING[d.block === 'line' ? 'cross' : 'line'].hard, cover: 'open' }
		];
	if (d.blockMode === 'none') return CORNERS.map((zone) => ({ zone, cover: 'close' }));
	const at = CORNER[d.block][d.stance];
	const dig = (zone: Zone) => FROM_READ[readOutcome(at, zone)];
	return CORNERS.map((zone) => (zone === blocked ? { zone, cover: 'blocked', roll: dig(zone) } : { zone, cover: dig(zone) }));
}

const TOUCH_NOTE: Record<Touch, string> = {
	hard: 'Full power, with the set counted twice. The block can stop it.',
	tip: 'Drops short over the block. Soft, so a good dig stops it.',
	roll: 'Deep over the block. Aiming it needs a good set.'
};

/** The line under the high-ball choices: the shot picked and what it does off this set. */
export function shotLine(shot: Channel, touch: Touch, setMod: number): string {
	const name = `${cap(shot)} ${touch}.`;
	if (setMod >= 0) return `${name} ${TOUCH_NOTE[touch]}`;
	if (touch === 'hard') return `${name} Weak off a ${signed(setMod)} set: it takes the set twice over.`;
	return `${name} ${TOUCH_NOTE[touch]} Hard is weak off a ${signed(setMod)} set.`;
}

/** A quick ball's line: the stakes are a guess against the block. */
export const quickLine = (blocker: string) => `A coin flip against the block only, with full power. If ${blocker} guesses wrong, it's a kill.`;

export interface RevealRow {
	kicker: string;
	text: string;
	note: string;
	/** It went the defence's way. */
	good: boolean;
}

export interface Reveal {
	team: TeamId;
	defending: TeamId;
	headline: string;
	block: RevealRow;
	dig: RevealRow | null;
	/** The attack against what met it last: the dig, or the block. */
	tally: { attack: string; against: string | null; verdict: string; defenceWins: boolean };
}

const READ_KICKER: Record<ReadOutcome, string> = { read: 'read it', close: 'one zone off', wrong: 'wrong way' };

/** How the defender's corner missed the ball's: the right side but the wrong depth, or the other way round. */
function miss(at: Zone, ball: Zone, outcome: ReadOutcome): string {
	if (outcome === 'read') return 'Right where it landed';
	if (outcome === 'wrong') return 'Wrong side and wrong depth';
	const [row, col] = GRID[at];
	const [ballRow, ballCol] = GRID[ball];
	if (col !== ballCol) return row === 1 ? 'Deep enough, wrong side' : 'Short enough, wrong side';
	return ballRow > row ? 'Right side, too short' : 'Right side, too deep';
}

/** After an advanced hit: what the block and the dig did, and the numbers that decided it. */
export function tempoReveal(g: Game): Reveal | null {
	const a = g.attack;
	const calls: Calls | undefined = a?.calls;
	const entries = stepEntries(g);
	const hit = entries.find((e) => e.tag === 'hit');
	if (!a || !calls?.touch || !hit) return null;
	const defending = other(a.team);
	const blocker = g.teams[defending].blocker;
	const quick = calls.tempo === 'fast';
	const stayDown = calls.blockMode === 'none';
	const soft = calls.touch !== 'hard';
	const block = entries.find((e) => e.tag === 'block')?.data;
	const dig = entries.find((e) => e.tag === 'dig')?.data;
	const easy = entries.some((e) => e.tag === 'accuracy' && e.data?.result === 'easy');
	const attackWord = soft ? cap(calls.touch) : 'Hit';

	const blockRow = ((): RevealRow => {
		const kicker = stayDown ? `${blocker.name} pulled off` : `Block · ${calls.block}`;
		if (stayDown) return { kicker, text: 'No block', note: `+${config.noBlockDigBonus} help on the dig`, good: true };
		if (block) {
			const RESULT = { stuff: 'Stuffed it', touch: 'Got a touch', clean: 'Beaten' } as const;
			const result = block.result as keyof typeof RESULT;
			return { kicker, text: RESULT[result], note: `${block.total} vs ${block.attack}`, good: result !== 'clean' };
		}
		if (easy) return { kicker, text: 'Mis-hit, an easy ball over', note: 'free ball', good: true };
		if (soft) return { kicker, text: `${cap(calls.touch)} goes over it`, note: 'no effect', good: false };
		return { kicker, text: `The ${calls.shot} goes around it`, note: quick ? 'kill' : 'no effect', good: false };
	})();

	let digRow: RevealRow | null = null;
	if (dig) {
		const outcome = dig.outcome as ReadOutcome;
		const bonus = config.tempoDig[outcome].bonus;
		digRow = stayDown
			? { kicker: 'Both dig', text: 'Nobody on the ball, nobody far off it', note: `Scramble dig +${bonus}, help +${config.noBlockDigBonus}`, good: Boolean(dig.up) }
			: {
					kicker: `${calls.stance} · ${READ_KICKER[outcome]}`,
					text: miss(CORNER[calls.block][calls.stance], a.landing!, outcome),
					note: outcome === 'wrong' ? 'No dig bonus' : `${outcome === 'close' ? 'Scramble' : 'Read'} dig +${bonus}`,
					good: Boolean(dig.up)
				};
	}

	const tally = dig
		? {
				attack: `${attackWord} ${dig.attack}`,
				against: `${dig.outcome === 'close' ? 'Scramble' : 'Dig'} ${dig.total}`,
				verdict: dig.up ? 'Dug' : 'Kill',
				defenceWins: Boolean(dig.up)
			}
		: block && block.result !== 'clean'
			? { attack: `${attackWord} ${block.attack}`, against: `Block ${block.total}`, verdict: block.result === 'stuff' ? 'Stuff' : 'Touch', defenceWins: true }
			: easy
				? { attack: 'Easy ball', against: null, verdict: 'Free ball', defenceWins: true }
				: { attack: `${attackWord} ${a.incoming}`, against: block ? `Block ${block.total}` : null, verdict: 'Kill', defenceWins: false };

	const headline = `${g.teams[a.team][a.hitter].name} ${touchPhrase(calls.shot as Channel, calls.touch, quick)}`;
	return { team: a.team, defending, headline, block: blockRow, dig: digRow, tally };
}

/** The reveal to show after this step: the latest hit's, kept up until a new possession or rally starts, or the next attack is called. */
export function nextReveal(shown: Reveal | null, g: Game): Reveal | null {
	const next = tempoReveal(g);
	const newCall = stepEntries(g).some((e) => e.tag === 'calls');
	return next || g.steps === 0 || clearsSheet(g) || newCall ? next : shown;
}
