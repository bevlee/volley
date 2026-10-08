<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import type { Player, TeamId } from '#lib/engine/types.ts';
	import type { Role } from './layout';
	import type { Action } from './story';

	let {
		player,
		team,
		role,
		x,
		y,
		hitter = false,
		action = null,
		actionKey = 0,
		lunge = 1
	}: {
		player: Player;
		team: TeamId;
		role: Role;
		x: number;
		y: number;
		hitter?: boolean;
		/** What this player just did; plays a short animation. */
		action?: Action | null;
		/** Changes every step, so the same action twice still replays. */
		actionKey?: number;
		/** Which way a dive goes across the court: −1 left, 1 right (toward the ball). */
		lunge?: number;
	} = $props();

	const W = 80;
	/** Three short lines (name, role, stats): a character's name and role don't fit on one line. */
	const H = 46;
	const pos = Tween.of(() => ({ x, y }), { duration: 350, easing: cubicOut });
	// Team B faces down the screen, so their dives lunge the other way.
	const facing = $derived(team === 'A' ? -1 : 1);
</script>

<g class="chip {team}" class:hitter transform="translate({pos.current.x - W / 2} {pos.current.y - H / 2})">
	{#key actionKey}
		<g class="body {action?.move ?? ''}" style:--facing={facing} style:--lunge={lunge}>
			<rect width={W} height={H} rx="6" />
			<text x={W / 2} y="14">{player.name}</text>
			<text x={W / 2} y="26" class="role">{role}</text>
			<text x={W / 2} y="39" class="stats">Atk {player.attack} · Def {player.defense}</text>
		</g>
	{/key}
	{#if action?.label}
		<text class="action" x={W / 2} y="-6">{action.label}</text>
	{/if}
</g>

<style>
	.body {
		transform-box: fill-box;
		transform-origin: center;
	}
	rect {
		stroke-width: 1;
	}
	.A rect {
		fill: var(--team-a-bg);
		stroke: var(--team-a);
	}
	.B rect {
		fill: var(--team-b-bg);
		stroke: var(--team-b);
	}
	.hitter rect {
		stroke-width: 2.5;
	}
	text {
		text-anchor: middle;
		font-size: 11px;
		font-weight: 600;
	}
	.A text {
		fill: var(--team-a);
	}
	.B text {
		fill: var(--team-b);
	}
	.role {
		font-size: 8.5px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.75;
	}
	.stats {
		font-size: 10px;
		font-weight: 400;
	}
	.action {
		font-size: 10px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.spike {
		animation: spike 600ms ease-out;
	}
	.tip {
		animation: tip 600ms ease-out;
	}
	.block {
		animation: block 600ms ease-out;
	}
	.dig {
		animation: dig 600ms ease-out;
	}
	.dive {
		animation: dive 800ms ease-out;
	}
	/* Jump at the net, then come down. */
	@keyframes spike {
		40% {
			transform: translateY(calc(var(--facing) * 14px)) scale(1.12);
		}
	}
	@keyframes tip {
		40% {
			transform: translateY(calc(var(--facing) * 8px)) scale(1.05);
		}
	}
	@keyframes block {
		40% {
			transform: translateY(calc(var(--facing) * 10px)) scale(1.06, 1.2);
		}
	}
	/* Drop low to play the ball. */
	@keyframes dig {
		40% {
			transform: scale(1.08, 0.82);
		}
	}
	/* Throw out sideways and down toward the ball. */
	@keyframes dive {
		35% {
			transform: translate(calc(var(--lunge) * 12px), calc(var(--facing) * 16px)) rotate(calc(var(--lunge) * 18deg))
				scale(1.08, 0.8);
		}
		70% {
			transform: translate(calc(var(--lunge) * 7px), calc(var(--facing) * 10px)) rotate(calc(var(--lunge) * 10deg))
				scale(1.04, 0.88);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.body {
			animation: none;
		}
	}
</style>
