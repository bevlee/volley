import { config } from '../engine/config';
import { other, partner } from '../engine/rally';
import { firstTouch } from '../engine/rules';
import type { Game, RollLabel, Shot, TeamId } from '../engine/types';
import { hitGrade, penalty, setGrade, touchGrade } from './grades';
import { stepEntries } from './story';

/**
 * The numbers behind the latest attack, for the scoreline under the court: what the attack added up
 * to, and what the block and dig put against it. The scoreline shows the totals; the terms are the
 * breakdown in the score sheet, with a fuller explanation of each when "See details" is on.
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
	/** Shown for reference but not part of the sum (drawn muted), like the pass, which goes on the set roll. */
	aside?: boolean;
	/** The possible outcomes as a small table, shown with "See details" on; `on` marks the one that happened. */
	scale?: ScaleRow[];
	/** What the table's left column measures, when it isn't obvious, e.g. "Set roll + pass". */
	scaleOf?: string;
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
	/** What the total leads to, as a table under it with the outcome that happened picked out. */
	totalScale?: ScaleRow[];
	/** A caption for that table, e.g. "To stop it". */
	totalOf?: string;
	verdict?: string;
}

export interface ScoreSheet {
	shot: Shot | null;
	attack: Score;
	/** What the set adds to the hit: its score, plus the attack bonus on a hard shot. */
	setBonus: number;
	/** The attack bonus in that: half the setter's Atk plus the set roll, rounded down. Zero on a tip. */
	attackBonus: number;
	/** How the attack was built: the first touch, then the set, in grade words with any penalty. */
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

/** A number in the breakdown: a minus sign when it's negative, otherwise just the number (0 included). */
const num = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
const REACH_NOTE: Record<number, string> = { 0.5: 'one zone from where it landed', 0.25: 'two or more zones from where it landed' };

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
	const FIRST: Record<typeof a.source, string> = { free: 'pass', dig: 'dig', touch: 'block touch' };
	const firstWord = a.source === 'touch' ? 'Block touch' : `${touchGrade(a.firstMod)} ${FIRST[a.source]}`;
	/** The first touch's row label, e.g. "Pass score"; the grade is in its note and table. */
	const FIRST_SCORE: Record<typeof a.source, string> = { free: 'Pass score', dig: 'Dig score', touch: 'Block touch' };
	const firstRoll = `${FIRST[a.source][0].toUpperCase()}${FIRST[a.source].slice(1)} roll`;

	// The first touch and the set are rows at the same level, each with its roll in a note and its
	// table. The first touch doesn't add to the attack: it goes on the set roll. A block touch has no
	// roll: it's a flat penalty.
	const firstTerm: Term =
		a.source === 'touch'
			? { label: firstWord, value: num(a.firstMod), aside: true, note: 'No pass off a block touch: a flat penalty on the set roll.' }
			: {
					label: FIRST_SCORE[a.source],
					value: num(a.firstMod),
					aside: true,
					note: `${firstRoll} ${a.firstDie} (${touchGrade(a.firstMod)}). Goes on the set roll, not the attack.`,
					scaleOf: firstRoll,
					scale: [
						{ label: '6', value: 'Perfect, 2', on: a.firstDie === 6 },
						{ label: '5', value: 'Good, 1', on: a.firstDie === 5 },
						{ label: '3 or 4', value: 'Good, 0', on: a.firstDie === 3 || a.firstDie === 4 },
						{ label: '2', value: 'Shaky, −1', on: a.firstDie === 2 },
						{ label: '1', value: 'Poor, −2', on: a.firstDie === 1 }
					]
				};
	const setQuality: Term = {
		label: 'Set score',
		value: num(a.setMod),
		scaleOf: 'Set roll',
		scale: setTable(a.firstMod, a.setDie)
	};
	// Each touch is its own row: the pass (shown aside, since it goes on the set roll), the set, and
	// the attack bonus from the setter, which a tip doesn't get.
	const terms: Term[] = [
		{ label: `${hitter.name}'s Atk`, value: `${hitter.attack}` },
		{ label: 'Power roll', value: `${die('power') ?? '?'}` },
		firstTerm,
		shot === 'tip' ? { ...setQuality, note: 'Tips don’t get the attack bonus.' } : setQuality,
		...(shot === 'tip'
			? []
			: [
					{
						label: `Attack bonus: (${setter.name}'s Atk ${setter.attack} + set roll ${a.setDie}) ÷ 2`,
						value: num(share),
						tip: 'Rounded down.'
					}
				])
	];
	const attack: Score = {
		who: hitter.name,
		team: a.team,
		terms,
		total: hit ? (a.incoming ?? null) : null,
		totalNote: ''
	};

