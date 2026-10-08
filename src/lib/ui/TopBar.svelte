<script lang="ts">
	import { config } from '#lib/engine/config.ts';
	import { other } from '#lib/engine/rally.ts';
	import type { Game, TeamId } from '#lib/engine/types.ts';

	let {
		game,
		you = null,
		names = null,
		debugOpen = false,
		onhelp,
		ondebug
	}: {
		game: Game;
		/** Online, the team this player has. */
		you?: TeamId | null;
		/** Online, each team's player's name, shown under the team's letter. */
		names?: Record<TeamId, string | null> | null;
		debugOpen?: boolean;
		onhelp: () => void;
		/** Shows the debug button; games against the computer only. */
		ondebug?: () => void;
	} = $props();
</script>

{#snippet tag(team: TeamId)}
	{#if names?.[team]}<small class:you={you === team}>{names[team]}</small>{:else if you === team}<small class="you">you</small>{/if}
{/snippet}

<header class="bar">
	<a class="title" href="/" title="Back to the main screen" aria-label="Back to the main screen">←<span class="word">Volley</span></a>
	<div class="score" aria-live="polite">
		<span class="a">A{@render tag('A')}</span>
		{#key game.score.A}<span class="num pop a">{game.score.A}</span>{/key}
		<span class="serve" class:on={game.serving === 'A'} title="Serving"></span>
		<span class="dash">–</span>
		<span class="serve" class:on={game.serving === 'B'} title="Serving"></span>
		{#key game.score.B}<span class="num pop b">{game.score.B}</span>{/key}
		<span class="b">B{@render tag('B')}</span>
	</div>
	<span class="meta">
		{#if game.winner}
			<b>Team {game.winner} wins {game.score[game.winner]}–{game.score[other(game.winner)]}</b>
		{:else}
			Rally {game.rally} · to {config.targetScore}
		{/if}
	</span>
	<div class="icons">
		<button class="icon" onclick={onhelp} aria-label="Rules" title="Rules (?)">?</button>
		{#if ondebug}
			<button class="icon" class:on={debugOpen} onclick={ondebug} aria-label="Debug panel" aria-pressed={debugOpen} title="Debug panel (D)">
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
					<path d="M5 7l5 5l-5 5M12 19h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>
		{/if}
	</div>
</header>

<style>
	/* Title, score, icons, with the rally count under the score. */
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		grid-template-areas: 'title score icons' '. meta .';
		align-items: center;
		column-gap: 8px;
		padding: 6px 0;
	}
	.title {
		grid-area: title;
		font-weight: 700;
		color: var(--muted);
		text-decoration: none;
	}
	.title:hover {
		color: var(--text);
	}
	.title .word {
		margin-left: 0.3em;
	}
	/* "you" under your team's letter, online. */
	.score small {
		display: block;
		max-width: 6rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.65rem;
		font-weight: 500;
		line-height: 1.1;
		text-align: center;
	}
	.score small.you {
		font-weight: 800;
		text-decoration: underline;
	}
	.score {
		grid-area: score;
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
	}
	.num {
		font-size: 1.6rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.a {
		color: var(--team-a);
	}
	.b {
		color: var(--team-b);
	}
	.dash {
		color: var(--muted);
	}
	.serve {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.serve.on {
		background: var(--text);
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
	.meta {
		grid-area: meta;
		text-align: center;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.meta b {
		color: var(--text);
	}
	.icons {
		grid-area: icons;
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}
	.icon {
		width: 32px;
		height: 32px;
		padding: 0;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 700;
		color: var(--muted);
	}
	/* One row on a phone: just the back arrow, then the rally count. */
	@media (max-width: 600px) {
		.bar {
			grid-template-columns: auto 1fr auto 1fr;
			grid-template-areas: 'title meta score icons';
		}
		.title .word {
			display: none;
		}
		.meta {
			text-align: left;
		}
		.icon {
			width: 40px;
			height: 40px;
		}
	}
	.icon.on {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
	}
</style>
