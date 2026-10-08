<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A centred column for the main screen and the online lobby. Choices inside use the `choice` class. */
	let { title, subtitle, back, children }: { title: string; subtitle?: string; back?: { href: string; label: string }; children: Snippet } = $props();
</script>

<main>
	{#if back}<a class="back" href={back.href}>← {back.label}</a>{/if}
	<h1>{title}</h1>
	{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
	<div class="choices">{@render children()}</div>
</main>

<style>
	main {
		max-width: 420px;
		margin: 0 auto;
		padding: 12vh 16px 32px;
		display: flex;
		flex-direction: column;
		gap: 12px;
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
	/* A big tappable card: a bold line and a muted one under it. */
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
