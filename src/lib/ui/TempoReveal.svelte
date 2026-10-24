<script lang="ts">
	import type { Reveal } from './tempo';

	/** Advanced mode, after the hit: what the shot was, what the block and the dig did, and the numbers. */
	let { reveal }: { reveal: Reveal } = $props();
</script>

<div class="reveal">
	<p class="headline">{reveal.headline}</p>
	<div class="rows">
		{#each [reveal.block, reveal.dig] as row, i (i)}
			{#if row}
				<div class="row {i === 0 ? 'block' : `dig ${reveal.defending}`}" class:good={row.good}>
					<span class="kicker">{row.kicker}</span>
					<span>{row.text}</span>
					<span class="note">{row.note}</span>
				</div>
			{/if}
		{/each}
	</div>
	<p class="tally">
		<span>{reveal.tally.attack}</span>
		{#if reveal.tally.against}<span class="vs">vs</span><span>{reveal.tally.against}</span>{/if}
		<span class="verdict {reveal.tally.defenceWins ? reveal.defending : reveal.team}">{reveal.tally.verdict}</span>
	</p>
</div>

<style>
	.reveal {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		max-width: 26rem;
	}
	p {
		margin: 0;
		text-align: center;
	}
	.headline {
		font-weight: 600;
	}
	.rows {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		font-size: 13px;
	}
	/* With no dig (a block, or a quick ball), the block row takes the width. */
	.rows:has(> :only-child) {
		grid-template-columns: 1fr;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 10px;
		line-height: 1.25;
	}
	.kicker {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.block .kicker {
		color: var(--block);
	}
	.dig.A {
		--team: var(--team-a);
	}
	.dig.B {
		--team: var(--team-b);
	}
	.dig .kicker {
		color: var(--team);
	}
	.dig.good {
		border: 1.5px solid var(--team);
	}
	.dig.good .note {
		color: var(--team);
		font-weight: 700;
	}
	.note {
		font-size: 12px;
		color: var(--muted);
	}
	.tally {
		display: flex;
		justify-content: center;
		align-items: baseline;
		gap: 10px;
		font-size: 14px;
	}
	.vs {
		color: var(--muted);
	}
	.verdict {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--bg);
		border-radius: 4px;
		padding: 1px 6px;
	}
	.verdict.A {
		background: var(--team-a);
	}
	.verdict.B {
		background: var(--team-b);
	}
</style>
