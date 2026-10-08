<script lang="ts" module>
	export type ScoreKind = 'attack' | 'aim' | 'block' | 'dig';
</script>

<script lang="ts">
	import { maths } from './fullMaths.svelte.ts';
	import type { ScaleRow, Score, ScoreSheet, Term } from './scores';

	/**
	 * How one score adds up, in the score sheet. The aim isn't a Score: its sum comes from the sheet,
	 * so `score` is only needed for the others. Colours follow the text, so it reads in light and dark.
	 */
	let { kind, score, sheet }: { kind: ScoreKind; score?: Score; sheet: ScoreSheet } = $props();

</script>

{#snippet scale(rows: ScaleRow[], of?: string)}
	<span class="scale">
		{#if of}<span class="scale-of">{of}</span>{/if}
		{#each rows as r (r.label)}
			<span class="scale-row" class:on={r.on}><span>{r.label}</span><span>{r.value}</span></span>
		{/each}
	</span>
{/snippet}

<!-- A term, then the terms it's built from, indented a step deeper. A term with parts shows its
     outcome table after them, since the parts are what it looks up. -->
{#snippet row(t: Term, depth = 0)}
	<span class="row" class:sub={depth > 0} style:padding-left={depth ? `${depth * 12}px` : null}>
		<span class="label">{t.label}</span>
		<span class="value" class:aside={t.aside}>{t.value}</span>
		{#if t.note}<span class="note-line">{t.note}</span>{/if}
		{#if maths.full && t.tip}<span class="tip">{t.tip}</span>{/if}
		{#if maths.full && t.scale && !t.parts}{@render scale(t.scale, t.scaleOf)}{/if}
	</span>
	{#each t.parts ?? [] as p (p.label)}{@render row(p, depth + 1)}{/each}
	{#if maths.full && t.scale && t.parts}
		<span class="row sub" style:padding-left="{(depth + 1) * 12}px">{@render scale(t.scale, t.scaleOf)}</span>
	{/if}
{/snippet}

{#if kind === 'aim'}
	{#if sheet.aim}
		{#each sheet.aim.terms as t (t.label)}{@render row(t)}{/each}
		<span class="row sum">
			<span class="label">Total</span>
			<span class="value">{sheet.aim.total}</span>
			{#if maths.full}{@render scale(sheet.aim.scale)}{/if}
		</span>
	{/if}
{:else if score}
	{#each score.terms as t (t.label)}{@render row(t)}{/each}
	<span class="row sum">
		<span class="label">Total</span>
		<!-- "–" when there's a result but no sum (a double six or an error), "?" when not rolled yet. -->
		<span class="value">{score.total ?? (score.verdict ? '–' : '?')}</span>
		{#if score.totalNote}<span class="note-line">{score.totalNote}</span>{/if}
		<!-- Always shown, unlike the other tables: it's what the total means. -->
		{#if score.totalScale}{@render scale(score.totalScale, score.totalOf)}{/if}
	</span>
{/if}

<style>
	.row {
		display: grid;
		grid-template-columns: 1fr auto;
		column-gap: 8px;
	}
	.row .label {
		font-weight: 700;
	}
	.row .value {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.row.sub {
		padding-left: 12px;
		font-size: 0.93em;
		opacity: 0.85;
	}
	.value.aside {
		font-weight: 400;
		opacity: 0.6;
	}
	.row.sub .label {
		font-weight: 400;
	}
	.note-line,
	.tip {
		grid-column: 1 / -1;
		font-size: 0.9em;
		opacity: 0.75;
	}
	.tip {
		font-style: italic;
	}
	/* The possible outcomes, one per line, with the one that happened picked out. */
	.scale {
		grid-column: 1 / -1;
		display: grid;
		margin: 3px 0 2px;
		font-size: 0.9em;
	}
	.scale-of {
		padding: 0 6px;
		font-size: 0.9em;
		font-style: italic;
		opacity: 0.75;
	}
	.scale-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		padding: 1px 6px;
		border-radius: 4px;
		opacity: 0.6;
	}
	.scale-row.on {
		opacity: 1;
		font-weight: 800;
		background: color-mix(in srgb, currentColor 18%, transparent);
	}
	.row.sum {
		border-top: 1px solid currentColor;
		padding-top: 4px;
		margin-top: 2px;
	}
</style>
