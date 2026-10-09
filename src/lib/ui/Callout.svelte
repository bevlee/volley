<script lang="ts">
	import type { Callout } from './story';

	/** `top` is a % of the court's height, chosen to keep clear of the players. */
	let { callout, top = 50 }: { callout: Callout | null; top?: number } = $props();
</script>

{#if callout}
	{#key callout.key}
		<!-- Sits in the half of the team it's good for, in the band furthest from any player. -->
		<div class="callout {callout.team}" class:epic={callout.epic} class:float={callout.impact === 'tip'} role="status" style:top="{top}%">
			<span class="text">{callout.text}</span>
			<span class="sub">{callout.sub}</span>
		</div>
	{/key}
{/if}

<style>
	.callout {
		position: absolute;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		pointer-events: none;
		text-align: center;
		width: max-content;
		max-width: 92%;
		/* Pops in, then stays until the next step replaces or clears it. */
		animation: pop calc(450ms * var(--pace, 1)) cubic-bezier(0.2, 0.9, 0.3, 1.2) forwards;
	}
	.text {
		font-size: clamp(1.1rem, 10cqi, 2.6rem);
		white-space: nowrap;
		font-weight: 900;
		font-style: italic;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		line-height: 1;
		-webkit-text-stroke: 1px var(--bg);
		paint-order: stroke fill;
		text-shadow:
			0 2px 0 var(--bg),
			0 4px 14px rgb(0 0 0 / 0.25);
	}
	.epic .text {
		font-size: clamp(1.3rem, 12cqi, 3.4rem);
	}
	.sub {
		font-size: 0.8rem;
		max-width: 100%;
		font-weight: 600;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}
	.A .text {
		color: var(--team-a);
	}
	.B .text {
		color: var(--team-b);
	}
	/* A tip's callout drifts down into place, like the ball, instead of punching in. */
	.float {
		animation: float calc(800ms * var(--pace, 1)) cubic-bezier(0.25, 0.8, 0.3, 1) forwards;
	}
	@keyframes float {
		0% {
			opacity: 0;
			transform: translate(-50%, -110%) scale(0.92) rotate(0deg);
		}
		60% {
			opacity: 1;
		}
		100% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1) rotate(-3deg);
		}
	}
	@keyframes pop {
		0% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.3) rotate(-6deg);
		}
		58% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1.12) rotate(-3deg);
		}
		100% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1) rotate(-3deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.callout {
			animation: none;
			transform: translate(-50%, -50%) rotate(-3deg);
		}
	}
</style>
