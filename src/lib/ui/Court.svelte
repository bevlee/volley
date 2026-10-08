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
		blockHands,
		calloutTop,
		coverage,
		FLIGHT,
		flightKind,
		halfBox,
		type FlightKind,
		positions,
		previewDefence,
		roleOf,
		shotPoint,
		VIEW,
		zoneBox,
		zoneCenter,
		type PlacedDie,
		type Point,
		type Positions
	} from './layout';
	import PlayerChip from './PlayerChip.svelte';
	import { callout, playerActions, stepEntries, type Impact } from './story';

	/** `dice.key` changes every step, so a new roll re-animates even if the values repeat. */
	let {
		game,
		dice,
		staged = null,
		preview = null,
		defencePreview = null,
		onshot = null,
		onpreview = () => {}
	}: {
		game: Game;
		/** Each die carries the step it was rolled in: earlier ones in the possession stay, faded. */
		dice: { key: number; items: (PlacedDie & { step: number })[] };
		/** Where to draw players and the ball instead, while someone runs to their spot to roll. */
		staged?: { pos: Positions; ball: Point } | null;
		/** A shot the player is hovering before choosing it: drawn as the intended arrow. */
		preview?: Shot | null;
		/** A defence the player is setting up before locking it in: drawn on the court. */
		defencePreview?: { block: Channel; stance: Stance } | null;
		/** Set while it's the player's attack: the target zones become buttons for the three shots. */
		onshot?: ((shot: Shot) => void) | null;
		/** Hovering or focusing a target zone previews that shot; null when it stops. */
		onpreview?: (shot: Shot | null) => void;
	} = $props();

	const SHOTS: Shot[] = ['line', 'cross', 'tip'];
	/** A read shot is one the defender is standing in position for. */
	const COVER_WORD = { blocked: 'blocked', read: 'covered', open: 'open' } as const;

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
	/** What the defence covers, once it's called or while the player sets theirs up. */
	const covers = $derived.by(() => {
		const d = a?.calls ?? defencePreview;
		return d ? coverage(d.block, d.stance) : null;
	});
	/** Where a shot's tag sits: across the top of its target zone, above the player's action label. */
	const tagAt = (team: TeamId, shot: Shot) => {
		const b = zoneBox(team, TARGET[shot]);
		return { x: b.x + b.w / 2, y: b.y + 14 };
	};

	const stuffed = $derived(stepEntries(game).some((e) => e.tag === 'point' && e.data?.kind === 'stuff'));
	/** Hit into the net (two 1s): like a stuffed ball, it drops at the net rather than being held. */
	const netted = $derived(
		stepEntries(game).some((e) => e.tag === 'swing') && stepEntries(game).some((e) => e.tag === 'point' && e.data?.kind === 'shank')
	);
	/** A stuffed or touched ball never reaches the back court, so don't draw it landing there. */
	const stopped = $derived(game.phase.kind === 'touched' || stuffed);

	// The ball flies along an arc to each new spot, sitting at the corner of the chip that holds it.
	// A line shot that lands in the sideline column sits on the line instead.
	const BALL_OFFSET = { x: 34, y: -20 };
	const ballSpot = $derived.by(() => {
		// A stuffed or netted ball is loose on the floor, not held by anyone.
		if ((stuffed || netted) && !staged) return ballTarget;
		const landed = a?.calls && a.landing && !stopped && !staged ? zoneCenter(other(a.team), a.landing) : null;
		const onLine = landed && a?.calls ? shotPoint(other(a.team), a.landing!, a.calls.shot) : null;
		if (landed && onLine && onLine.x !== landed.x && ballTarget.x === landed.x && ballTarget.y === landed.y) {
			return { x: onLine.x, y: onLine.y + BALL_OFFSET.y };
		}
		return { x: ballTarget.x + BALL_OFFSET.x, y: ballTarget.y + BALL_OFFSET.y };
	});
	/** A blocked ball goes into the blocker's hands at the net before it ends up where it lands. */
	const via = $derived(staged ? null : blockHands(game, pos));
	let flight = $state.raw(untrack(() => ({ from: ballSpot, to: ballSpot, apex: 0 })));
	/** Where the ball is headed; with a block, the flight's first leg ends short of it. */
	let heading = untrack(() => ballSpot);
	/** Bumped for every new flight, so a block's second leg doesn't start after a newer flight. */
	let flights = 0;
	/** The possession's earlier flights (serve, pass, set), kept as dotted lines for reference. */
	let earlier = $state.raw<string[]>([]);
	let lastKind: FlightKind = 'lob';
	const progress = new Tween(1);
	$effect(() => {
		const to = ballSpot;
		const stop = via;
		const kind = flightKind(game, staged !== null);
		untrack(() => {
			if (to.x === heading.x && to.y === heading.y) return;
			heading = to;
			// A serve or an attack starts a new picture; a pass or set adds to the build-up.
			const attack = (k: FlightKind) => k === 'spike' || k === 'tip';
			const before = pathOf(flight);
			earlier = kind === 'serve' || attack(kind) || attack(lastKind) || !before ? [] : [...earlier, before];
			lastKind = kind;
			// Start from wherever the ball's shadow is now, even if it was still in the air.
			const from = arcPoint(flight.from, flight.to, flight.apex, progress.current).ground;
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			const fly = (start: Point, end: Point, k: FlightKind) => {
				flight = { from: start, to: end, apex: FLIGHT[k].apex };
				progress.set(0, { duration: 0 });
				return progress.set(1, { duration: reduced ? 0 : FLIGHT[k].ms });
			};
			const id = ++flights;
			if (!stop) return void fly(from, to, kind);
			// Into the block, then off it: the first leg stays on the court as a trail.
			fly(from, stop, kind).then(() => {
				if (id !== flights) return;
				const into = pathOf(flight);
				if (into) earlier = [...earlier, into];
				fly(stop, to, 'drop');
			});
		});
	});
	const ball = $derived(arcPoint(flight.from, flight.to, flight.apex, progress.current));
	/** A flight's path, drawn as a faint trail: a quadratic curve that peaks at the apex. */
	function pathOf({ from, to, apex }: { from: Point; to: Point; apex: number }) {
		if (from.x === to.x && from.y === to.y) return null;
		const cx = (from.x + to.x) / 2;
		const cy = (from.y + to.y) / 2 - 2 * apex;
		return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
	}
	const trail = $derived(pathOf(flight));
	const moment = $derived(callout(game));
	const actions = $derived(playerActions(game));
	/** A point was won this step: mark where the ball hit the floor. */
	const scored = $derived(stepEntries(game).some((e) => e.tag === 'point'));
	/**
	 * The ball came down on the losing side (a kill on the defenders, a block or error on the hitters),
	 * so that half gets a glowing orange trace, drawn clockwise.
	 */
	const pointTo = $derived(stepEntries(game).find((e) => e.tag === 'point')?.data?.winner as TeamId | undefined);
	/** Once the step's result is on screen, the dice fade so the play stands out. */
	const resolved = $derived(dice.key === game.steps);

	// Big moments make the court react: a shake or a harder smash for a kill, a slam back toward the
	// hitter for a stuff block, and a hanging zoom with ripples for a tip kill.
	const IMPACT_MS: Record<Impact, number> = { shake: 450, smash: 700, slam: 550, tip: 1000 };
	let impact = $state<Impact | null>(null);
	$effect(() => {
		const next = moment?.impact;
		if (!next || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		impact = next;
		const stop = setTimeout(() => (impact = null), IMPACT_MS[next]);
		return () => clearTimeout(stop);
	});
	/** A stuff block jolts the court toward the hitter's side: down for A (bottom), up for B. */
	const slamDir = $derived(a?.team === 'B' ? -1 : 1);

	// Intended shot: dashed, from the hitter to the called zone. Actual shot: solid, to where it landed.
	// A line shot runs straight down the sideline, so both arrows start on that line too.
	const shot = $derived.by(() => {
		if (!a || !calledShot) return null;
		const d = other(a.team);
		const intended = shotPoint(d, TARGET[calledShot], calledShot);
		const hitter = zoneCenter(a.team, pos[a.team][a.hitter]);
		return {
			from: calledShot === 'line' ? { x: intended.x, y: hitter.y } : hitter,
			intended,
			actual: a.landing && !stopped ? shotPoint(d, a.landing, calledShot) : null
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
	<div class="stage {impact ?? ''}" style:--slam-dir={slamDir}>
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
					class:landing={team === defending && zone === a?.landing && !stopped}
					x={b.x}
					y={b.y}
					width={b.w}
					height={b.h}
				/>
				<text class="zone-label" x={b.x + 6} y={b.y + 14}>{zone}</text>
			{/each}
		{/each}

		{#if defending && covers}
			{#each SHOTS as s (s)}
				{@const b = zoneBox(defending, TARGET[s])}
				{@const tag = tagAt(defending, s)}
				<rect class="cover {covers[s]}" x={b.x + 1} y={b.y + 1} width={b.w - 2} height={b.h - 2} />
				<text class="cover-tag {covers[s]}" x={tag.x} y={tag.y}>
					<tspan class="shot-name">{s}</tspan>
					<tspan x={tag.x} dy="13">{COVER_WORD[covers[s]]}</tspan>
				</text>
			{/each}
		{:else if defending && onshot}
			{#each SHOTS as s (s)}
				{@const tag = tagAt(defending, s)}
				<text class="cover-tag pick" x={tag.x} y={tag.y}>{s}</text>
			{/each}
		{/if}

		{#if defending && target}
			{@const t = zoneBox(defending, target)}
			<rect class="target" x={t.x + 3} y={t.y + 3} width={t.w - 6} height={t.h - 6} rx="4" />
		{/if}

		{#if pointTo}
			{@const h = halfBox(other(pointTo))}
			{#key game.steps}
				<rect class="point-tint" x={h.x} y={h.y} width={h.w} height={h.h} />
				<rect class="point-trace" x={h.x + 1} y={h.y + 1} width={h.w - 2} height={h.h - 2} rx="3" pathLength="100" />
			{/key}
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

		<!-- This step's dice stand out while they roll; earlier dice from the possession stay faded. -->
		{#each dice.items as d, i (`${d.step}-${i}`)}
			<g class="die" class:faded={d.step !== dice.key || resolved}>
				<Die value={d.die} label={d.label} x={d.x} y={d.y} />
			</g>
		{/each}

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
				<circle class="impact" class:big={moment?.impact === 'smash'} cx={ballSpot.x} cy={ballSpot.y} r="10" />
				<!-- A tip lands softly: rings spread out from where it drops. -->
				{#if moment?.impact === 'tip'}
					{#each [0, 1, 2] as i (i)}
						<circle class="ripple" style:animation-delay="{250 + i * 180}ms" cx={ballSpot.x} cy={ballSpot.y} r="8" />
					{/each}
				{/if}
			{/key}
		{/if}

		{#each earlier as path, i (i)}
			<path class="trail earlier" d={path} />
		{/each}
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
		<!-- A yellow-and-blue beach ball, drawn at radius 7, shown at 9 and scaled up as it rises. -->
		<g class="ball" transform="translate({ball.x} {ball.y}) scale({1.3 + ball.height / 126})">
			<circle r="7" />
			<path d="M-6.2 -3.2 Q0 -1 6.2 -3.2 M-4.5 5.3 Q-1 0 0 -7 M4.5 5.3 Q1 0 0 -7" />
		</g>

		{#if defending && onshot}
			{#each SHOTS as s (s)}
				{@const b = zoneBox(defending, TARGET[s])}
				<rect
					class="pick-zone"
					role="button"
					tabindex="0"
					aria-label="Hit {s}"
					x={b.x}
					y={b.y}
					width={b.w}
					height={b.h}
					onclick={() => onshot(s)}
					onkeydown={(e) => {
						if (e.key !== 'Enter' && e.key !== ' ') return;
						e.preventDefault();
						e.stopPropagation();
						onshot(s);
					}}
					onmouseenter={() => onpreview(s)}
					onmouseleave={() => onpreview(null)}
					onfocus={() => onpreview(s)}
					onblur={() => onpreview(null)}
				/>
			{/each}
		{/if}
	</svg>
	<CalloutView callout={moment} top={moment ? calloutTop(moment.team, pos) : 50} />
	</div>
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
		max-width: max(var(--court-min, 260px), calc((100dvh - var(--chrome-h, 220px)) * 300 / 560));
		margin: 0 auto;
	}
	.shake {
		animation: shake 450ms ease-out;
	}
	/* A crushing kill: a punch-in, then a bigger, longer shake. */
	.smash {
		animation: smash 700ms cubic-bezier(0.2, 0.8, 0.3, 1);
	}
	@keyframes smash {
		8% {
			transform: scale(1.035);
		}
		18% {
			transform: translate(-11px, 6px) rotate(-1.1deg) scale(1.02);
		}
		30% {
			transform: translate(10px, -5px) rotate(1deg);
		}
		42% {
			transform: translate(-7px, 4px) rotate(-0.6deg);
		}
		56% {
			transform: translate(5px, -2px) rotate(0.3deg);
		}
		72% {
			transform: translate(-2px, 1px);
		}
	}
	/* A stuff block: the court jolts back toward the hitter, then settles, and the net flashes. */
	.slam {
		animation: slam 550ms ease-out;
	}
	@keyframes slam {
		10% {
			transform: translateY(calc(var(--slam-dir) * 14px)) scale(1.025);
		}
		26% {
			transform: translateY(calc(var(--slam-dir) * -6px));
		}
		44% {
			transform: translate(3px, calc(var(--slam-dir) * 4px));
		}
		64% {
			transform: translate(-2px, calc(var(--slam-dir) * -2px));
		}
	}
	.slam .net {
		animation: net-flash 550ms ease-out;
	}
	@keyframes net-flash {
		15% {
			fill: var(--block);
			filter: drop-shadow(0 0 4px var(--block)) drop-shadow(0 0 10px var(--block));
		}
	}
	/* A tip kill: the court leans in and hangs for a beat, like slow motion, then lets go. */
	.tip {
		animation: tip-hang 1000ms cubic-bezier(0.3, 0, 0.2, 1);
	}
	@keyframes tip-hang {
		30% {
			transform: scale(1.045) rotate(0.4deg);
		}
		60% {
			transform: scale(1.045) rotate(0.4deg);
		}
		75% {
			transform: scale(0.99);
		}
	}
	.ripple {
		fill: none;
		stroke: var(--actual);
		stroke-width: 1.5;
		opacity: 0;
		transform-box: fill-box;
		transform-origin: center;
		animation: ripple 1100ms ease-out forwards;
	}
	@keyframes ripple {
		from {
			transform: scale(0.5);
			opacity: 0.9;
		}
		to {
			transform: scale(5);
			opacity: 0;
		}
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
	/* A rect's outline starts at its top-left corner and runs clockwise, so drawing it in reads as a sweep. */
	.point-trace {
		fill: none;
		stroke: var(--point);
		stroke-width: 1.25;
		stroke-linecap: round;
		stroke-dasharray: 100;
		stroke-dashoffset: 100;
		filter: drop-shadow(0 0 2px var(--point)) drop-shadow(0 0 5px var(--point));
		animation: trace 1100ms ease-in-out forwards;
	}
	.point-tint {
		fill: var(--point);
		opacity: 0;
		animation: tint 1100ms ease-out forwards;
	}
	@keyframes trace {
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes tint {
		to {
			opacity: 0.06;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.point-trace {
			animation: none;
			stroke-dashoffset: 0;
		}
		.point-tint {
			animation: none;
			opacity: 0.06;
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
	.impact.big {
		stroke-width: 4;
		animation-name: impact-big;
		animation-duration: 900ms;
	}
	@keyframes impact-big {
		from {
			transform: scale(0.4);
			opacity: 1;
		}
		to {
			transform: scale(7);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.impact,
		.ripple {
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
	.die {
		transition: opacity 400ms;
	}
	.die.faded {
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
	/* Where the ball actually went: solid, since dashed lines are only for the shot that was called. */
	.trail {
		fill: none;
		stroke: var(--actual);
		stroke-width: 1.25;
		stroke-linecap: round;
		animation: trail 1200ms ease-out forwards;
	}
	.trail.earlier {
		animation: none;
		opacity: 0.35;
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
	.ball circle {
		fill: var(--ball);
		stroke: var(--ball-edge);
		stroke-width: 1.3;
	}
	.ball path {
		fill: none;
		stroke: var(--ball-panel);
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.cover {
		opacity: 0.6;
	}
	.cover.blocked,
	.cover.read {
		fill: var(--covered-bg);
	}
	.cover.open {
		fill: var(--open-bg);
	}
	.cover-tag {
		font-size: 11px;
		font-weight: 800;
		text-anchor: middle;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		pointer-events: none;
	}
	.cover-tag.blocked,
	.cover-tag.read {
		fill: var(--covered);
	}
	.cover-tag.open {
		fill: var(--open);
	}
	.shot-name {
		font-size: 9px;
		font-weight: 600;
	}
	.cover-tag.pick {
		fill: var(--muted);
	}
	.pick-zone {
		fill: transparent;
		cursor: pointer;
		outline: none;
	}
	.pick-zone:hover,
	.pick-zone:focus-visible {
		fill: var(--actual);
		fill-opacity: 0.12;
		stroke: var(--actual);
		stroke-width: 2;
	}
</style>
