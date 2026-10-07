<script lang="ts">
	import type { Game } from '#lib/engine/types.ts';
	import { callout, duels, narrate, playSummary, stepEntries } from './story';

	let { game }: { game: Game } = $props();

	const entries = $derived(stepEntries(game));
	const calls = $derived(entries.find((e) => e.tag === 'calls'));
	const fights = $derived(duels(game));
	/** The most recent thing that happened, for steps with no matchup to show. */
	const moment = $derived(callout(game));
	const headline = $derived(
		moment ? `${moment.text} ${moment.sub}` : entries.length ? narrate(entries[entries.length - 1]) : ''
	);
	const summary = $derived(playSummary(game));
</script>

<section class="panel" aria-live="polite">
	{#if calls}
		{@const d = calls.data ?? {}}
		{@const [attack, block, defend] = narrate(calls).split(' · ')}
		<p class="kicker">The play</p>
		<p class="line {d.team}">{attack}</p>
		<p class="line {d.defending}">{block} · {defend}</p>
	{:else if fights.length}
		<p class="summary">{summary}</p>
		{#each fights as f, i (i)}
			{@const share = (100 * f.attack) / Math.max(1, f.attack + f.defence)}
			<div class="duel">
				<div class="side {f.attackTeam}" class:win={f.attackWins}>
					<span class="who">{f.attacker}</span>
					<span class="num">{f.attack}</span>
				</div>
				<div class="bar" aria-hidden="true">
					<span class="fill {f.attackTeam}" style:width="{share}%"></span>
					<span class="fill {f.defenceTeam}" style:width="{100 - share}%"></span>
				</div>
				<div class="side right {f.defenceTeam}" class:win={!f.attackWins}>
					<span class="who">{f.defender}</span>
					<span class="num">{f.defence}</span>
				</div>
				<span class="verdict {f.attackWins ? f.attackTeam : f.defenceTeam}">{f.verdict}</span>
			</div>
		{/each}
	{:else}
		{#if summary && moment}<p class="summary">{summary}</p>{/if}
		<p class="headline">{headline}</p>
	{/if}
</section>

<style>
	.panel {
		min-height: 60px;
		box-sizing: border-box;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
	}
	p {
		margin: 0;
	}
	.kicker {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.summary {
		font-size: 0.75rem;
		color: var(--muted);
		/* Up to two lines, so a phone shows the whole play. */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.line {
		font-weight: 600;
	}
	.headline {
		font-weight: 600;
	}
	.A {
		color: var(--team-a);
	}
	.B {
		color: var(--team-b);
	}
	.duel {
		display: grid;
		grid-template-columns: auto minmax(40px, 1fr) auto auto;
		align-items: center;
		gap: 8px;
	}
	.side {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
		opacity: 0.6;
	}
	.side.right {
		align-items: flex-end;
	}
	.side.win {
		opacity: 1;
	}
	.num {
		font-size: 1.5rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.who {
		font-size: 0.75rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bar {
		display: flex;
		height: 10px;
		border-radius: 5px;
		overflow: hidden;
		background: var(--border);
	}
	.fill.A {
		background: var(--team-a);
	}
	.fill.B {
		background: var(--team-b);
	}
	.fill {
		animation: grow 500ms ease-out;
	}
	.verdict {
		font-weight: 800;
		font-size: 0.85rem;
		min-width: 4rem;
		text-align: right;
	}
	@keyframes grow {
		from {
			width: 50%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fill {
			animation: none;
		}
	}
</style>
