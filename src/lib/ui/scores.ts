import { config } from '../engine/config';
import { other, partner } from '../engine/rally';
import { firstTouch } from '../engine/rules';
import type { Game, RollLabel, Shot, TeamId } from '../engine/types';
import { hitGrade, setGrade, touchGrade } from './grades';
import { stepEntries } from './story';

/**
 * The numbers behind the latest attack, for the score panel: what the attack added up to, and
 * what the block and dig put against it. The panel shows the totals; the terms are the breakdown
 * shown on hover, with a fuller explanation of each when "See details" is on.
 */

export interface Term {
	label: string;
	value: string;
	/** A short line under the row, always shown. */
	note?: string;
	/** The full explanation, shown only with "See details" on. */
	tip?: string;
	/** Smaller rows that add up to this one. */
	parts?: Term[];
	/** The possible outcomes as a small table, shown with "See details" on; `on` marks the one that happened. */
	scale?: ScaleRow[];
}

export interface ScaleRow {
	label: string;
	value: string;
	on: boolean;
}

export interface Score {
	who: string;
	team: TeamId;
	terms: Term[];
	/** Null until the dice are rolled. */
	total: number | null;
	/** What the total means, in a few words, if there's anything to say. */
	totalNote: string;
	verdict?: string;
}

export interface ScoreSheet {
	shot: Shot | null;
	attack: Score;
	/** What the set adds to the hit: its quality, plus the setter's share on a hard shot. */
	setBonus: number;
	/** How the attack was built: the first touch, then the set, each in grade words with its bonus. */
	setup: [string, string];
	/** Where the attack landed and the sum behind it, with the outcome table for "See details". */
	aim: { total: number; result: string; terms: Term[]; scale: ScaleRow[] } | null;
	block: Score | null;
	/** Why there was no block roll, e.g. the shot went around it. */
	blockNote: string | null;
	/** Anything unusual about how the attack was built, e.g. it came off a block touch. */
	note: string | null;
	dig: Score | null;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
const REACH: Record<number, string> = { 0.5: 'halved: a zone away', 0.25: 'quartered: out of position' };

export function scoreSheet(g: Game): ScoreSheet | null {
	const a = g.attack;
	if (!a || a.setMod === undefined || a.setDie === undefined) return null;
	const entries = stepEntries(g);
	const data = (tag: string) => entries.find((e) => e.tag === tag)?.data;
	const hit = data('hit');
	const swing = data('swing');
	const resolved = Boolean(hit || swing);
	if (!resolved && g.phase.kind !== 'calls' && g.phase.kind !== 'hit') return null;

	const die = (label: RollLabel) => (resolved ? g.rolls.find((r) => r.label === label)?.die : undefined);
	const team = g.teams[a.team];
	const hitter = team[a.hitter];
	const setter = team[partner(a.hitter)];
	const shot = a.calls?.shot ?? null;

	const share = Math.floor((setter.attack + a.setDie) / 2);
	const setBonus = a.setMod + (shot === 'tip' ? 0 : share);
	const grade = setGrade(a.setMod);
	const setQuality: Term = {
		label: 'Set quality',
		value: signed(a.setMod),
		tip: 'From the set roll plus the pass or dig.',
		scale: [
			{ label: 'Perfect', value: '+2' },
			{ label: 'Good', value: '0' },
			{ label: 'Shaky', value: '−1 or −2' },
			{ label: 'Poor', value: '−3 or worse' }
		].map((r) => ({ ...r, on: r.label === grade }))
	};
	const terms: Term[] = [
		{ label: `${hitter.name}'s base attack`, value: `${hitter.attack}` },
		{ label: 'Roll', value: `${die('power') ?? '?'}` },
		shot === 'tip'
			? { ...setQuality, label: `${grade} set`, tip: `A tip gets only the set quality, not the setter. ${setQuality.tip}` }
			: {
					label: 'Set + setter',
					value: signed(setBonus),
					parts: [
						{ ...setQuality, label: `${grade} set` },
						{
							label: `Setter: ½ (${setter.name}'s base attack ${setter.attack} + set roll ${a.setDie})`,
							value: signed(share),
							tip: 'Rounded down. A tip doesn’t get it.'
						}
					]
				}
	];
	const attack: Score = {
		who: hitter.name,
		team: a.team,
		terms,
		total: hit ? (a.incoming ?? null) : null,
		totalNote: ''
	};

	const accuracy = data('accuracy');
	const FIRST: Record<typeof a.source, string> = { free: 'pass', dig: 'dig', touch: 'block touch' };
	const firstWord = a.source === 'touch' ? 'Block touch' : `${touchGrade(a.firstMod)} ${FIRST[a.source]}`;
	const aim =
		accuracy && a.accuracy !== undefined
			? {
					total: a.accuracy,
					result: String(accuracy.result),
					terms: [
						{ label: 'Aim roll', value: `${die('aim') ?? '?'}` },
						{ label: firstWord, value: signed(a.firstMod) },
						{ label: `${grade} set`, value: signed(a.setMod) },
						{ label: `${setter.name}'s base attack`, value: `${setter.attack}` }
					],
					scale: [
						{ label: `${config.accuracyExact} or more`, value: 'On target', result: 'exact' },
						{ label: `${config.accuracyIntoBlock + 1} to ${config.accuracyExact - 1}`, value: 'Drifts a zone toward the defender', result: 'drift' },
						{ label: `${config.accuracyEasy + 1} to ${config.accuracyIntoBlock}`, value: 'Straight into the block (tips drift)', result: 'block' },
						{ label: `${config.accuracyEasy} or less`, value: 'Easy ball over', result: 'easy' }
					].map(({ result, ...r }) => ({ ...r, on: result === accuracy.result }))
				}
			: null;
	// What the defence needs to stop it, in plain numbers. A tip, or a shot around the block, only meets the dig.
	if (attack.total !== null && shot) {
		const t = attack.total;
		const blockable = shot !== 'tip' && (shot === a.calls!.block || aim?.result === 'block');
		attack.totalNote =
			aim?.result === 'easy'
				? 'Mis-hit: an easy ball over'
				: `Dig ${t}+ to keep it up${blockable ? ` · block ${t + config.blockMargin}+ to stuff it` : ''}`;
	}
	if (swing) attack.verdict = Number(swing.die) === 6 ? 'Perfect hit' : 'Error';
	else if (hit && attack.total !== null && shot) {
		attack.verdict = `${hitGrade(attack.total, shot, aim?.result === 'easy')} ${shot === 'tip' ? 'tip' : 'hit'}`;
	}
	const setup: [string, string] = [`${firstWord} (${signed(a.firstMod)})`, `${grade} set (${signed(a.setMod)})`];

	const defending = g.teams[other(a.team)];
	let block: Score | null = null;
	let blockNote: string | null = null;
	const blocked = data('block');
	if (blocked) {
		const verdicts: Record<string, string> = { stuff: 'Block', touch: 'Block touch', clean: 'Through' };
		const b = defending.blocker;
		block = {
			who: b.name,
			team: defending.id,
			terms: [
				{ label: `${b.name}'s base defence`, value: `${b.defense}` },
				{ label: 'Roll', value: `${die('block') ?? '?'}` },
				{
					label: 'In the way',
					value: `+${config.blockBonus}`,
					tip:
						shot === a.calls?.block
							? 'For blocking the channel the shot went down.'
							: 'The shot was aimed so badly it went straight into the block.'
				}
			],
			total: Number(blocked.total),
			totalNote: `${Number(blocked.attack) + config.blockMargin}+ stuffs it · ${Number(blocked.attack) - config.blockMargin + 1} to ${Number(blocked.attack) + config.blockMargin - 1} gets a touch`,
			verdict: verdicts[String(blocked.result)]
		};
	} else if (hit && a.calls) {
		if (shot === 'tip') blockNote = 'A tip goes over the block';
		else if (shot !== a.calls.block) blockNote = `Blocking ${a.calls.block}, so the ${shot} goes around`;
		else if (accuracy?.result === 'easy') blockNote = 'Easy ball over';
	}

	const dug = data('dig');
	let dig: Score | null = null;
	if (dug) {
		const reach = Number(dug.reach);
		const d = defending.defender;
		const digTerms: Term[] = [
			{
				label: `${d.name}'s base defence`,
				value: `${Math.floor(d.defense * reach)}`,
				note: REACH[reach] && `${d.defense}, ${REACH[reach]}`,
				tip: 'Rounded down.',
				scale: [
					{ label: 'In the zone it lands in', value: 'All of it', reach: 1 },
					{ label: 'One zone away', value: 'Half', reach: 0.5 },
					{ label: 'Further', value: 'A quarter', reach: 0.25 }
				].map(({ reach: r, ...row }) => ({ ...row, on: r === reach }))
			},
			{ label: 'Roll', value: `${die('dig') ?? '?'}` }
		];
		if (dug.read) {
			digTerms.push({ label: 'Covering', value: `+${config.readBonus}`, tip: 'For already standing where the shot went.' });
		}
		dig = {
			who: d.name,
			team: defending.id,
			terms: digTerms,
			total: Number(dug.total),
			totalNote: `Needed ${dug.attack} to dig it`,
			verdict: dug.up ? `${touchGrade(firstTouch(Number(dug.die)))} dig` : 'Kill'
		};
	}

	const note = a.source === 'touch' ? `Off a block touch: no pass, so ${signed(config.touchFirstMod)} on the set and the aim` : null;

	return { shot, attack, setBonus, setup, aim, block, blockNote, note, dig };
}

const AIM: Record<string, string> = {
	exact: 'on target',
	drift: 'drifted a zone',
	block: 'straight into the block',
	easy: 'mis-hit, easy ball over'
};

/**
 * The line under the setup. Once the ball is hit it's where the aim sent it; before that, what the
 * set adds to the hit (a hard hit, if the shot isn't called yet). Tips don't get the setter's share.
 */
export function setLine(s: ScoreSheet): string {
	if (s.aim) return `Aim ${s.aim.total} · ${AIM[s.aim.result]}`;
	if (s.shot === 'tip') return `Set: ${signed(s.setBonus)} to the tip`;
	return `Set + setter: ${signed(s.setBonus)} to ${s.shot ? 'the' : 'a hard'} hit`;
}
