import { newGame, playGame } from '../src/lib/engine/rally';
import type { LogEntry } from '../src/lib/engine/types';

const games = Number(process.argv[2] ?? 1000);
const entries: LogEntry[] = [];
let rallies = 0;
let margin = 0;

for (let seed = 1; seed <= games; seed++) {
	const g = playGame(newGame(seed));
	entries.push(...g.log);
	rallies += g.rally;
	margin += Math.abs(g.score.A - g.score.B);
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '–');
const tagged = (tag: string) => entries.filter((e) => e.tag === tag);
const share = (tag: string, key: string) => {
	const list = tagged(tag);
	const counts = new Map<string, number>();
	for (const e of list) counts.set(String(e.data?.[key]), (counts.get(String(e.data?.[key])) ?? 0) + 1);
	return Object.fromEntries([...counts].map(([k, n]) => [k, pct(n, list.length)]));
};

console.log(`${games} games · ${(rallies / games).toFixed(1)} rallies per game · average margin ${(margin / games).toFixed(1)}`);
console.log(`${(tagged('calls').length / rallies).toFixed(2)} attacks per rally`);
console.log('\nHow points end');
console.table(share('point', 'kind'));
console.log('Accuracy');
console.table(share('accuracy', 'result'));
console.log('Block (hard shots into the blocked channel)');
console.table(share('block', 'result'));

console.log('Dig: share of balls kept up');
const digs = tagged('dig');
const rows: Record<string, { digs: number; up: string }> = {};
for (const shot of ['hard', 'tip']) {
	for (const read of [true, false]) {
		const list = digs.filter((e) => (e.data?.shot === 'tip') === (shot === 'tip') && e.data?.read === read);
		rows[`${shot}, ${read ? 'read' : 'misread'}`] = {
			digs: list.length,
			up: pct(list.filter((e) => e.data?.up).length, list.length)
		};
	}
}
console.table(rows);
