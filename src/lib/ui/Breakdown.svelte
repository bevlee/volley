<script lang="ts" module>
	export type ScoreKind = 'attack' | 'block' | 'dig';
</script>

<script lang="ts">
	import { maths } from './fullMaths.svelte.ts';
	import type { ScaleRow, Score, ScoreSheet, Term } from './scores';

	/** How one score adds up. Colours follow the text, so it reads on the dark hover card and the light phone sheet. */
	let { kind, score, sheet }: { kind: ScoreKind; score: Score; sheet: ScoreSheet } = $props();

	const TOTAL_TIP = {
		attack: 'What the block and the dig have to beat.',
		block: 'Beat the attack by 3 or more to stuff it. Within 2 is a touch. Lose by 3 or more and it goes through to the dig.',
		dig: 'Match or beat the attack to dig it up. Otherwise it’s a kill.'
	};
</script>

{#snippet scale(rows: ScaleRow[])}
	<span class="scale">
		{#each rows as r (r.label)}
			<span class="scale-row" class:on={r.on}><span>{r.label}</span><span>{r.value}</span></span>
		{/each}
	</span>
{/snippet}

{#snippet row(t: Term, sub = false)}
	<span class="row" class:sub>
		<span class="label">{t.label}</span>
		<span class="value">{t.value}</span>
		{#if t.note}<span class="note-line">{t.note}</span>{/if}
		{#if maths.full && t.tip}<span class="tip">{t.tip}</span>{/if}
		{#if maths.full && t.scale}{@render scale(t.scale)}{/if}
	</span>
	{#each t.parts ?? [] as p (p.label)}{@render row(p, true)}{/each}
{/snippet}

{#each score.terms as t (t.label)}{@render row(t)}{/each}
<span class="row sum">
	<span class="label">Total</span>
	<span class="value">{score.total ?? '?'}</span>
	<span class="note-line">{score.totalNote}</span>
	{#if maths.full}<span class="tip">{TOTAL_TIP[kind]}</span>{/if}
</span>
{#if maths.full && kind === 'attack' && sheet.aim}
	<span class="section">Where it lands</span>
	{#each sheet.aim.terms as t (t.label)}{@render row(t, true)}{/each}
	<span class="row sum">
		<span class="label">Aim</span>
		<span class="value">{sheet.aim.total}</span>
		{@render scale(sheet.aim.scale)}
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
	.section {
		margin-top: 6px;
		font-size: 0.85em;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.75;
	}
</style>
