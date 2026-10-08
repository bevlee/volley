<script lang="ts">
	import type { TeamId } from '#lib/engine/types.ts';
	import type { Clock } from '#lib/online/connection.svelte.ts';

	/** How long each move gets; the bar is full at this. Matches the server's CLOCK_MS. */
	const FULL_MS = 20_000;
	const WARN_MS = 5_000;

	/**
	 * The online turn clock: one bar for the move being waited on, draining from full, red in the last
	 * few seconds. At the call both players start together on the same 20 seconds, so one bar does:
	 * it's "Your call" until you lock in, then "Sam's call" until they do.
	 */
	let { clock, you, them }: { clock: Clock | null; you: TeamId | null; them: string } = $props();

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
	const mine = $derived(!!clock && !!you && clock.teams.includes(you));
	const label = $derived(clock ? `${mine ? 'Your' : `${them}'s`} ${clock.action === 'serve' ? 'serve' : 'call'}` : '');
</script>

{#if clock && clock.teams.length}
	<div class="clock" class:warn={left <= WARN_MS} class:mine role="timer" aria-live="off">
		<span class="label">{label}</span>
		<span class="bar"><span class="fill" style:width="{(left / FULL_MS) * 100}%"></span></span>
		<span class="secs">{clock.paused ? 'paused' : `${Math.ceil(left / 1000)}s`}</span>
	</div>
{/if}

<style>
	.clock {
		display: grid;
		grid-template-columns: auto 1fr 2.6rem;
		align-items: center;
		gap: 10px;
		padding-top: 6px;
		font-size: 0.85rem;
		color: var(--muted);
		white-space: nowrap;
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
