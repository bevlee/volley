import postgres from 'postgres';
import type { GameRecord } from '../engine/replay';
import type { TeamId } from '../engine/types';

/**
 * Saved games: Postgres when `PGHOST` is set, otherwise kept in memory (nothing survives a restart).
 * One store per process, shared through `globalThis`: SvelteKit's routes and the socket server load
 * this module separately (the bundle and tsx in production, SSR and the Vite plugin in dev).
 */

export type Mode = 'online' | 'computer';

export interface NewGame {
	mode: Mode;
	version: string;
	fingerprint: string;
	record: GameRecord;
	/** Each team's playerId; null for the computer. */
	players: Record<TeamId, string | null>;
	score: Record<TeamId, number>;
	winner: TeamId;
}

export interface StoredGame extends NewGame {
	id: string;
	createdAt: Date;
}

export interface GameStore {
	save(game: NewGame): Promise<string>;
	/** A game saved under `fingerprint`, or null. */
	get(id: string, fingerprint: string): Promise<StoredGame | null>;
	/** A player's games under `fingerprint`, newest first; `before` pages back from a game's time. */
	byPlayer(playerId: string, fingerprint: string, limit: number, before?: Date): Promise<StoredGame[]>;
	/** Deletes every game saved under another fingerprint (the rules changed). Returns how many. */
	deleteOthers(fingerprint: string): Promise<number>;
	close(): Promise<void>;
}

/** Random, URL-safe and unguessable: 10 characters from 62 is about 60 bits. */
export function newGameId(): string {
	const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	// 256 isn't a multiple of 62, so the first few letters are very slightly likelier. It doesn't matter for an id.
	return Array.from(bytes, (b) => letters[b % letters.length]).join('');
}

const playedBy = (g: NewGame, playerId: string) => g.players.A === playerId || g.players.B === playerId;

export function memoryStore(): GameStore {
	const games = new Map<string, StoredGame>();
	return {
		async save(game) {
			const id = newGameId();
			games.set(id, structuredClone({ ...game, id, createdAt: new Date() }));
			return id;
		},
		async get(id, fingerprint) {
			const g = games.get(id);
			return g && g.fingerprint === fingerprint ? structuredClone(g) : null;
		},
		async byPlayer(playerId, fingerprint, limit, before) {
			return [...games.values()]
				.filter((g) => g.fingerprint === fingerprint && playedBy(g, playerId) && (!before || g.createdAt < before))
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
				.slice(0, limit)
				.map((g) => structuredClone(g));
		},
		async deleteOthers(fingerprint) {
			let n = 0;
			for (const [id, g] of games) if (g.fingerprint !== fingerprint && games.delete(id)) n++;
			return n;
		},
		async close() {}
	};
}

/** Schema changes, applied in order at startup. Never edit one that has shipped; add another. */
export const MIGRATIONS: string[] = [
	`create table games (
		id          text primary key,
		mode        text not null check (mode in ('online', 'computer')),
		version     text not null,
		fingerprint text not null,
		seed        bigint not null,
		calls       jsonb not null,
		player_a    text,
		player_b    text,
		score_a     int not null,
		score_b     int not null,
		winner      text not null check (winner in ('A', 'B')),
		created_at  timestamptz not null default now()
	);
	create index games_player_a on games (player_a, created_at desc);
	create index games_player_b on games (player_b, created_at desc);`
];

type Sql = postgres.Sql;

/** Applies any migrations not yet applied. Two pods starting at once (a rolling update) take turns. */
export async function migrate(sql: Sql): Promise<void> {
	await sql.begin(async (tx) => {
		await tx`select pg_advisory_xact_lock(hashtext('volley-migrations'))`;
		await tx`create table if not exists migrations (n int primary key, applied_at timestamptz not null default now())`;
		const [{ done }] = await tx<{ done: number }[]>`select coalesce(max(n), 0)::int as done from migrations`;
		for (let n = done + 1; n <= MIGRATIONS.length; n++) {
			await tx.unsafe(MIGRATIONS[n - 1]);
			await tx`insert into migrations (n) values (${n})`;
		}
	});
}

interface Row {
	id: string;
	mode: Mode;
	version: string;
	fingerprint: string;
	seed: string;
	calls: GameRecord['calls'];
	player_a: string | null;
	player_b: string | null;
	score_a: number;
	score_b: number;
	winner: TeamId;
	created_at: Date;
}

const fromRow = (r: Row): StoredGame => ({
	id: r.id,
	mode: r.mode,
	version: r.version,
	fingerprint: r.fingerprint,
	record: { seed: Number(r.seed), calls: r.calls },
	players: { A: r.player_a, B: r.player_b },
	score: { A: r.score_a, B: r.score_b },
	winner: r.winner,
	createdAt: r.created_at
});

/** Connects with the standard PGHOST, PGPORT, PGDATABASE, PGUSER and PGPASSWORD variables. */
export function postgresStore(sql: Sql = postgres({ max: 5, onnotice: () => {} })): GameStore {
	return {
		async save(g) {
			const id = newGameId();
			await sql`insert into games ${sql({
				id,
				mode: g.mode,
				version: g.version,
				fingerprint: g.fingerprint,
				seed: g.record.seed,
				calls: sql.json(g.record.calls as unknown as postgres.JSONValue),
				player_a: g.players.A,
				player_b: g.players.B,
				score_a: g.score.A,
				score_b: g.score.B,
				winner: g.winner
			})}`;
			return id;
		},
		async get(id, fingerprint) {
			const [row] = await sql<Row[]>`select * from games where id = ${id} and fingerprint = ${fingerprint}`;
			return row ? fromRow(row) : null;
		},
		async byPlayer(playerId, fingerprint, limit, before) {
			const rows = await sql<Row[]>`
				select * from games
				where fingerprint = ${fingerprint}
					and (player_a = ${playerId} or player_b = ${playerId})
					${before ? sql`and created_at < ${before}` : sql``}
				order by created_at desc
				limit ${limit}`;
			return rows.map(fromRow);
		},
		async deleteOthers(fingerprint) {
			const result = await sql`delete from games where fingerprint <> ${fingerprint}`;
			return result.count;
		},
		close: () => sql.end()
	};
}

const KEY = Symbol.for('volley.store');
type WithStore = typeof globalThis & { [KEY]?: Promise<GameStore> };

/**
 * The process's store. With Postgres, the first call runs migrations and deletes games from other
 * rules (see `rulesFingerprint`). A dev or test build must not point at the production database:
 * deleting on a rules change there would wipe production's games.
 */
export function getStore(fingerprint: string, env: Record<string, string | undefined> = process.env): Promise<GameStore> {
	const g = globalThis as WithStore;
	g[KEY] ??= (async () => {
		if (!env.PGHOST) return memoryStore();
		if (env.PGDATABASE === 'volley' && env.NODE_ENV !== 'production')
			throw new Error('Refusing to use the production database (PGDATABASE=volley) outside production');
		const sql = postgres({ max: 5, onnotice: () => {} });
		await migrate(sql);
		const store = postgresStore(sql);
		const deleted = await store.deleteOthers(fingerprint);
		if (deleted) console.log(`Deleted ${deleted} games saved under other rules`);
		return store;
	})();
	return g[KEY];
}
