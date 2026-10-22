<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { playRulesOf } from '#lib/ui/pageRules.ts';
	import { Toaster } from 'svelte-sonner';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// On a real navigation only, right before the new page renders: a hovered link's preload must not switch the rules.
	playRulesOf(page.route.id);
	onNavigate(({ to }) => playRulesOf(to?.route.id));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<Toaster position="top-center" theme="system" richColors />
