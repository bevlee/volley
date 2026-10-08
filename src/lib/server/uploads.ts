import type { GameRecord, RecordedCall } from '../engine/replay';
import type { TeamId } from '../engine/types';

/**
 * Checking what browsers send to the API: the shape of an uploaded game against the computer, the
 * player ids, and a per-address rate limit. Uploads are open to anyone, so nothing here trusts them.
 */

/** The browser keeps a random UUID; this also allows any similar random id. */
export const isPlayerId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);

export const isTeam = (v: unknown): v is TeamId => v === 'A' || v === 'B';

/** Far more calls than any game has; stops an upload from making the server replay something huge. */
const MAX_CALLS = 2000;
/** Bodies over this size are refused unread. A full game is a few KB. */
export const MAX_UPLOAD_BYTES = 64 * 1024;

export interface Upload {
	record: GameRecord;
	fingerprint: string;
	playerId: string;
	/** The team the player played. The other side is the computer. */
	team: TeamId;
}

const oneOf = <T extends string>(v: unknown, values: readonly T[]): v is T => values.includes(v as T);

function isCall(c: unknown): c is RecordedCall {
	if (typeof c !== 'object' || c === null) return false;
	const { shot, block, stance, byComputer: by } = c as Record<string, unknown>;
	return (
		oneOf(shot, ['line', 'cross', 'tip']) &&
		oneOf(block, ['line', 'cross']) &&
		oneOf(stance, ['deep', 'short']) &&
		typeof by === 'object' &&
		by !== null &&
		typeof (by as Record<string, unknown>).shot === 'boolean' &&
		typeof (by as Record<string, unknown>).defence === 'boolean'
	);
}

/** An upload in the right shape, or why not. It still has to replay before it's saved. */
export function parseUpload(body: unknown): Upload | string {
	if (typeof body !== 'object' || body === null) return 'Expected a JSON object';
	const { seed, calls, fingerprint, playerId, team } = body as Record<string, unknown>;
	if (!Number.isSafeInteger(seed) || (seed as number) < 0 || (seed as number) >= 2 ** 32) return 'Bad seed';
	if (!Array.isArray(calls) || calls.length > MAX_CALLS || !calls.every(isCall)) return 'Bad calls';
	if (typeof fingerprint !== 'string' || fingerprint.length > 32) return 'Bad fingerprint';
	if (!isPlayerId(playerId)) return 'Bad playerId';
	if (!isTeam(team)) return 'Bad team';
	const clean = calls.map(({ shot, block, stance, byComputer }) => ({
		shot,
		block,
		stance,
		byComputer: { shot: byComputer.shot, defence: byComputer.defence }
	}));
	return { record: { seed: seed as number, calls: clean }, fingerprint, playerId, team };
}

/**
 * A fixed-window limit per address: `limit` requests a `windowMs`. Behind a proxy, the address is
 * only the client's if adapter-node is told which header carries it (`ADDRESS_HEADER`).
 */
export function rateLimiter(limit: number, windowMs: number) {
	const windows = new Map<string, { start: number; count: number }>();
	return (address: string, now = Date.now()): boolean => {
		const w = windows.get(address);
		if (!w || now - w.start >= windowMs) {
			if (windows.size > 10_000) windows.clear();
			windows.set(address, { start: now, count: 1 });
			return true;
		}
		return ++w.count <= limit;
	};
}
