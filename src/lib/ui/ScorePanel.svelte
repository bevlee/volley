<script lang="ts">
	import Breakdown, { type ScoreKind } from './Breakdown.svelte';
	import { loadFullMaths, maths, saveFullMaths } from './fullMaths.svelte.ts';
	import { setLine, type Score, type ScoreSheet } from './scores';

	let { sheet }: { sheet: ScoreSheet | null } = $props();

	$effect(loadFullMaths);
</script>

{#snippet card(title: string, kind: ScoreKind, s: Score, extra?: { setup?: string[]; set?: string })}
	<!-- Only the result shows; hovering or focusing the card reveals how it was worked out. -->
	<button type="button" class="card {s.team}" aria-label="{title} {s.who}: {s.total ?? 'not rolled yet'}{s.verdict ? `, ${s.verdict}` : ''}">
		<span class="head">
			<span class="title">{title}</span>
			<span class="who">{s.who}</span>
			{#if s.verdict}<span class="verdict">{s.verdict}</span>{/if}
			<!-- "?" means not rolled yet; "–" means there's a result but no sum (a perfect set and hit, or an error). -->
			<span class="total">{s.total ?? (s.verdict ? '–' : '?')}</span>
		</span>
		{#if extra?.setup}<span class="setup">{extra.setup.join(' → ')}</span>{/if}
		{#if extra?.set}<span class="set">{extra.set}</span>{/if}
		<span class="breakdown" role="tooltip">
			{#if sheet}<Breakdown {kind} score={s} {sheet} />{/if}
		</span>
	</button>
{/snippet}

<aside class="scores" aria-label="Attack and defence scores">
	{#if sheet}
		{@render card('Attack score', 'attack', sheet.attack, { setup: sheet.setup, set: setLine(sheet) })}
		{#if sheet.note}<p class="note touch">{sheet.note}</p>{/if}
		{#if sheet.block}
			{@render card('Block score', 'block', sheet.block)}
		{:else if sheet.blockNote}
			<p class="note">{sheet.blockNote}</p>
		{/if}
		{#if sheet.dig}{@render card('Dig score', 'dig', sheet.dig)}{/if}
	{:else}
		<p class="note">Attack and defence scores show here once a ball is set.</p>
	{/if}
	<p class="hint">
		Hover a score to see how it adds up.
		<label><input type="checkbox" bind:checked={maths.full} onchange={saveFullMaths} /> See details</label>
	</p>
</aside>

<style>
	.scores {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		text-align: left;
		font: inherit;
		color: inherit;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 4px solid var(--team);
		border-radius: 0 8px 8px 0;
		padding: 6px 10px;
		cursor: help;
	}
	.A {
		--team: var(--team-a);
	}
	.B {
		--team: var(--team-b);
	}
	.card:focus-visible {
		outline: 2px solid var(--block);
		outline-offset: 2px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		font-size: 0.8rem;
	}
	/* Sentence case, so "Attack score", the grade and the total fit on one line in the side column. */
	.title {
		font-size: 0.9rem;
		font-weight: 800;
		white-space: nowrap;
		color: var(--team);
	}
	.who {
		color: var(--muted);
	}
	.verdict {
		margin-left: auto;
		font-weight: 800;
		white-space: nowrap;
	}
	.total {
		margin-left: auto;
		font-size: 1.5rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		color: var(--team);
	}
	.verdict + .total {
		margin-left: 8px;
	}
	.setup {
		font-size: 0.8rem;
		font-weight: 700;
	}
	.set {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.breakdown {
		display: none;
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 5;
		width: 17rem;
		padding: 8px 10px;
		border-radius: 8px;
		background: var(--text);
		color: var(--bg);
		font-size: 0.82rem;
		line-height: 1.3;
		/* It only shows information; letting the mouse through means it closes as soon as you leave the card. */
		pointer-events: none;
	}
	.card:hover .breakdown,
	.card:focus-visible .breakdown {
		display: grid;
		gap: 4px;
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.note.touch {
		margin: -4px 0 0 14px;
		color: var(--covered);
	}
	.hint {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 8px;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.hint label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}
</style>
