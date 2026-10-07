<script lang="ts">
	import type { Game } from '#lib/engine/types.ts';
	import { callout, duels, narrate, playSummary, stepEntries } from './story';

	/** `choosing`: it's the player's attack, so the panel explains the three shots. */
	let {
		game,
		choosing = false,
		defending = false
	}: { game: Game; choosing?: boolean; defending?: boolean } = $props();

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
	{#if choosing && game.attack}
		<p class="kicker">Your attack · {game.teams[game.attack.team][game.attack.hitter].name}</p>
		<p class="choice"><b>Line</b> hard, straight down the sideline</p>
		<p class="choice"><b>Cross</b> hard, angled across the court</p>
		<p class="choice"><b>Tip</b> soft, over the block into the short middle</p>
	{:else if defending && game.attack}
		{@const a = game.attack}
		{@const mine = game.teams[a.team === 'A' ? 'B' : 'A']}
		<p class="kicker">Your defence · {game.teams[a.team][a.hitter].name} is about to attack</p>
		<p class="choice"><b>Block</b> {mine.blocker.name} takes away the line or the cross</p>
		<p class="choice"><b>Deep</b> {mine.defender.name} covers the other hard shot</p>
		<p class="choice"><b>Short</b> {mine.defender.name} creeps in for the tip</p>
	{:else if calls}
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
		/* A fixed height that fits the play preview or two matchups, so the court never jumps. */
		height: 124px;
		overflow: hidden;
		box-sizing: border-box;
		padding: 8px 12px;
		margin-bottom: 8px;
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
	.choice {
		font-size: 0.85rem;
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
