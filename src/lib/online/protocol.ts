import type { Channel, Game, Shot, Stance, TeamId } from '../engine/types';

/** The messages between the browser and the server in an online game. */

export type Action = 'serve' | 'call';

export type Presence = 'waiting' | 'connected' | 'away';

/** Each team's player's name; null for an empty seat. */
export type Names = Record<TeamId, string | null>;

/**
 * A clock as sent: `msLeft` counts from when the message is received (the two machines' clocks
 * needn't agree). It's the receiver's own time while they owe the action, else the other side's.
 */
export interface ClockView {
	action: Action;
	teams: TeamId[];
	msLeft: number;
	paused: boolean;
}

export type ToClient =
	| { event: 'states'; chain: Game[] }
	| {
			event: 'snapshot';
			code: string;
			team: TeamId;
			game: Game;
			locked: TeamId[];
			clock: ClockView | null;
			opponent: Presence;
			names: Names;
			savedId: string | null;
	  }
	| { event: 'presence'; opponent: Presence }
	| { event: 'names'; names: Names }
	| { event: 'locked'; team: TeamId }
	| { event: 'clock'; clock: ClockView | null }
	| { event: 'timedOut'; team: TeamId; action: Action }
	| { event: 'rematchAsked'; team: TeamId }
	| { event: 'saved'; id: string };

/** What a player sends. `at` is the step count of the state they're acting on, so a late action can't land on a later turn. */
export type FromClient =
	| { type: 'serve'; at: number }
	| { type: 'shot'; at: number; shot: Shot }
	| { type: 'defence'; at: number; block: Channel; stance: Stance }
	| { type: 'rematch' }
	/** The screen has played out everything up to step `at`: the player's time can start. */
	| { type: 'ready'; at: number };

