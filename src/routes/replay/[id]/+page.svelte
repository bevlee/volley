<script lang="ts">
	import { page } from '$app/state';
	import type { GameRecord } from '#lib/engine/replay.ts';
	import type { Game, TeamId } from '#lib/engine/types.ts';
	import { playerId } from '#lib/online/identity.ts';
	import GameScreen from '#lib/ui/GameScreen.svelte';
	import Menu from '#lib/ui/Menu.svelte';
	import { paced } from '#lib/ui/pace.svelte.ts';
	import { replayer } from '#lib/ui/record.ts';

	/**
	 * Watches a saved game on the court: Space (or the step button) plays to the next serve or call,
	 * Play runs it by itself, and Next point skips to the end of the point. The viewer's own side, if
	 * they played in it, is at the bottom.
	 */

	interface Saved {
		mode: 'online' | 'computer';
		playedAt: string;
		score: Record<TeamId, number>;
		you: TeamId | null;
		names: Record<TeamId, string | null>;
		sides: Record<TeamId, 'player' | 'computer'>;
		record: GameRecord;
	}

	let saved = $state.raw<Saved | null>(null);
	let failed = $state<string | null>(null);
	let screen = $state<GameScreen>();
	let shown = $state.raw<Game>();
	let idle = $state(true);
	/** Playing by itself, a beat at a time. */
	let auto = $state(false);
	let playback = $state.raw<ReturnType<typeof replayer> | null>(null);

	$effect(() => {
		const id = page.params.id;
		saved = null;
		failed = null;
		auto = false;
		fetch(`/api/games/${encodeURIComponent(id ?? '')}?player=${encodeURIComponent(playerId())}`)
			.then(async (res) => {
				if (res.status === 404) throw new Error('This game isn’t saved any more. Games are cleared when the rules change.');
				if (!res.ok) throw new Error(`Couldn’t load the game (${res.status}).`);
				const game: Saved = await res.json();
				playback = replayer(game.record);
				saved = game;
			})
			.catch((e: Error) => (failed = e.message));
	});

	const names = $derived(
		saved && {
			A: saved.names.A ?? (saved.sides.A === 'computer' ? 'Computer' : null),
			B: saved.names.B ?? (saved.sides.B === 'computer' ? 'Computer' : null)
		}
	);
	const over = $derived(shown?.phase.kind === 'gameOver');

	/** Plays to where the live game next waited. */
	function advance() {
		const chain = playback?.next() ?? [];
		if (chain.length) screen?.playChain(chain);
		else auto = false;
	}

	/** Skips to the end of the point: the one on screen, if the chain playing out already ends it. */
	function nextPoint() {
		const latest = screen?.latest();
		const ended = latest && (latest.phase.kind === 'pointOver' || latest.phase.kind === 'gameOver');
		const end = !idle && ended ? latest : playback?.toPointEnd();
		if (end) screen?.jumpTo(end);
	}

	function again() {
		if (!saved) return;
		playback = replayer(saved.record);
		screen?.jumpTo(playback.first);
	}

	// Playing by itself: the next beat once the court has caught up, with a longer pause between points.
	$effect(() => {
		if (!auto || !idle || !shown) return;
		if (over) {
			auto = false;
			return;
		}
		const timer = setTimeout(advance, paced(shown.phase.kind === 'pointOver' ? 1500 : 600));
		return () => clearTimeout(timer);
	});

	const when = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
</script>

<svelte:head>
	<title>Volley · replay</title>
</svelte:head>

{#if saved && playback}
	<GameScreen
		bind:this={screen}
		bind:shown
		bind:idle
		initial={playback.first}
		controlled={null}
		you={saved.you}
		bottom={saved.you ?? 'A'}
		{names}
		overLabel="Watch again"
		onadvance={advance}
		onshot={() => {}}
		ondefence={() => {}}
		onover={again}
	>
		{#snippet banner()}
			<div class="replay">
				<span class="what">Replay · {saved!.mode === 'online' ? 'online' : 'vs computer'} · {when(saved!.playedAt)}</span>
				<span class="buttons">
					<button onclick={() => (auto = !auto)} disabled={over} aria-pressed={auto}>{auto ? 'Pause' : 'Play'}</button>
					<button onclick={nextPoint} disabled={over}>Next point</button>
					<a href="/history">Your games</a>
				</span>
			</div>
		{/snippet}
	</GameScreen>
{:else}
	<Menu title="Replay" back={{ href: '/history', label: 'Your games' }}>
		<p class="note">{failed ?? 'Loading…'}</p>
	</Menu>
{/if}

<style>
	.replay {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px 12px;
		margin: 4px 0 8px;
		font-size: 0.9rem;
	}
	.what {
		color: var(--muted);
	}
	.buttons {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	button {
		font: inherit;
		padding: 4px 12px;
		border: 1px solid var(--text);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	button[aria-pressed='true'] {
		background: var(--text);
		color: var(--bg);
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	a {
		color: var(--text);
		font-weight: 600;
	}
	.note {
		color: var(--muted);
	}
</style>
