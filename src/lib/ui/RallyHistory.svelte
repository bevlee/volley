<script lang="ts">
	import type { Game } from '#lib/engine/types.ts';
	import { rallyHistory } from './history';

	/**
	 * The build-up to the attack being played, above the phone's scoreline: its first touch (a pass,
	 * dig or block touch) and its set, with how each went. A button opens the rest of the rally, and
	 * that choice is remembered. The whole rally scrolls sideways, keeping the latest touch in view.
	 */
	let { game }: { game: Game } = $props();

	const KEY = 'volley:whole-rally';
	let whole = $state(false);
	$effect(() => {
		try {
			whole = localStorage.getItem(KEY) === '1';
		} catch {
			// Storage can be blocked; keep the default.
		}
	});
	function toggle() {
		whole = !whole;
		try {
			localStorage.setItem(KEY, whole ? '1' : '0');
		} catch {
			// Private windows can refuse storage; the choice still holds for this visit.
		}
	}

	const touches = $derived(rallyHistory(game));
	const earlier = $derived(touches.filter((t) => !t.current).length);
	const shown = $derived(whole ? touches : touches.filter((t) => t.current));
	let bar: HTMLElement;

	// Keep the latest touch in view as the rally grows, and when the screen changes size.
	const toEnd = () => (bar.scrollLeft = bar.scrollWidth);
	$effect(() => {
		if (shown.length) toEnd();
	});
	$effect(() => {
		const resized = new ResizeObserver(toEnd);
		resized.observe(bar);
		return () => resized.disconnect();
	});
</script>

<nav class="history" bind:this={bar} aria-label={whole ? 'The rally so far' : 'How this attack was built'}>
	{#if earlier}
		<button type="button" class="more" onclick={toggle} aria-expanded={whole}>
			{whole ? 'Hide earlier' : `+${earlier} earlier`}
		</button>
	{/if}
	{#each shown as t, i (i)}
		{#if i > 0}<span class="sep" aria-hidden="true">›</span>{/if}
		<span class="touch {t.team}" class:current={t.current}>
			<span class="label">{t.label} <span class="who">{t.who}</span></span>
			<span class="result">{t.result}</span>
		</span>
	{:else}
		<span class="empty">The pass and set show here</span>
	{/each}
</nav>

<style>
	.A {
		--team: var(--team-a);
	}
	.B {
		--team: var(--team-b);
	}
	.history {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 40px;
		margin-top: 8px;
		padding: 3px 6px;
		overflow-x: auto;
		scrollbar-width: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	/* Wide screens show the build-up on the score panel's attack card instead. */
	@media (min-width: 861px) {
		.history {
			display: none;
		}
	}
	.more {
		flex: 0 0 auto;
		min-height: 32px;
		margin-right: 4px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: none;
		font-size: 0.72rem;
		color: var(--muted);
		white-space: nowrap;
		cursor: pointer;
	}
	.more:focus-visible {
		outline: 2px solid var(--block);
		outline-offset: 1px;
	}
	.touch {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		padding: 2px 8px 2px 6px;
		border-left: 3px solid var(--team);
		line-height: 1.2;
		white-space: nowrap;
		opacity: 0.55;
	}
	.touch.current {
		opacity: 1;
	}
	.label {
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--team);
	}
	.who {
		font-weight: 500;
		letter-spacing: 0;
		color: var(--muted);
	}
	.result {
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.sep {
		flex: 0 0 auto;
		color: var(--muted);
	}
	.empty {
		padding: 0 6px;
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
