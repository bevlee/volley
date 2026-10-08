import type { TeamId } from '#lib/engine/types.ts';
import type { StoredGame } from '#lib/server/store.ts';

/** A saved game as the API shows it. Never includes anyone's playerId: that's the key to their history. */
export function summary(g: StoredGame, viewer: string | null) {
	const you: TeamId | null = viewer && g.players.A === viewer ? 'A' : viewer && g.players.B === viewer ? 'B' : null;
	return {
		id: g.id,
		mode: g.mode,
		version: g.version,
		playedAt: g.createdAt.toISOString(),
		score: g.score,
		winner: g.winner,
		/** The team the viewer played, if they're in this game. */
		you,
		/** Each team's player's name; null for the computer. */
		names: g.names,
		/** Whether each team was played by a person or the computer. */
		sides: { A: g.players.A ? 'player' : 'computer', B: g.players.B ? 'player' : 'computer' } as const
	};
}
