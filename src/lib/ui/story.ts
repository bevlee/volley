import { other } from '../engine/rally';
import type { Game, LogEntry, Shot, Slot, TeamId } from '../engine/types';

/**
 * Turns the engine's log into volleyball language: plain commentary, pop-up callouts for big
 * moments, and what each player is doing. Nothing here affects the game.
 */

type Data = NonNullable<LogEntry['data']>;

/** The log entries written by the most recent step. */
export const stepEntries = (g: Game) => g.log.slice(g.logStart);

const find = (entries: LogEntry[], tag: string): Data | undefined =>
	entries.find((e) => e.tag === tag)?.data;

export const SHOT_PHRASE: Record<Shot, string> = {
	line: 'down the line',
	cross: 'cross-court',
	tip: 'for a tip'
};

const POINT_REASON: Record<string, string> = {
	kill: 'kill',
	stuff: 'stuff block',
	'guaranteed kill': 'unstoppable spike',
	shank: 'error'
};

const quality = (mod: number, [great, good, shaky, poor]: string[]) =>
	mod >= 2 ? great : mod >= 0 ? good : mod >= -2 ? shaky : poor;

/** One plain-English line for a log entry. Falls back to the engine's own text. */
export function narrate(e: LogEntry): string {
	const d = e.data ?? {};
	switch (e.tag) {
		case 'rallyStart':
			return `${d.player} to serve`;
		case 'serve':
			return `${d.player} serves to Team ${d.receiving}`;
		case 'freeBall':
			return d.start ? `Team ${d.team} receives the ball` : `Free ball to Team ${d.team}`;
		case 'pass':
			return `${quality(Number(d.mod), ['Perfect', 'Good', 'Shaky', 'Poor'])} pass from ${d.player}`;
		case 'set':
			return `${quality(Number(d.mod), ['Perfect', 'Solid', 'Tight', 'Wild'])} set from ${d.player}`;
		case 'calls':
			return `${d.hitter} is going ${SHOT_PHRASE[d.shot as Shot]} · ${d.blocker} takes away the ${d.block} · ${d.defender} ${d.stance === 'deep' ? 'stays deep' : 'creeps in for the tip'}`;
		case 'swing':
			if (d.die === 6) return `${d.player} gets a perfect set and swings`;
			return d.shot === 'tip' ? `${d.player} tips it into the net` : `${d.player} hits it into the net`;
		case 'hit':
			return d.shot === 'tip' ? `${d.player} tips it over the block` : `${d.player} swings ${SHOT_PHRASE[d.shot as Shot]}`;
		case 'accuracy':
			if (d.result === 'exact') return 'Right where they wanted it';
			return d.result === 'drift' ? 'Slightly off target' : 'Mis-hit, an easy ball over';
		case 'block':
			if (d.result === 'stuff') return `${d.player} stuffs it!`;
			return d.result === 'touch' ? `${d.player} gets a touch on it` : `It beats ${d.player}'s block`;
		case 'dig':
			if (d.up) return d.shot === 'tip' && d.stance === 'short' ? `${d.player} dives and saves the tip` : `${d.player} digs it up`;
			return d.read ? `${d.player} gets a hand to it but can't control it` : `${d.player} can't get there`;
		case 'point':
			return `Point Team ${d.winner} · ${POINT_REASON[d.kind as string] ?? d.kind} · ${d.scoreA}–${d.scoreB}${d.gameOver ? ` · Team ${d.winner} wins the game` : ''}`;
		default:
			return e.text;
	}
}

export interface Callout {
	text: string;
	sub: string;
	/** The team the moment is good for; the callout takes their colour. */
	team: TeamId;
	/** Big moments get a bigger callout and shake the court. */
	epic: boolean;
	/** Changes every step, so the same callout twice still re-animates. */
	key: number;
}

/** The headline moment of the latest step, if it had one. */
export function callout(g: Game): Callout | null {
	const entries = stepEntries(g);
	const point = find(entries, 'point');
	const hit = find(entries, 'hit');
	const block = find(entries, 'block');
	const dig = find(entries, 'dig');
	const acc = find(entries, 'accuracy');
	const swing = find(entries, 'swing');
	const set = find(entries, 'set');
	const make = (text: string, sub: string, team: unknown, epic = false): Callout => ({
		text,
		sub,
		team: team as TeamId,
		epic,
		key: g.steps
	});

	if (point?.gameOver) {
		const [won, lost] = point.winner === 'A' ? [point.scoreA, point.scoreB] : [point.scoreB, point.scoreA];
		return make(`Team ${point.winner} wins!`, `${won}–${lost}`, point.winner, true);
	}

	if (point) {
		switch (point.kind) {
			case 'guaranteed kill':
				return make('Unstoppable!', `Perfect set, and ${swing?.player} hammers it home`, point.winner, true);
			case 'shank':
				return swing
					? make('Hitting error!', `${swing.player} ${swing.shot === 'tip' ? 'tips' : 'hits'} it into the net`, point.winner)
					: make('Set error!', `${set?.player} can't keep it in play`, point.winner);
			case 'stuff': {
				const margin = Number(block?.total) - Number(block?.attack);
				return make(margin >= 6 ? 'Roofed!' : 'Stuff block!', `${block?.player} shuts down ${hit?.player}`, point.winner, true);
			}
			case 'kill': {
				if (hit?.shot === 'tip') {
					const sub = dig?.read ? `${dig.player} dives but can't reach it` : `${hit.player} drops it in short`;
					return make('Tip kill!', sub, point.winner);
				}
				const margin = Number(dig?.attack) - Number(dig?.total);
				const sub = dig?.read ? `Too hot for ${dig.player}` : `${dig?.player} caught out of position`;
				return make(margin >= 8 ? 'Crushed!' : 'Kill!', sub, point.winner, margin >= 8);
			}
		}
	}

	if (dig?.up) {
		if (dig.shot === 'tip' && dig.stance === 'short') return make('Dive save!', `${dig.player} gets to the tip`, dig.team, true);
		if (!dig.read) return make('Scramble!', `${dig.player} somehow keeps it alive`, dig.team, true);
		if (Number(dig.attack) >= 14) return make('Huge dig!', `${dig.player} digs a monster swing`, dig.team, true);
		return make('Dig!', `${dig.player} reads it`, dig.team);
	}
	if (block?.result === 'touch') return make('Touched!', `${block.player} gets fingers to it`, block.team);
	if (acc?.result === 'easy' && hit) return make('Mis-hit!', `Easy ball over to Team ${other(hit.team as TeamId)}`, other(hit.team as TeamId));
	return null;
}

