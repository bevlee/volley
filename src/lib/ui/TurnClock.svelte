<script lang="ts">
	import type { TeamId } from '#lib/engine/types.ts';
	import type { Clock } from '#lib/online/connection.svelte.ts';

	/** How long each move gets; the bar is full at this. Matches the server's CLOCK_MS. */
	const FULL_MS = 20_000;
	const WARN_MS = 5_000;

	/**
	 * The online turn clocks, one per team that still owes a move: drains from full, red in the last
	 * few seconds. Both players see both. Shown only once the court has caught up with the game.
	 */
	let { clock, you }: { clock: Clock | null; you: TeamId | null } = $props();

	let now = $state(performance.now());
	$effect(() => {
		if (!clock || clock.paused) return;
		const id = setInterval(() => (now = performance.now()), 200);
		return () => clearInterval(id);
	});

	/**
	 * The server starts the clock once it reckons the moves have played out, and reckons long, so the
	 * court can be ready a beat early: never show more than a full clock.
	 */
	const left = $derived(
		Math.min(FULL_MS, clock ? (clock.paused ? clock.msLeft : Math.max(0, clock.receivedAt + clock.msLeft - now)) : 0)
	);
	const label = (team: TeamId) => {
		const whose = team === you ? 'Your' : 'Their';
		return `${whose} ${clock!.action === 'serve' ? 'serve' : 'call'}`;
	};
</script>

{#if clock && clock.teams.length}
	<div class="clocks" role="timer" aria-live="off">
		{#each clock.teams as team (team)}
			<div class="clock" class:warn={left <= WARN_MS} class:mine={team === you}>
				<span class="label">{label(team)}</span>
				<span class="bar"><span class="fill" style:width="{Math.min(100, (left / FULL_MS) * 100)}%"></span></span>
				<span class="secs">{clock.paused ? 'paused' : `${Math.ceil(left / 1000)}s`}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.clocks {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 6px;
	}
	.clock {
		display: grid;
		grid-template-columns: 6.5rem 1fr 3.5rem;
		align-items: center;
		gap: 8px;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.clock.mine {
		color: var(--text);
		font-weight: 600;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--border);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--muted);
		transition: width 200ms linear;
	}
	.mine .fill {
		background: var(--text);
	}
	.warn .fill {
		background: var(--covered);
	}
	.warn .secs {
		color: var(--covered);
		font-weight: 700;
	}
	.secs {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
