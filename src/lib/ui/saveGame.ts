import { rulesFingerprint } from '../engine/replay';
import type { Game, TeamId } from '../engine/types';
import { playerId, savedName } from '../online/identity';
import { recordVsComputer, type CallMakers } from './record';

/** Where a finished game's save has got to, for the line under the court at game over. */
export type SaveState = { kind: 'saving' } | { kind: 'saved'; id: string } | { kind: 'failed'; message: string };

/** Worked out on the first save (about 70 ms); the server refuses games played under other rules. */
let fingerprint: string | undefined;

/**
 * Uploads a finished game against the computer, for the player's history and its replay. The
 * server replays the record with its own engine and keeps its own result.
 */
export async function saveVsComputer(g: Game, makers: CallMakers, team: TeamId): Promise<SaveState> {
	fingerprint ??= rulesFingerprint();
	const body = { ...recordVsComputer(g, makers), fingerprint, playerId: playerId(), team, name: savedName() || null };
	try {
		const res = await fetch('/api/games', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) return { kind: 'saved', id: (await res.json()).id };
		if (res.status === 409) return { kind: 'failed', message: 'Not saved: the game has been updated. Reload to play a game that saves.' };
		if (res.status === 429) return { kind: 'failed', message: 'Not saved: too many games saved in the last minute.' };
		return { kind: 'failed', message: `Not saved: the server said ${res.status}.` };
	} catch {
		return { kind: 'failed', message: 'Not saved: couldn’t reach the server.' };
	}
}
