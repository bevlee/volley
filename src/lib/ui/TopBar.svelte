<script lang="ts">
	import { other } from '#lib/engine/rally.ts';
	import type { Game, TeamId } from '#lib/engine/types.ts';

	let {
		game,
		you = null,
		names = null,
		opponent = null,
		debugOpen = false,
		onhelp,
		onsettings,
		ondebug,
		onleave
	}: {
		game: Game;
		/** Online, the team this player has. */
		you?: TeamId | null;
		/** Online, each team's player's name, shown under the team's letter. */
		names?: Record<TeamId, string | null> | null;
		/** Online, whether the other player is connected: a green dot by their name, or a red disconnected mark. */
		opponent?: 'connected' | 'away' | 'waiting' | null;
		debugOpen?: boolean;
		onhelp: () => void;
		onsettings: () => void;
		/** Shows the debug button (only on /admin); null or missing hides it. */
		ondebug?: (() => void) | null;
		/** Online: shows a Leave button next to Help. */
		onleave?: () => void;
	} = $props();
</script>

{#snippet tag(team: TeamId)}
	{#if names?.[team]}
		<small class:you={you === team}>
			<span class="name">{names[team]}</span>{#if you && team !== you && opponent === 'connected'}<span class="here" title="Connected"></span>{:else if you && team !== you && opponent === 'away'}<svg
					class="away"
					viewBox="0 0 10 10"
					role="img"
					aria-label="Disconnected"><title>Disconnected</title><circle cx="5" cy="5" r="4" /><path d="M2.2 7.8 7.8 2.2" /></svg
				>{/if}
		</small>
	{:else if you === team}<small class="you">you</small>{/if}
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
	<!-- Only at game over: the score and serve dots say everything else. -->
	{#if game.winner}
		<span class="meta"><b>Team {game.winner} wins {game.score[game.winner]}–{game.score[other(game.winner)]}</b></span>
	{/if}
	<div class="icons">
		{#if onleave}
			<button class="leave" onclick={onleave} aria-label="Leave" title="Leave the game">
				<span class="word">Leave</span>
				<!-- Narrow phones: a door with an arrow out, so Help and Settings still fit. -->
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 8l-4 4l4 4M5 12h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>
		{/if}
		<button class="pill" onclick={onhelp} title="How to play (?)">Help</button>
		<button class="icon" onclick={onsettings} aria-label="Settings" title="Settings">
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
				<path
					d="M12 15.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3a1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
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
		display: flex;
		align-items: center;
		justify-content: center;
		max-width: 6rem;
		white-space: nowrap;
		font-size: 0.65rem;
		font-weight: 500;
		line-height: 1.1;
		text-align: center;
	}
	/* A long name is cut short, but never the connection mark after it. */
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.here,
	.away {
		flex: none;
	}
	.score small.you {
		font-weight: 800;
		text-decoration: underline;
	}
	/* The other player's connection, after their name. */
	.here {
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-left: 3px;
		border-radius: 50%;
		background: var(--open);
		vertical-align: 1px;
	}
	.away {
		width: 8px;
		height: 8px;
		margin-left: 3px;
		vertical-align: -0.5px;
		fill: none;
		stroke: var(--covered);
		stroke-width: 1.6;
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
	:global([data-motion='reduced']) .pop {
		animation: none;
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
	/* One row on a phone: just the back arrow (and the result at game over). */
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
		.icons {
			gap: 4px;
		}
		.icon {
			width: 38px;
			height: 38px;
		}
		.leave,
		.pill {
			height: 38px;
			border-radius: 19px;
			padding: 0 10px;
		}
	}
	.leave,
	.pill {
		height: 32px;
		border-radius: 16px;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.leave svg {
		display: none;
	}
	/* The narrowest phones: Leave becomes an icon, and the score sits a little tighter. */
	@media (max-width: 400px) {
		.leave {
			width: 38px;
			padding: 0;
			display: grid;
			place-items: center;
		}
		.leave .word {
			display: none;
		}
		.leave svg {
			display: block;
		}
		.bar {
			column-gap: 4px;
		}
		.score {
			gap: 4px;
		}
		.num {
			font-size: 1.4rem;
		}
		.score small {
			max-width: 3.6rem;
		}
		.pill {
			padding: 0 8px;
		}
	}
	@media (max-width: 340px) {
		.icon,
		.leave {
			width: 34px;
			height: 34px;
		}
		.pill {
			height: 34px;
			padding: 0 6px;
		}
		.icons {
			gap: 2px;
		}
	}
	.icon.on {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
	}
</style>
