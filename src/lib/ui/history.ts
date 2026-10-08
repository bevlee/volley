import { firstTouch } from '../engine/rules';
import type { Game, Shot, TeamId } from '../engine/types';
import { setGrade, touchGrade } from './grades';

/**
 * The rally so far, one entry per touch, for the bar above the scoreline. It runs up to the set
 * of the attack the scoreline is showing: that attack, its block and its dig are in the scoreline,
 * and join the history once the next set is played.
 */

export interface Touch {
	/** What happened, e.g. "Pass" or "Line". */
	label: string;
	team: TeamId;
	who: string;
	/** How it went, e.g. "Poor −2" or "Touch 12". */
	result: string;
	/** Part of the attack being played now: its first touch (pass, dig or block touch) and its set. */
	current: boolean;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
const SHOT: Record<Shot, string> = { line: 'Line', cross: 'Cross', tip: 'Tip' };
const BLOCK: Record<string, string> = { stuff: 'Stuff', touch: 'Touch', clean: 'Beaten' };

export function rallyHistory(g: Game): Touch[] {
	const touches: (Touch & { tag: string })[] = [];
	for (const e of g.log) {
		if (e.rally !== g.rally || !e.data) continue;
		const d = e.data;
		const at = { tag: e.tag!, team: d.team as TeamId, who: String(d.player), current: false };
		const mod = Number(d.mod);
		switch (e.tag) {
			case 'pass':
				touches.push({ ...at, label: 'Pass', result: `${touchGrade(mod)} ${signed(mod)}` });
				break;
			case 'set':
				touches.push({ ...at, label: 'Set', result: `${setGrade(mod)} ${signed(mod)}` });
				break;
			case 'swing':
				touches.push({ ...at, label: SHOT[d.shot as Shot], result: Number(d.die) === 6 ? 'Perfect' : 'Error' });
				break;
			case 'hit':
				touches.push({ ...at, label: SHOT[d.shot as Shot], result: `${d.attack}` });
				break;
			case 'accuracy': {
				const hit = touches.at(-1)!;
				if (d.result === 'easy') hit.result += ' · easy ball';
				if (d.result === 'block') hit.result += ' · into block';
				break;
			}
			case 'block':
				touches.push({ ...at, label: 'Block', result: `${BLOCK[String(d.result)]} ${d.total}` });
				break;
			case 'dig': {
				const first = firstTouch(Number(d.die));
				touches.push({ ...at, label: 'Dig', result: d.up ? `${touchGrade(first)} ${signed(first)}` : 'Kill' });
				break;
			}
		}
	}

	// Cut after the latest set (or the pass, before there's a set): later touches are in the scoreline.
	const end = touches.findLastIndex((t) => t.tag === 'set' || t.tag === 'pass');
	if (end < 0) return [];
	const shown = touches.slice(0, end + 1);
	// The attack being played now starts at its first touch, the one before its set.
	const start = shown[end].tag === 'set' && end > 0 ? end - 1 : end;
	for (let i = start; i <= end; i++) shown[i].current = true;
	return shown.map(({ tag: _, ...t }) => t);
}