	const accuracy = data('accuracy');
	const aim =
		accuracy && a.accuracy !== undefined
			? {
					total: a.accuracy,
					result: String(accuracy.result),
					terms: [
						{ label: 'Aim roll', value: `${die('aim') ?? '?'}` },
						{ label: FIRST_SCORE[a.source], value: num(a.firstMod) },
						{ label: 'Set score', value: num(a.setMod) },
						{ label: `${setter.name}'s Atk (setter)`, value: `${setter.attack}` }
					],
					scale: [
						{ label: `${config.accuracyExact} or more`, value: 'On target', result: 'exact' },
						{ label: `${config.accuracyIntoBlock + 1} to ${config.accuracyExact - 1}`, value: 'Drifts toward the defender', result: 'drift' },
						{ label: `${config.accuracyEasy + 1} to ${config.accuracyIntoBlock}`, value: 'Straight into the block (a tip drifts instead)', result: 'block' },
						{ label: `${config.accuracyEasy} or less`, value: 'Easy ball over', result: 'easy' }
					].map(({ result, ...r }) => ({ ...r, on: result === accuracy.result }))
				}
			: null;
	// What the defence needs to stop it, by name and in plain numbers. A tip, or a shot around the
	// block, only meets the dig.
	const defending = g.teams[other(a.team)];
	if (attack.total !== null && shot) {
		const t = attack.total;
		const blockable = shot !== 'tip' && (shot === a.calls!.block || aim?.result === 'block');
		if (aim?.result === 'easy') attack.totalNote = 'Mis-hit: an easy ball over';
		else {
			attack.totalOf = 'To stop it';
			attack.totalScale = [
				...(blockable
					? [{ label: `${defending.blocker.name}'s block`, value: `${t + config.blockMargin} or more`, on: data('block')?.result === 'stuff' }]
					: []),
				{ label: `${defending.defender.name}'s dig`, value: `${t} or more`, on: Boolean(data('dig')?.up) }
			];
		}
	}
	// A kill is the attack's result, so it's named on the attack; the dig just missed.
	const killed = data('point')?.kind === 'kill';
	// Two 6s or two 1s settle the attack with no sum to compare, so say which dice did it.
	if (swing) {
		const six = Number(swing.die) === 6;
		attack.verdict = six ? 'Double six' : 'Error';
		attack.totalNote = six
			? `Automatic kill: set roll 6 and power roll 6.`
			: `Hitting error: set roll 1 and power roll 1.`;
	}
	else if (killed) attack.verdict = shot === 'tip' ? 'Tip kill' : 'Kill';
	else if (hit && attack.total !== null && shot) {
		attack.verdict = `${hitGrade(attack.total, shot, aim?.result === 'easy')} ${shot === 'tip' ? 'tip' : 'hit'}`;
	}
	// Only penalties get a number here; the breakdown has them all.
	const paren = (mod: number) => (mod < 0 ? ` (${penalty(mod).trim()})` : '');
	const setup: [string, string] = [`${firstWord}${paren(a.firstMod)}`, `${grade} set${paren(a.setMod)}`];

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
				{ label: `${b.name}'s Def`, value: `${b.defense}` },
				{ label: 'Block roll', value: `${die('block') ?? '?'}` },
				shot === a.calls?.block
					? { label: `Blocked the ${shot}`, value: `${config.blockBonus}`, tip: 'For reading the attack.' }
					: { label: 'Hit into the block', value: `${config.blockBonus}`, tip: 'The aim was so far off the shot went straight into the blocker.' }
			],
			total: Number(blocked.total),
			totalNote: '',
			totalOf: `Against the attack score of ${blocked.attack}`,
			totalScale: blockOutcomes(Number(blocked.attack), String(blocked.result)),
			verdict: verdicts[String(blocked.result)]
		};
	} else if (hit && a.calls) {
		if (accuracy?.result === 'easy') blockNote = 'Mis-hit: an easy ball over, so no block';
		else if (shot === 'tip') blockNote = 'A tip goes over the block';
		else if (shot !== a.calls.block) blockNote = `Blocking ${a.calls.block}, so the ${shot} goes around`;
	}

	const dug = data('dig');
	let dig: Score | null = null;
	if (dug) {
		const reach = Number(dug.reach);
		const d = defending.defender;
		const digTerms: Term[] = [
			{
				label: `${d.name}'s Def`,
				value: `${Math.floor(d.defense * reach)}`,
				note: REACH_NOTE[reach] && `Def ${d.defense} × ${reach}: ${REACH_NOTE[reach]}`,
				tip: reach < 1 ? 'Rounded down.' : undefined,
				scale: [
					{ label: 'Standing where it lands', value: 'Def × 1', reach: 1 },
					{ label: 'One zone away', value: 'Def × 0.5', reach: 0.5 },
					{ label: 'Two or more zones away', value: 'Def × 0.25', reach: 0.25 }
				].map(({ reach: r, ...row }) => ({ ...row, on: r === reach }))
			},
			{ label: 'Dig roll', value: `${die('dig') ?? '?'}` }
		];
		// A defender who read the call is standing on its target, and a drift comes to them, so they
		// always dig with full Def as well.
		if (dug.read && shot) {
			digTerms.push({ label: 'Read the attack', value: `${config.readBonus}`, note: `${d.name} was covering the ${shot} that was called.` });
		}
		dig = {
			who: d.name,
			team: defending.id,
			terms: digTerms,
			total: Number(dug.total),
			totalNote: '',
			totalOf: `Against the attack score of ${dug.attack}`,
			totalScale: [
				{ label: `${dug.attack} or more`, value: 'Dug up', on: Boolean(dug.up) },
				{ label: `${Number(dug.attack) - 1} or less`, value: 'Kill', on: !dug.up }
			],
			verdict: dug.up ? `${touchGrade(firstTouch(Number(dug.die)))} dig` : 'Missed'
		};
	}

	const note = a.source === 'touch' ? `Off a block touch there’s no pass, so the set and the aim take ${num(config.touchFirstMod)}` : null;

	const attackBonus = shot === 'tip' ? 0 : share;
	return { shot, attack, setBonus, attackBonus, setup, aim, block, blockNote, note, dig };
}

