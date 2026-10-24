<script lang="ts">
	import type { TempoBanner } from './tempo';

	/** Advanced mode, over the court: the tempo the set made, which both sides see before anyone calls. */
	let { banner }: { banner: TempoBanner } = $props();
</script>

<div class="banner" aria-live="polite">
	<span class="chip {banner.tempo ?? 'none'}">{banner.label}</span>
	<span class="text"><b>{banner.lead}</b> {banner.text}</span>
</div>

<style>
	.banner {
		display: flex;
		align-items: center;
		gap: 10px;
		box-sizing: border-box;
		/* Two lines' worth, so the court doesn't change size as the text does. */
		min-height: 52px;
		margin: 0 0 8px;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--text);
		color: var(--bg);
	}
	.chip {
		flex: none;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-radius: 4px;
		padding: 3px 7px;
		color: #fff;
		background: var(--muted);
	}
	.chip.fast {
		background: var(--team-a);
	}
	.chip.high {
		background: var(--actual);
	}
	@media (prefers-color-scheme: dark) {
		.chip.fast,
		.chip.high {
			color: var(--bg);
		}
	}
	.text {
		font-size: 13px;
		line-height: 1.3;
	}
</style>
