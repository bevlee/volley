import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { FINGERPRINT, VERSION } from './build';
import {
	act,
	connect,
	createRoom,
	disconnect,
	expired,
	isEmpty,
	join,
	leave,
	newCode,
	newSeed,
	saved,
	snapshot,
	teamOf,
	tick,
	type FromClient,
	type Outcome,
	type Room,
	type Send
} from './room';
import type { GameStore } from './store';
import { isPlayerId } from './uploads';
import { normaliseCode } from '../online/codes';
import { cleanName } from '../online/names';

/**
 * Connects rooms to Socket.IO. Each browser connects with `auth: { playerId }` and joins a Socket.IO
 * room named after that id, so every tab a player has open gets their messages, and seats survive
 * reconnecting and teams swapping at a rematch. All game rules are in `room.ts`.
 */

export interface SocketOptions {
	store: () => Promise<GameStore>;
	now?: () => number;
	/** How often to close expired rooms. */
	sweepMs?: number;
}

type Ack = (reply: { code: string; team: string } | { error: string }) => void;

const ACTIONS = ['serve', 'shot', 'defence', 'rematch', 'rename'] as const;
const NO_NAME = 'Pick a name';

export function attachSockets(http: HttpServer, { store, now = Date.now, sweepMs = 60_000 }: SocketOptions) {
	const io = new Server(http, { serveClient: false });
	const rooms = new Map<string, Room>();
	/** Which room each player has a seat in. */
	const seatOf = new Map<string, string>();
	/** How many sockets each player has open; they're away when it drops to 0. */
	const sockets = new Map<string, number>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	const channel = (playerId: string) => `player:${playerId}`;

	function deliver(room: Room, sends: Send[]) {
		for (const { to, msg } of sends) {
			const seat = room.seats[to];
			if (seat) io.to(channel(seat.playerId)).emit(msg.event, msg);
		}
	}

	/** One timer per room, for its clock's deadline. */
	function schedule(room: Room) {
		clearTimeout(timers.get(room.code));
		timers.delete(room.code);
		const c = room.clock;
		if (!c || c.pausedLeft !== undefined || !rooms.has(room.code)) return;
		timers.set(
			room.code,
			setTimeout(() => rooms.has(room.code) && apply(room, tick(room, now())), Math.max(0, c.deadline - now()))
		);
	}

	function apply(room: Room, outcome: Outcome) {
		deliver(room, outcome.send);
		schedule(room);
		const s = outcome.save;
		if (!s) return;
		store()
			.then((st) =>
				st.save({ mode: 'online', version: VERSION, fingerprint: FINGERPRINT, record: s.record, players: s.players, names: s.names, score: s.score, winner: s.winner })
			)
			.then((id) => rooms.has(room.code) && deliver(room, saved(room, id)))
			.catch((e) => console.error(`Couldn't save the game in room ${room.code}`, e));
	}

	function close(room: Room) {
		clearTimeout(timers.get(room.code));
		timers.delete(room.code);
		rooms.delete(room.code);
		for (const seat of [room.seats.A, room.seats.B])
			if (seat && seatOf.get(seat.playerId) === room.code) seatOf.delete(seat.playerId);
	}

	const seated = (playerId: string) => {
		const room = rooms.get(seatOf.get(playerId) ?? '');
		const team = room && teamOf(room, playerId);
		return room && team ? { room, team } : null;
	};

	/** Gives up the player's seat, if they have one: they're making or joining another room. */
	function leaveSeat(playerId: string) {
		const s = seated(playerId);
		seatOf.delete(playerId);
		if (!s) return;
		deliver(s.room, leave(s.room, s.team, now()));
		if (isEmpty(s.room)) close(s.room);
		else schedule(s.room);
	}

	io.use((socket, next) => {
		const playerId = socket.handshake.auth?.playerId;
		if (!isPlayerId(playerId)) return next(new Error('Bad playerId'));
		socket.data.playerId = playerId;
		next();
	});

	io.on('connection', (socket: Socket) => {
		const playerId: string = socket.data.playerId;
		socket.join(channel(playerId));
		sockets.set(playerId, (sockets.get(playerId) ?? 0) + 1);
		const s = seated(playerId);
		// First, so the page knows whether to show the menu or wait for its game's snapshot.
		socket.emit('welcome', { seated: !!s });
		if (s) {
			deliver(s.room, connect(s.room, s.team, now()));
			schedule(s.room);
		}

		socket.on('create', (rawName: unknown, ack: unknown) => {
			if (typeof ack !== 'function') return;
			const name = cleanName(rawName);
			if (!name) return (ack as Ack)({ error: NO_NAME });
			leaveSeat(playerId);
			const code = newCode((c) => rooms.has(c));
			const room = createRoom(code, playerId, name, newSeed(), now());
			rooms.set(code, room);
			seatOf.set(playerId, code);
			(ack as Ack)({ code, team: 'A' });
			deliver(room, [snapshot(room, 'A', now())]);
		});

		socket.on('join', (rawCode: unknown, rawName: unknown, ack: unknown) => {
			if (typeof ack !== 'function' || typeof rawCode !== 'string') return;
			const name = cleanName(rawName);
			if (!name) return (ack as Ack)({ error: NO_NAME });
			const code = normaliseCode(rawCode);
			const room = rooms.get(code);
			if (!room) return (ack as Ack)({ error: 'No game with that code' });
			if (seatOf.get(playerId) !== code) leaveSeat(playerId);
			const result = join(room, playerId, name, now());
			if ('error' in result) return (ack as Ack)(result);
			seatOf.set(playerId, code);
			(ack as Ack)({ code, team: result.team });
			deliver(room, result.send);
			schedule(room);
		});

		socket.on('leave', () => leaveSeat(playerId));

		for (const type of ACTIONS) {
			socket.on(type, (payload: unknown) => {
				const s = seated(playerId);
				if (!s) return;
				const fields = typeof payload === 'object' && payload !== null ? payload : {};
				apply(s.room, act(s.room, s.team, { ...fields, type } as FromClient, now()));
			});
		}

		socket.on('disconnect', () => {
			const left = (sockets.get(playerId) ?? 1) - 1;
			if (left > 0) return sockets.set(playerId, left);
			sockets.delete(playerId);
			const s = seated(playerId);
			if (!s) return;
			deliver(s.room, disconnect(s.room, s.team, now()));
			schedule(s.room);
		});
	});

	const sweep = setInterval(() => {
		for (const room of rooms.values()) if (expired(room, now())) close(room);
	}, sweepMs);
	sweep.unref();

	return {
		io,
		rooms,
		async close() {
			clearInterval(sweep);
			for (const t of timers.values()) clearTimeout(t);
			await io.close();
		}
	};
}
