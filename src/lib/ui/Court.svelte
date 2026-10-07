<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { other } from '#lib/engine/rally.ts';
	import { TARGET, ZONES } from '#lib/engine/rules.ts';
	import type { Channel, Game, Shot, Stance, TeamId } from '#lib/engine/types.ts';
	import CalloutView from './Callout.svelte';
	import Die from './Die.svelte';
	import {
		arcPoint,
		ballAt,
		calloutTop,
		FLIGHT,
		flightKind,
		positions,
		previewDefence,
		roleOf,
		VIEW,
		zoneBox,
		zoneCenter,
		type PlacedDie,
		type Point,
		type Positions
	} from './layout';
	import PlayerChip from './PlayerChip.svelte';
	import { callout, playerActions, stepEntries } from './story';

	/** `dice.key` changes every step, so a new roll re-animates even if the values repeat. */
	let {
		game,
		dice,
		staged = null,
		preview = null,
		defencePreview = null
	}: {
		game: Game;
		dice: { key: number; items: PlacedDie[] };
		/** Where to draw players and the ball instead, while someone runs to their spot to roll. */
		staged?: { pos: Positions; ball: Point } | null;
		/** A shot the player is hovering before choosing it: drawn as the intended arrow. */
		preview?: Shot | null;
		/** A defence the player is setting up before locking it in: drawn on the court. */
		defencePreview?: { block: Channel; stance: Stance } | null;
	} = $props();

	const TEAMS: TeamId[] = ['A', 'B'];
	const pos = $derived(
		staged?.pos ??
			(defencePreview && !game.attack?.calls
				? previewDefence(game, defencePreview.block, defencePreview.stance)
				: positions(game))
	);
	const a = $derived(game.attack);
	const defending = $derived(a ? other(a.team) : null);
	const calledShot = $derived(a?.calls?.shot ?? preview);
	const target = $derived(calledShot && a ? TARGET[calledShot] : null);
	const ballTarget = $derived(staged?.ball ?? ballAt(game, pos));

	// The ball flies along an arc to each new spot, sitting at the corner of the chip that holds it.
	const BALL_OFFSET = { x: 34, y: -20 };
	const ballSpot = $derived({ x: ballTarget.x + BALL_OFFSET.x, y: ballTarget.y + BALL_OFFSET.y });
	let flight = $state.raw(untrack(() => ({ from: ballSpot, to: ballSpot, apex: 0 })));
	const progress = new Tween(1);
	$effect(() => {
		const to = ballSpot;
		const { apex, ms } = FLIGHT[flightKind(game, staged !== null)];
		untrack(() => {
			if (to.x === flight.to.x && to.y === flight.to.y) return;
			// Start from wherever the ball's shadow is now, even if it was still in the air.
			const from = arcPoint(flight.from, flight.to, flight.apex, progress.current).ground;
			flight = { from, to, apex };
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			progress.set(0, { duration: 0 });
			progress.set(1, { duration: reduced ? 0 : ms });
		});
	});
	const ball = $derived(arcPoint(flight.from, flight.to, flight.apex, progress.current));
	/** The flight path, drawn as a faint trail: a quadratic curve that peaks at the apex. */
	const trail = $derived.by(() => {
		const { from, to, apex } = flight;
		if (from.x === to.x && from.y === to.y) return null;
		const cx = (from.x + to.x) / 2;
		const cy = (from.y + to.y) / 2 - 2 * apex;
		return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
	});
	const moment = $derived(callout(game));
	const actions = $derived(playerActions(game));
	/** A point was won this step: mark where the ball hit the floor. */
	const scored = $derived(stepEntries(game).some((e) => e.tag === 'point'));
	/** A stuffed ball never reaches the back court, so don't draw it landing there. */
	const stuffed = $derived(stepEntries(game).some((e) => e.tag === 'point' && e.data?.kind === 'stuff'));
	/** Once the step's result is on screen, the dice fade so the play stands out. */
	const resolved = $derived(dice.key === game.steps);

	// Big moments shake the court briefly.
	let shaking = $state(false);
	$effect(() => {
		if (!moment?.epic || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		shaking = true;
		const stop = setTimeout(() => (shaking = false), 450);
		return () => clearTimeout(stop);
	});

	// Intended shot: dashed, from the hitter to the called zone. Actual shot: solid, to where it landed.
	const shot = $derived.by(() => {
		if (!a || !calledShot) return null;
		const from = zoneCenter(a.team, pos[a.team][a.hitter]);
		return {
			from,
			intended: zoneCenter(other(a.team), TARGET[calledShot]),
			actual: a.landing && !stuffed ? zoneCenter(other(a.team), a.landing) : null
		};
	});

	// The blocker stands in zone 2, facing the hitter. Blocking line covers the sideline half of
	// their zone; blocking cross covers the half toward the middle of the court.
	const blockBar = $derived.by(() => {
		const block = a?.calls?.block ?? defencePreview?.block;
		if (!block || !defending) return null;
		const box = zoneBox(defending, 2);
		const half = box.w / 2;
		// Zone 2 is on the left of the screen for B (mirrored) and on the right for A.
		const sidelineHalf = defending === 'B' ? box.x : box.x + half;
		const middleHalf = defending === 'B' ? box.x + half : box.x;
		const x = (block === 'line' ? sidelineHalf : middleHalf) + 4;
		return { x, y: defending === 'A' ? VIEW.netY + 6 : VIEW.netY - 12, w: half - 8, label: block };
	});
</script>

<figure>
	<div class="stage" class:shaking>
	<svg viewBox="0 0 {VIEW.width} {VIEW.height}" role="img" aria-label="Court">
		<defs>
			<marker id="head-intended" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
				<path d="M2 1L8 5L2 9" fill="none" stroke="var(--muted)" stroke-width="1.5" />
			</marker>
			<marker id="head-actual" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
				<path d="M2 1L8 5L2 9" fill="none" stroke="var(--actual)" stroke-width="1.5" />
			</marker>
		</defs>

		{#each TEAMS as team (team)}
			{#each ZONES as zone (zone)}
				{@const b = zoneBox(team, zone)}
				<rect
					class="zone"
					class:landing={team === defending && zone === a?.landing && !stuffed}
					x={b.x}
					y={b.y}
					width={b.w}
					height={b.h}
				/>
				<text class="zone-label" x={b.x + 6} y={b.y + 14}>{zone}</text>
			{/each}
		{/each}

		{#if defending && target}
			{@const t = zoneBox(defending, target)}
			<rect class="target" x={t.x + 3} y={t.y + 3} width={t.w - 6} height={t.h - 6} rx="4" />
		{/if}

		<rect class="net" x="8" y={VIEW.netY - 4} width={VIEW.width - 16} height="8" />
		{#if blockBar}
			<rect class="block" x={blockBar.x} y={blockBar.y} width={blockBar.w} height="6" rx="2" />
			<text class="block-label" x={blockBar.x + blockBar.w / 2} y={defending === 'A' ? blockBar.y + 16 : blockBar.y - 4}>
				blocks {blockBar.label}
			</text>
		{/if}
		{#if shot}
			<line
				class="intended"
				x1={shot.from.x}
				y1={shot.from.y}
				x2={shot.intended.x}
				y2={shot.intended.y}
				marker-end="url(#head-intended)"
			/>
			{#if shot.actual}
				<line
					class="actual"
					x1={shot.from.x}
					y1={shot.from.y}
					x2={shot.actual.x}
					y2={shot.actual.y}
					marker-end="url(#head-actual)"
				/>
			{/if}
		{/if}

		<g class="dice" class:resolved>
			{#each dice.items as d, i (`${dice.key}-${i}`)}
				<Die value={d.die} label={d.label} x={d.x} y={d.y} />
			{/each}
		</g>

		{#each TEAMS as team (team)}
			{#each ['blocker', 'defender'] as const as slot (slot)}
				{@const at = zoneCenter(team, pos[team][slot])}
				<PlayerChip
					player={game.teams[team][slot]}
					{team}
					role={roleOf(game, team, slot)}
					x={at.x}
					y={at.y}
					hitter={a?.team === team && a.hitter === slot}
					action={actions[`${team}-${slot}`] ?? null}
					actionKey={game.steps}
					lunge={Math.sign(ballTarget.x - at.x) || 1}
				/>
			{/each}
		{/each}

		{#if scored}
			{#key game.steps}
				<circle class="impact" cx={ballTarget.x + 34} cy={ballTarget.y - 20} r="10" />
			{/key}
		{/if}

		{#if trail}
			{#key flight}
				<path class="trail" d={trail} />
			{/key}
		{/if}
		<ellipse
			class="shadow"
			cx={ball.ground.x}
			cy={ball.ground.y + 6}
			rx={6 - ball.height / 30}
			ry={2.5 - ball.height / 80}
			opacity={0.45 - ball.height / 250}
		/>
		<circle class="ball" cx={ball.x} cy={ball.y} r={7 + ball.height / 18} />
	</svg>
	<CalloutView callout={moment} top={moment ? calloutTop(moment.team, pos) : 50} />
	</div>
	<figcaption>
		<span class="a">Team A</span> bottom · <span class="b">Team B</span> top · dashed = called shot · solid = where it went
	</figcaption>
</figure>

<style>
	figure {
		margin: 0;
	}
	.stage {
		position: relative;
		/* Size the stage to the court so callouts scale with it. Tall enough to fill a laptop
		   screen below the header without scrolling: height = width × 560 / 300. */
		container-type: inline-size;
		max-width: max(260px, calc((100vh - 330px) * 300 / 560));
		margin: 0 auto;
	}
	.shaking {
		animation: shake 450ms ease-out;
	}
	@keyframes shake {
		15% {
			transform: translate(-6px, 3px) rotate(-0.6deg);
		}
		30% {
			transform: translate(5px, -3px) rotate(0.5deg);
		}
		45% {
			transform: translate(-4px, 2px);
		}
		60% {
			transform: translate(3px, -1px);
		}
		80% {
			transform: translate(-1px, 0);
		}
	}
	.impact {
		fill: none;
		stroke: var(--actual);
		stroke-width: 3;
		transform-box: fill-box;
		transform-origin: center;
		animation: impact 700ms ease-out forwards;
	}
	@keyframes impact {
		from {
			transform: scale(0.4);
			opacity: 1;
		}
		to {
			transform: scale(4);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.impact {
			animation: none;
			opacity: 0;
		}
	}
	svg {
		width: 100%;
		display: block;
	}
	.zone {
		fill: var(--surface);
		stroke: var(--border);
		stroke-width: 1;
	}
	.zone.landing {
		fill: var(--landing);
	}
	.target {
		fill: none;
		stroke: var(--actual);
		stroke-width: 2;
		stroke-dasharray: 5 4;
	}
	.zone-label {
		font-size: 10px;
		fill: var(--muted);
	}
	.net {
		fill: var(--muted);
	}
	.block-label {
		font-size: 9px;
		font-weight: 700;
		text-anchor: middle;
		fill: var(--block);
		text-transform: uppercase;
	}
	.dice {
		transition: opacity 400ms;
	}
	.dice.resolved {
		opacity: 0.35;
	}
	.block {
		fill: var(--block);
	}
	.intended {
		stroke: var(--muted);
		stroke-width: 1.5;
		stroke-dasharray: 4 4;
	}
	.actual {
		stroke: var(--actual);
		stroke-width: 2.5;
	}
	.trail {
		fill: none;
		stroke: var(--ball);
		stroke-width: 1.5;
		stroke-dasharray: 2 4;
		stroke-linecap: round;
		animation: trail 1200ms ease-out forwards;
	}
	@keyframes trail {
		from {
			opacity: 0.9;
		}
		to {
			opacity: 0.35;
		}
	}
	.shadow {
		fill: #000;
	}
	.ball {
		fill: var(--ball);
		stroke: #854f0b;
		stroke-width: 1;
	}
	figcaption {
		font-size: 0.8rem;
		color: var(--muted);
		margin-top: 4px;
	}
	.a {
		color: var(--team-a);
	}
	.b {
		color: var(--team-b);
	}
</style>
