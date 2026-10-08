<script lang="ts">
	import type { Game } from '#lib/engine/types.ts';
	import { buildUp } from './buildUp';

	/**
	 * How the attack was built, under the controls: its first touch (a pass, dig or block touch), then
	 * its set, with how each went. Touches still to come show as blanks so the row keeps its shape.
	 */
	let { game }: { game: Game } = $props();

	const touches = $derived(buildUp(game));
	/** Before anything, both slots are blank (a rally opens with a pass); after the first touch, the set. */
	const blanks = $derived(!touches.length ? ['Pass quality', 'Set quality'] : touches.length === 1 ? ['Set quality'] : []);
</script>

{#snippet sep()}
	<svg class="sep" viewBox="0 0 8 16" width="8" height="16" aria-hidden="true"><path d="M1 2l6 6l-6 6" /></svg>
{/snippet}

<nav class="history" aria-label="How this attack was built">
	{#each touches as t, i (i)}
		{#if i > 0}{@render sep()}{/if}
		<span class="touch {t.team}">
			<span class="label">{t.label} <span class="who">{t.who}</span></span>
			<span class="result">{t.result}</span>
		</span>
	{/each}
	{#each blanks as label, i (label)}
		{#if touches.length || i > 0}{@render sep()}{/if}
		<span class="touch blank">
			<span class="label">{label}</span>
			<span class="result">–</span>
		</span>
	{/each}
</nav>

<style>
	.A {
		--team: var(--team-a);
	}
	.B {
		--team: var(--team-b);
	}
	/* Sized like the scoreline under it: each touch takes an equal share of the width. */
	.history {
		display: flex;
		align-items: stretch;
		min-height: 52px;
		margin-top: 8px;
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.touch {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 4px 10px;
		box-shadow: inset 0 3px 0 var(--team);
		line-height: 1.2;
		white-space: nowrap;
	}
	.touch.blank {
		box-shadow: inset 0 3px 0 var(--border);
		color: var(--muted);
	}
	.blank .label {
		color: var(--muted);
	}
	.label {
		font-size: 0.66rem;
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
		font-size: 0.95rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.sep {
		flex: 0 0 auto;
		align-self: center;
		fill: none;
		stroke: var(--muted);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
