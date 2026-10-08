import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getStore, memoryStore, migrate, MIGRATIONS, newGameId, postgresStore, type GameStore, type NewGame } from './store';

const game = (over: Partial<NewGame> = {}): NewGame => ({
	mode: 'online',
	version: '1.0.0',
	fingerprint: 'fp1',
	record: { seed: 123456789, calls: [{ shot: 'line', block: 'cross', stance: 'deep', byComputer: { shot: false, defence: true } }] },
	players: { A: 'p1', B: 'p2' },
	score: { A: 21, B: 17 },
	winner: 'A',
	...over
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The same checks for every store. */
function storeContract(name: string, open: () => Promise<GameStore>) {
	describe(name, () => {
		let store: GameStore;
		beforeAll(async () => (store = await open()));
		afterAll(() => store.close());

		it('saves and gets a game back', async () => {
			const g = game();
			const id = await store.save(g);
			expect(id).toMatch(/^[A-Za-z0-9]{10}$/);
			expect(await store.get(id, 'fp1')).toMatchObject({ ...g, id });
		});

		it("doesn't return a game saved under other rules", async () => {
			const id = await store.save(game({ fingerprint: 'old' }));
			expect(await store.get(id, 'fp1')).toBeNull();
			expect(await store.get('nope', 'fp1')).toBeNull();
		});

		it("lists a player's games newest first, from either seat, a page at a time", async () => {
			const ids = [];
			for (const [A, B] of [['me', 'x'], ['y', 'me'], ['me', null], ['z', 'w']] as const) {
				ids.push(await store.save(game({ players: { A, B } })));
				await sleep(5);
			}
			const mine = await store.byPlayer('me', 'fp1', 10);
			expect(mine.map((g) => g.id)).toEqual([ids[2], ids[1], ids[0]]);
			const page = await store.byPlayer('me', 'fp1', 2);
			expect(page).toHaveLength(2);
			expect((await store.byPlayer('me', 'fp1', 2, page[1].createdAt)).map((g) => g.id)).toEqual([ids[0]]);
			expect(await store.byPlayer('me', 'other', 10)).toEqual([]);
		});

		it('deletes games saved under other rules', async () => {
			const keep = await store.save(game({ fingerprint: 'new' }));
			await store.save(game({ fingerprint: 'stale' }));
			expect(await store.deleteOthers('new')).toBeGreaterThanOrEqual(1);
			expect(await store.get(keep, 'new')).not.toBeNull();
			expect(await store.byPlayer('p1', 'fp1', 10)).toEqual([]);
		});
	});
}

storeContract('memory store', async () => memoryStore());

/** Runs against a real database when TEST_PGHOST (and TEST_PGPORT, TEST_PGDATABASE, TEST_PGUSER) are set. */
const pg = process.env.TEST_PGHOST
	? () =>
			postgres({
				host: process.env.TEST_PGHOST,
				port: Number(process.env.TEST_PGPORT ?? 5432),
				database: process.env.TEST_PGDATABASE,
				username: process.env.TEST_PGUSER,
				password: process.env.TEST_PGPASSWORD,
				max: 2,
				onnotice: () => {}
			})
	: null;

if (pg) {
	storeContract('postgres store', async () => {
		const sql = pg();
		await sql`drop table if exists games, migrations`;
		await migrate(sql);
		return postgresStore(sql);
	});

	describe('migrations', () => {
		it('apply once, and two at once take turns', async () => {
			const sql = pg();
			await sql`drop table if exists games, migrations`;
			const other = pg();
			await Promise.all([migrate(sql), migrate(other)]);
			await migrate(sql);
			const rows = await sql`select n from migrations order by n`;
			expect(rows.map((r) => r.n)).toEqual(MIGRATIONS.map((_, i) => i + 1));
			await Promise.all([sql.end(), other.end()]);
		});
	});
}

describe('getStore', () => {
	it("won't use the production database outside production", async () => {
		const g = globalThis as Record<symbol, unknown>;
		const key = Symbol.for('volley.store');
		const saved = g[key];
		delete g[key];
		try {
			await expect(getStore('fp', { PGHOST: 'db', PGDATABASE: 'volley', NODE_ENV: 'development' })).rejects.toThrow(
				/production database/
			);
		} finally {
			g[key] = saved;
		}
	});

	it('makes ids that differ', () => {
		expect(new Set(Array.from({ length: 1000 }, newGameId)).size).toBe(1000);
	});
});
