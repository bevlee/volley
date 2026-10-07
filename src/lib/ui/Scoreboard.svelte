<script lang="ts">
	import { config } from '#lib/engine/config.ts';
	import { other } from '#lib/engine/rally.ts';
	import type { Game } from '#lib/engine/types.ts';

	let { game }: { game: Game } = $props();
</script>

<div class="scoreboard" aria-live="polite">
	<span class="name a">Team A</span>
	{#key game.score.A}<span class="score pop a">{game.score.A}</span>{/key}
	<span class="serve" class:on={game.serving === 'A'} title="Serving"></span>
	<span class="dash">–</span>
	<span class="serve" class:on={game.serving === 'B'} title="Serving"></span>
	{#key game.score.B}<span class="score pop b">{game.score.B}</span>{/key}
	<span class="name b">Team B</span>
</div>
{#if game.winner}
	<p class="winner">
		Team {game.winner} wins {game.score[game.winner]}–{game.score[other(game.winner)]}
	</p>
{:else}
	<p class="meta">Rally {game.rally} · to {config.targetScore}, win by {config.winBy}</p>
{/if}

<style>
	.scoreboard {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.score.a {
		color: var(--team-a);
	}
	.score.b {
		color: var(--team-b);
	}
	.pop {
		display: inline-block;
		animation: pop 500ms cubic-bezier(0.2, 0.9, 0.3, 1.4);
	}
	@keyframes pop {
		from {
			transform: scale(1.8);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pop {
			animation: none;
		}
	}
	.score {
		font-size: 2.4rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.name.a {
		color: var(--team-a);
	}
	.name.b {
		color: var(--team-b);
	}
	.dash {
		color: var(--muted);
	}
	.serve {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.serve.on {
		background: var(--text);
	}
	.meta,
	.winner {
		margin: 0 0 6px;
		color: var(--muted);
	}
	.winner {
		color: var(--text);
		font-weight: 600;
	}
</style>
