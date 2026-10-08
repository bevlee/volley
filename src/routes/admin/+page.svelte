<script lang="ts">
	import Game from '#lib/ui/Game.svelte';
</script>

<!-- The game with the debug panel: seed, who you control, play a rally or a whole game, and the log.
     It's only hidden from the main page, not protected: anyone with the URL can open it. -->
<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<Game admin />