/** It's the attack call, and the attacking team is the one the player controls. */
export const needsShot = (g: Game, controlled: TeamId | null) =>
	g.phase.kind === 'calls' && controlled !== null && g.attack?.team === controlled;

/** It's the attack call, and the player's team is the one defending. */
export const needsDefence = (g: Game, controlled: TeamId | null) =>
	g.phase.kind === 'calls' && controlled !== null && g.attack !== null && g.attack.team !== controlled;

/** What the next Step will do, in volleyball terms, for the Step button. */
export function nextAction(g: Game, controlled: TeamId | null = null): string {
	if (needsShot(g, controlled)) return 'Choose your shot';
	if (needsDefence(g, controlled)) return 'Set your defence';
	switch (g.phase.kind) {
		case 'serve':
			return 'Serve';
		case 'freeBall':
			return 'Pass';
		case 'set':
		case 'dug':
			return 'Set';
		case 'calls':
			return 'Call the play';
		case 'hit':
			return 'Attack!';
		case 'pointOver':
			return 'Next rally';
		case 'gameOver':
			return 'Game over';
	}
}

export type Move = 'spike' | 'tip' | 'block' | 'dig' | 'dive';

export interface Action {
	/** Which animation the chip plays. */
	move: Move;
	/** A short word shown over the chip. */
	label: string;
}

/** What each player did in the latest step, keyed `${team}-${slot}`, for the chip animations. */
export function playerActions(g: Game): Record<string, Action> {
	const entries = stepEntries(g);
	const hit = find(entries, 'hit') ?? find(entries, 'swing');
	const block = find(entries, 'block');
	const dig = find(entries, 'dig');
	const actions: Record<string, Action> = {};
	if (hit) {
		const tipped = hit.shot === 'tip';
		actions[`${hit.team}-${hit.slot as Slot}`] = { move: tipped ? 'tip' : 'spike', label: tipped ? 'tip!' : 'spike!' };
	}
	if (block) {
		const label = block.result === 'stuff' ? 'stuff!' : block.result === 'touch' ? 'touch!' : 'beaten';
		actions[`${block.team}-blocker`] = { move: 'block', label };
	}
	if (dig) {
		const stretching = (dig.shot === 'tip' && dig.stance === 'short') || Number(dig.reach) < 1;
		const move: Move = stretching || !dig.up ? 'dive' : 'dig';
		const label = !dig.up ? 'too late' : move === 'dive' ? 'dive!' : 'dig!';
		actions[`${dig.team}-defender`] = { move, label };
	}
	return actions;
}

export interface Duel {
	attacker: string;
	attack: number;
	attackTeam: TeamId;
	defender: string;
	defence: number;
	defenceTeam: TeamId;
	verdict: string;
	attackWins: boolean;
}

/** The attack-versus-defence numbers from the latest hit: against the block, then the dig. */
export function duels(g: Game): Duel[] {
	const entries = stepEntries(g);
	const hit = find(entries, 'hit');
	if (!hit) return [];
	const attacker = `${hit.player} ${hit.shot === 'tip' ? 'tip' : 'attack'}`;
	const base = { attacker, attackTeam: hit.team as TeamId, defenceTeam: other(hit.team as TeamId) };
	const list: Duel[] = [];
	const block = find(entries, 'block');
	if (block) {
		const verdict = block.result === 'stuff' ? 'Stuffed' : block.result === 'touch' ? 'Touched' : 'Through';
		list.push({ ...base, attack: Number(block.attack), defender: `${block.player} block`, defence: Number(block.total), verdict, attackWins: block.result === 'clean' });
	}
	const dig = find(entries, 'dig');
	if (dig) {
		const verdict = dig.up ? (dig.shot === 'tip' ? 'Saved' : 'Dug up') : 'Kill';
		list.push({ ...base, attack: Number(dig.attack), defender: `${dig.player} dig`, defence: Number(dig.total), verdict, attackWins: !dig.up });
	}
	return list;
}

/** The current play in one line, e.g. "A1 cross-court, around the block · B1 blocks line · B2 deep". */
export function playSummary(g: Game): string | null {
	const a = g.attack;
	if (!a?.calls) return null;
	const { shot, block, stance } = a.calls;
	const hitter = g.teams[a.team][a.hitter].name;
	const defence = g.teams[other(a.team)];
	const attack =
		shot === 'tip'
			? `${hitter} tips over the block`
			: `${hitter} ${SHOT_PHRASE[shot]}, ${shot === block ? 'into' : 'around'} the block`;
	return `${attack} · ${defence.blocker.name} blocks ${block} · ${defence.defender.name} ${stance}`;
}
