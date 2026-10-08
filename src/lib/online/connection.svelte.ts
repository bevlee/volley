import { io, type Socket } from 'socket.io-client';
import type { Channel, Game, Shot, Stance, TeamId } from '../engine/types';
import { cleanName } from './names';
import type { Action, ClockView, Names, Presence, ToClient } from './protocol';

/**
 * The browser's side of an online game: one Socket.IO connection, what the server has said, and
 * the player's moves. The page decides what to show; this only keeps the state.
 */

const PLAYER_KEY = 'volley.playerId';
const NAME_KEY = 'volley.name';

/**
 * This browser's player id, made on first use. It's the key to the player's seat and history, so
 * it's kept in localStorage; if that's blocked, it lasts as long as the page.
 */
export function playerId(): string {
	try {
		const saved = localStorage.getItem(PLAYER_KEY);
		if (saved) return saved;
		const id = crypto.randomUUID();
		localStorage.setItem(PLAYER_KEY, id);
		return id;
	} catch {
		return crypto.randomUUID();
	}
}

/** The name this browser last played under, or '' if it's never had one. */
function savedName(): string {
	try {
		return cleanName(localStorage.getItem(NAME_KEY) ?? '');
	} catch {
		return '';
	}
}

function saveName(name: string) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		// Blocked storage: the name lasts as long as the page.
	}
}

export type Stage = 'connecting' | 'offline' | 'menu' | 'waiting' | 'playing';

/** A clock with when it arrived, by this machine's clock: it runs out at `receivedAt + msLeft`. */
export interface Clock extends ClockView {
	receivedAt: number;
}

export interface Handlers {
	/** States to play in order. */
	chain(chain: Game[]): void;
	/** Where the game is, to show without playing anything (joining, reconnecting, a rematch). */
	snapshot(game: Game): void;
	timedOut(team: TeamId, action: Action): void;
	/** Connected; `seated` says whether the server has a game for this player already. */
	welcome(seated: boolean): void;
}

type Msg<E extends ToClient['event']> = Extract<ToClient, { event: E }>;

export class Online {
	stage = $state<Stage>('connecting');
	/** Whether the socket is up right now. Socket.IO reconnects by itself when it drops. */
	connected = $state(false);
	code = $state<string | null>(null);
	team = $state<TeamId | null>(null);
	opponent = $state<Presence>('waiting');
	/** This player's name: asked for once, then remembered in this browser. */
	name = $state(savedName());
	/** Both players' names in the current room. */
	names = $state<Names>({ A: null, B: null });
	clock = $state.raw<Clock | null>(null);
	/** The teams that have locked in their part of the current call. */
	locked = $state<TeamId[]>([]);
	/** The teams that have asked for a rematch. */
	rematch = $state<TeamId[]>([]);
	/** The latest game the server has sent. */
	latest = $state.raw<Game | null>(null);

	private socket: Socket;

	constructor(private handlers: Handlers) {
		this.socket = io({ auth: { playerId: playerId() }, transports: ['websocket', 'polling'] });
		const on = <E extends ToClient['event']>(event: E, handle: (m: Msg<E>) => void) =>
			this.socket.on(event as string, handle as (...args: unknown[]) => void);

		this.socket.on('connect', () => (this.connected = true));
		this.socket.on('disconnect', () => (this.connected = false));
		this.socket.on('connect_error', () => {
			if (this.stage === 'connecting') this.stage = 'offline';
		});
		this.socket.on('welcome', ({ seated }: { seated: boolean }) => {
			if (!seated && (this.stage === 'connecting' || this.stage === 'offline')) this.stage = 'menu';
			// Not seated any more (the room expired while we were away): back to the menu.
			if (!seated && (this.stage === 'waiting' || this.stage === 'playing')) this.reset();
			this.handlers.welcome(seated);
		});
		on('snapshot', (m) => {
			this.code = m.code;
			this.team = m.team;
			this.opponent = m.opponent;
			this.names = m.names;
			this.locked = m.locked;
			this.rematch = [];
			this.setClock(m.clock);
			this.latest = m.game;
			this.stage = m.opponent === 'waiting' && m.game.steps === 0 ? 'waiting' : 'playing';
			this.handlers.snapshot(m.game);
		});
		on('states', (m) => {
			this.locked = [];
			this.latest = m.chain.at(-1)!;
			this.handlers.chain(m.chain);
		});
		on('presence', (m) => (this.opponent = m.opponent));
		on('names', (m) => (this.names = m.names));
		on('locked', (m) => {
			if (!this.locked.includes(m.team)) this.locked.push(m.team);
		});
		on('clock', (m) => this.setClock(m.clock));
		on('timedOut', (m) => this.handlers.timedOut(m.team, m.action));
		on('rematchAsked', (m) => {
			if (!this.rematch.includes(m.team)) this.rematch.push(m.team);
		});
	}

	private setClock(clock: ClockView | null) {
		this.clock = clock && { ...clock, receivedAt: performance.now() };
	}

	private reset() {
		this.stage = 'menu';
		this.code = this.team = this.latest = this.clock = null;
		this.opponent = 'waiting';
		this.names = { A: null, B: null };
		this.locked = [];
		this.rematch = [];
	}

	private ask<T>(event: string, ...args: unknown[]): Promise<T> {
		return new Promise((resolve) => this.socket.emit(event, ...args, resolve));
	}

	/**
	 * Sets the player's name for their next room and remembers it. Returns false for a name that
	 * cleans to nothing. A room keeps the name the player joined it with.
	 */
	rename(raw: string): boolean {
		const name = cleanName(raw);
		if (!name) return false;
		this.name = name;
		saveName(name);
		return true;
	}

	/** Makes a room; the page then waits for an opponent. Needs a name first. */
	async create(): Promise<'ok' | 'noname'> {
		const reply = await this.ask<{ code: string; team: TeamId } | { error: string }>('create', this.name);
		if ('error' in reply) return 'noname';
		this.code = reply.code;
		this.team = reply.team;
		this.stage = 'waiting';
		return 'ok';
	}

	/** Joins a room by code. 'missing' is a code with no room; 'full' a room with two players. Needs a name first. */
	async join(code: string): Promise<'ok' | 'missing' | 'full' | 'noname'> {
		const reply = await this.ask<{ code: string; team: TeamId } | { error: string }>('join', code, this.name);
		if ('error' in reply) return /full/i.test(reply.error) ? 'full' : /name/i.test(reply.error) ? 'noname' : 'missing';
		this.code = reply.code;
		this.team = reply.team;
		return 'ok';
	}

	/** Gives up the seat and goes back to the menu. */
	leave() {
		this.socket.emit('leave');
		this.reset();
	}

	private act(type: string, payload: object) {
		this.socket.emit(type, payload);
	}

	serve(at: number) {
		this.act('serve', { at });
	}

	shot(at: number, shot: Shot) {
		this.act('shot', { at, shot });
		if (this.team) this.locked.push(this.team);
	}

	defence(at: number, d: { block: Channel; stance: Stance }) {
		this.act('defence', { at, ...d });
		if (this.team) this.locked.push(this.team);
	}

	askRematch() {
		this.act('rematch', {});
	}

	close() {
		this.socket.close();
	}
}
