<script lang="ts">
	import { other } from '#lib/engine/rally.ts';
	import type { TeamId } from '#lib/engine/types.ts';
	import { playerId } from '#lib/online/identity.ts';
	import Menu from '#lib/ui/Menu.svelte';

	/** This browser's saved games, newest first, each linking to its replay. */

	interface Summary {
		id: string;
		mode: 'online' | 'computer';
		playedAt: string;
		score: Record<TeamId, number>;
		winner: TeamId;
		you: TeamId | null;
		names: Record<TeamId, string | null>;
	}

	let games = $state.raw<Summary[]>([]);
	let more = $state(false);
	let loading = $state(true);
	let failed = $state(false);

	async function load(before?: string) {
		loading = true;
		failed = false;
		try {
			const query = new URLSearchParams({ player: playerId(), ...(before ? { before } : {}) });
			const res = await fetch(`/api/games?${query}`);
			if (!res.ok) throw new Error(String(res.status));
			const page: { games: Summary[]; more: boolean } = await res.json();
			games = [...games, ...page.games];
			more = page.more;
		} catch {
			failed = true;
		}
		loading = false;
	}
	load();

	const opponent = (g: Summary) => {
		const them = g.names[other(g.you ?? 'A')];
		return g.mode === 'computer' ? 'the computer' : (them ?? 'an opponent');
	};
	const result = (g: Summary) => {
		const you = g.you ?? 'A';
		return `${g.winner === you ? 'Won' : 'Lost'} ${g.score[you]}–${g.score[other(you)]}`;
	};
	const when = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
</script>

<svelte:head>
	<title>Volley · your games</title>
</svelte:head>

<Menu title="Your games" subtitle="Finished games on this browser. Tap one to watch it again." back={{ href: '/', label: 'Volley' }}>
	{#each games as g (g.id)}
		<a class="choice" href="/replay/{g.id}">
			<b>{result(g)} vs {opponent(g)}</b>
			<span>{g.mode === 'online' ? 'Online' : 'vs computer'} · {when(g.playedAt)}</span>
		</a>
	{/each}
	{#if loading}
		<p class="note">Loading…</p>
	{:else if failed}
		<p class="note">Couldn’t load your games. <button class="link" onclick={() => load(games.at(-1)?.playedAt)}>Try again</button></p>
	{:else if !games.length}
		<p class="note">No saved games yet. Finish a game and it shows up here.</p>
	{:else if more}
		<button class="choice" onclick={() => load(games.at(-1)!.playedAt)}><b>Older games</b></button>
	{/if}
</Menu>

<style>
	.note {
		color: var(--muted);
	}
	.link {
		font: inherit;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
