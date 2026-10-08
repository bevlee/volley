<script lang="ts">
	import { onMount } from 'svelte';
	import { newGame } from '#lib/engine/rally.ts';
	import type { Slot, TeamId, Zone } from '#lib/engine/types.ts';
	import { VIEW, zoneBox, zoneCenter, type Point } from './layout';
	import PlayerChip from './PlayerChip.svelte';
	import type { Action } from './story';

	/**
	 * The home screen's court: two teams keeping a rally going for ever. Each side digs the ball, passes
	 * it to their partner at the net, and the partner sends it over; no hits, no points. Decoration
	 * only, so it's hidden from screen readers, and still for anyone who prefers reduced motion.
	 */

	const TEAMS: TeamId[] = ['A', 'B'];
	const ZONES: Zone[] = [1, 2, 3, 4, 5, 6];
	const FRONT: Zone[] = [4, 3, 2];
	const BACK: Zone[] = [5, 6, 1];
	/** Where each player waits when the ball isn't theirs. */
	const HOME: Record<Slot, Zone> = { blocker: 3, defender: 6 };

	const { teams } = newGame(Math.floor(Math.random() * 1_000_000));
	const ROLE = { blocker: 'Setter', defender: 'Defender' } as const;
	const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
	const other = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A');
	/** A spot near a zone's middle, so no two touches land in quite the same place. */
	const near = (team: TeamId, zone: Zone): Point => {
		const c = zoneCenter(team, zone);
		return { x: c.x + (Math.random() - 0.5) * 30, y: c.y + (Math.random() - 0.5) * 30 };
	};

	let spots = $state<Record<TeamId, Record<Slot, Point>>>({
		A: { blocker: zoneCenter('A', HOME.blocker), defender: zoneCenter('A', HOME.defender) },
		B: { blocker: zoneCenter('B', HOME.blocker), defender: zoneCenter('B', HOME.defender) }
	});
	let actions = $state<Record<string, { action: Action; key: number }>>({});
	/** Where the ball is played from: just in front of a player's chip, on the side toward the net. */
	const hands = (team: TeamId, p: Point): Point => ({ x: p.x, y: p.y + (team === 'A' ? -32 : 32) });

	const start = hands('B', spots.B.defender);
	let ball = $state({ ...start, height: 0 });
	let ground = $state({ ...start });

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let stopped = false;
		let frame = 0;
		let key = 0;

		/** The ball flies from where it is to `to` in a high arc. */
		const fly = (to: Point, ms: number, apex: number) =>
			new Promise<void>((done) => {
				const from = { x: ball.x, y: ball.y };
				const start = performance.now();
				const tick = (now: number) => {
					if (stopped) return;
					const t = Math.min(1, (now - start) / ms);
					const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
					const x = from.x + (to.x - from.x) * e;
					const groundY = from.y + (to.y - from.y) * e;
					const height = Math.sin(Math.PI * t) * apex;
					ball = { x, y: groundY - height, height };
					ground = { x, y: groundY + 8 };
					if (t < 1) frame = requestAnimationFrame(tick);
					else done();
				};
				frame = requestAnimationFrame(tick);
			});

		const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
		const move = (team: TeamId, slot: Slot, to: Point) => (spots[team][slot] = to);
		const act = (team: TeamId, slot: Slot, move: Action['move']) =>
			(actions[`${team}-${slot}`] = { action: { move, label: '' }, key: ++key });

		async function rally() {
			let side: TeamId = 'A';
			while (!stopped) {
				// Over the net: this side's defender runs to where it's coming down and digs it.
				const dig = near(side, pick(BACK));
				move(side, 'defender', dig);
				move(side, 'blocker', zoneCenter(side, HOME.blocker));
				await fly(hands(side, dig), 1300, 110);
				act(side, 'defender', 'dig');
				await wait(120);
				// The dig goes up to the partner at the net.
				const pass = near(side, pick(FRONT));
				move(side, 'blocker', pass);
				await fly(hands(side, pass), 1000, 80);
				move(side, 'defender', zoneCenter(side, HOME.defender));
				await wait(180);
				// And over to the other side.
				side = other(side);
				await wait(60);
			}
		}
		rally();
		return () => {
			stopped = true;
			cancelAnimationFrame(frame);
		};
	});
</script>

<svg class="court-loop" viewBox="0 0 {VIEW.width} {VIEW.height}" aria-hidden="true">
	{#each TEAMS as team (team)}
		{#each ZONES as zone (zone)}
			{@const b = zoneBox(team, zone)}
			<rect class="zone" x={b.x} y={b.y} width={b.w} height={b.h} />
		{/each}
	{/each}
	<rect class="net" x="8" y={VIEW.netY - 4} width={VIEW.width - 16} height="8" />

	{#each TEAMS as team (team)}
		{#each ['blocker', 'defender'] as const as slot (slot)}
			{@const at = spots[team][slot]}
			{@const done = actions[`${team}-${slot}`]}
			<PlayerChip
				player={teams[team][slot]}
				{team}
				role={ROLE[slot]}
				x={at.x}
				y={at.y}
				action={done?.action ?? null}
				actionKey={done?.key ?? 0}
			/>
		{/each}
	{/each}

	<ellipse class="shadow" cx={ground.x} cy={ground.y} rx={6 - ball.height / 30} ry={2.5 - ball.height / 80} opacity={0.45 - ball.height / 250} />
	<g class="ball" transform="translate({ball.x} {ball.y}) scale({1.3 + ball.height / 126})">
		<circle r="7" />
		<path d="M-6.2 -3.2 Q0 -1 6.2 -3.2 M-4.5 5.3 Q-1 0 0 -7 M4.5 5.3 Q1 0 0 -7" />
	</g>
</svg>

<style>
	.court-loop {
		display: block;
		width: 100%;
		height: 100%;
	}
	.zone {
		fill: var(--surface);
		stroke: var(--border);
		stroke-width: 1;
	}
	.net {
		fill: var(--muted);
	}
	.shadow {
		fill: var(--text);
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
</style>
