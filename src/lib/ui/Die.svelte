<script lang="ts">
	import { ROLL_MS } from './timing';
	let { value, label, x, y }: { value: number; label: string; x: number; y: number } = $props();

	const SIZE = 20;
	const PIPS: Record<number, [number, number][]> = {
		1: [[0.5, 0.5]],
		2: [
			[0.27, 0.27],
			[0.73, 0.73]
		],
		3: [
			[0.27, 0.27],
			[0.5, 0.5],
			[0.73, 0.73]
		],
		4: [
			[0.27, 0.27],
			[0.73, 0.27],
			[0.27, 0.73],
			[0.73, 0.73]
		],
		5: [
			[0.27, 0.27],
			[0.73, 0.27],
			[0.5, 0.5],
			[0.27, 0.73],
			[0.73, 0.73]
		],
		6: [
			[0.27, 0.25],
			[0.73, 0.25],
			[0.27, 0.5],
			[0.73, 0.5],
			[0.27, 0.75],
			[0.73, 0.75]
		]
	};

	// Tumble through random faces, then settle on the real roll. The flicker is cosmetic only.
	let shown = $state(1);
	let rolling = $state(true);

	$effect(() => {
		const final = value;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			shown = final;
			rolling = false;
			return;
		}
		rolling = true;
		const flicker = setInterval(() => (shown = 1 + Math.floor(Math.random() * 6)), 70);
		const settle = setTimeout(() => {
			clearInterval(flicker);
			shown = final;
			rolling = false;
		}, ROLL_MS);
		return () => {
			clearInterval(flicker);
			clearTimeout(settle);
		};
	});
</script>

<g transform="translate({x} {y})">
	<g class="die" class:rolling class:low={!rolling && value === 1} class:high={!rolling && value === 6}>
		<rect width={SIZE} height={SIZE} rx="4" />
		{#each PIPS[shown] as [px, py], i (i)}
			<circle cx={px * SIZE} cy={py * SIZE} r="2" />
		{/each}
	</g>
	<text x={SIZE / 2} y={SIZE + 10}>{label}</text>
</g>

<style>
	.die {
		transform-box: fill-box;
		transform-origin: center;
	}
	.die.rolling {
		animation: tumble 600ms ease-out;
	}
	rect {
		fill: var(--surface);
		stroke: var(--text);
		stroke-width: 1.2;
	}
	circle {
		fill: var(--text);
	}
	.low rect {
		fill: var(--die-low);
	}
	.high rect {
		fill: var(--die-high);
	}
	text {
		font-size: 9px;
		text-anchor: middle;
		fill: var(--muted);
	}
	@keyframes tumble {
		0% {
			transform: rotate(0deg) scale(0.6);
		}
		60% {
			transform: rotate(320deg) scale(1.1);
		}
		100% {
			transform: rotate(360deg) scale(1);
		}
	}
</style>
