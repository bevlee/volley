<script lang="ts">
	import { untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { config } from '#lib/engine/config.ts';
	import type { Player, TeamId } from '#lib/engine/types.ts';
	import type { Role } from './layout';
	import { paced } from './pace.svelte';
	import { MOVE_MS } from './timing';
	import type { Action } from './story';

	let {
		player,
		team,
		near = team === 'A',
		role,
		x,
		y,
		glide = true,
		hitter = false,
		action = null,
		actionKey = 0,
		lunge = 1,
		pips = null
	}: {
		player: Player;
		team: TeamId;
		/** In the bottom half of the court, facing up the screen. */
		near?: boolean;
		role: Role;
		x: number;
		y: number;
		/** Ease to a new spot; off while a step plays, as the court moves everyone itself (see choreo.ts). */
		glide?: boolean;
		hitter?: boolean;
		/** What this player just did; plays a short animation. */
		action?: Action | null;
		/** Changes every step, so the same action twice still replays. */
		actionKey?: number;
		/** Which way a dive goes across the court: −1 left, 1 right (toward the ball). */
		lunge?: number;
		/** Special charges this player has (the ?specials prototype); null when charges are off. */
		pips?: number | null;
	} = $props();

	const W = 80;
	/** Three short lines (name, role, stats): a character's name and role don't fit on one line. */
	const H = 46;
	const pos = new Tween(untrack(() => ({ x, y })), { easing: cubicOut });
	// A number, not a function: Tween only jumps straight there for a duration of exactly 0.
	$effect.pre(() => void pos.set({ x, y }, { duration: glide ? paced(MOVE_MS) : 0 }));
	// The top team faces down the screen, so their dives lunge the other way.
	const facing = $derived(near ? -1 : 1);
	/**
	 * Charge dots on the chip's top edge (dice land just under it): one per possible charge, filled
	 * for the ones the player has.
	 */
	const PIP_R = 3.2;
	const PIP_GAP = 9;
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
		<text class="action" x={W / 2} y={pips === null ? -6 : -10}>{action.label}</text>
	{/if}
	{#if pips !== null}
		<g class="pips" aria-label="{pips} special charges">
			{#each { length: config.maxPips } as _, i (i)}
				{#key i < pips}
					<circle class:full={i < pips} cx={W / 2 + (i - (config.maxPips - 1) / 2) * PIP_GAP} cy="0" r={PIP_R} />
				{/key}
			{/each}
		</g>
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
	.pips circle {
		fill: var(--bg);
		stroke: var(--special);
		stroke-width: 1.2;
	}
	.pips circle.full {
		fill: var(--special);
		opacity: 1;
		animation: charge calc(500ms * var(--pace, 1)) ease-out;
		transform-box: fill-box;
		transform-origin: center;
	}
	@keyframes charge {
		40% {
			transform: scale(1.8);
		}
	}
	.action {
		font-size: 10px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.spike {
		animation: spike calc(600ms * var(--pace, 1)) ease-out;
	}
	.tip {
		animation: tip calc(600ms * var(--pace, 1)) ease-out;
	}
	.block {
		animation: block calc(600ms * var(--pace, 1)) ease-out;
	}
	.dig {
		animation: dig calc(600ms * var(--pace, 1)) ease-out;
	}
	.dive {
		animation: dive calc(800ms * var(--pace, 1)) ease-out;
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
	:global([data-motion='reduced']) .body,
	:global([data-motion='reduced']) .pips circle.full {
		animation: none;
	}
</style>