/** What a block total does against the attack: stuff it, touch it, or let it through the block. */
function blockOutcomes(attack: number, result: string): ScaleRow[] {
	const m = config.blockMargin;
	return [
		{ label: `${attack + m} or more`, value: 'Stuffs it', on: result === 'stuff' },
		{ label: `${attack - m + 1} to ${attack + m - 1}`, value: 'Gets a touch', on: result === 'touch' },
		{ label: `${attack - m} or less`, value: 'Goes through the block', on: result === 'clean' }
	];
}

/**
 * The set's table in set-roll numbers, for the first touch that came before it. The set is graded
 * from the set roll plus the first touch's bonus, so a poor pass needs a higher roll for the same
 * set: the bands shift by the bonus, and any the dice can't reach (1 to 6) are left out.
 */
function setTable(firstMod: number, setDie: number): ScaleRow[] {
	const BANDS: { from: number; to: number; value: string }[] = [
		{ from: 6, to: Infinity, value: 'Perfect, 2' },
		{ from: 4, to: 5, value: 'Good, 0' },
		{ from: 3, to: 3, value: 'Shaky, −1' },
		{ from: 2, to: 2, value: 'Shaky, −2' },
		{ from: -Infinity, to: 1, value: 'Poor, −3 or worse' }
	];
	const rows: ScaleRow[] = [];
	for (const band of BANDS) {
		const lo = Math.max(1, band.from - firstMod);
		const hi = Math.min(6, band.to - firstMod);
		if (lo > hi) continue;
		const label =
			lo === hi ? `${lo}` : hi === 6 ? `${lo} or more` : lo === 1 ? `${hi} or less` : hi === lo + 1 ? `${lo} or ${hi}` : `${lo} to ${hi}`;
		rows.push({ label, value: band.value, on: setDie >= lo && setDie <= hi });
	}
	return rows;
}

/**
 * Whether the latest step makes the last attack's scores stale: a new rally, a new possession
 * starting with a pass, or a point that ended before anyone attacked (two 1s on the pass and set).
 * Otherwise the scores stay up after the attack, so you can read how it went.
 */
export function clearsSheet(g: Game): boolean {
	const entries = stepEntries(g);
	const tags = new Set(entries.map((e) => e.tag));
	if (tags.has('rallyStart') || tags.has('pass')) return true;
	return tags.has('point') && !tags.has('hit') && !tags.has('swing');
}

const AIM: Record<string, string> = {
	exact: 'on target',
	drift: 'drifted toward the defender',
	block: 'straight into the block',
	easy: 'mis-hit, easy ball over'
};

/**
 * The line under the setup. Once the ball is hit it's where the aim sent it; before that, what the
 * set adds to the hit (a hard hit, if the shot isn't called yet). Tips don't get the attack bonus.
 */
export function setLine(s: ScoreSheet): string {
	if (s.aim) return `Aim ${s.aim.total} · ${AIM[s.aim.result]}`;
	const set = num(s.setBonus - s.attackBonus);
	if (s.shot === 'tip') return `Set score ${set} on the tip (no attack bonus on a tip)`;
	return `Set score ${set} + attack bonus ${num(s.attackBonus)}${s.shot ? '' : ' on a hard hit'}`;
}
