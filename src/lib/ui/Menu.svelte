<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A centred column for the main screen and the online lobby. Choices inside use the `choice`
	 * class. `art` goes beside the column on a wide screen and above it on a phone.
	 */
	let {
		title,
		subtitle,
		back,
		art,
		children
	}: { title: string; subtitle?: string; back?: { href: string; label: string }; art?: Snippet; children: Snippet } = $props();
</script>

<main class:with-art={!!art}>
	<div class="column">
		{#if back}<a class="back" href={back.href}>← {back.label}</a>{/if}
		<h1>{title}</h1>
		{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
		<div class="choices">{@render children()}</div>
	</div>
	{#if art}<div class="art">{@render art()}</div>{/if}
</main>

<style>
	main {
		max-width: 420px;
		margin: 0 auto;
		padding: 12vh 16px 32px;
	}
	.column {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	/* With art: the menu on the left, the art on the right, both centred on the screen. */
	main.with-art {
		max-width: 860px;
		min-height: 100dvh;
		box-sizing: border-box;
		padding: 24px 16px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: center;
		gap: 48px;
	}
	.art {
		height: min(78dvh, 620px);
	}
	/* A phone: the art above the menu, small enough that the buttons stay on screen. */
	@media (max-width: 700px) {
		main.with-art {
			grid-template-columns: minmax(0, 1fr);
			align-content: start;
			gap: 20px;
			max-width: 420px;
		}
		.art {
			order: -1;
			height: 44dvh;
		}
	}
	.back {
		align-self: flex-start;
		color: var(--muted);
		text-decoration: none;
		font-weight: 600;
	}
	.back:hover {
		color: var(--text);
	}
	h1 {
		margin: 0;
		font-size: 2.4rem;
		line-height: 1.1;
	}
	.subtitle {
		margin: 0 0 12px;
		color: var(--muted);
	}
	.choices {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	/* A big tappable card: a bold line and, sometimes, a muted one under it. */
	.choices :global(.choice) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		box-sizing: border-box;
		text-align: left;
		padding: 14px 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		text-decoration: none;
		cursor: pointer;
	}
	.choices :global(.choice:hover:not(:disabled)) {
		border-color: var(--muted);
	}
	.choices :global(.choice b) {
		font-size: 1.1rem;
	}
	.choices :global(.choice span) {
		color: var(--muted);
		font-size: 0.9rem;
	}
</style>
