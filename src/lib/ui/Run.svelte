<script lang="ts">
	import type { Choosers } from '#lib/engine/choosers.ts';
	import { LINEUP } from '#lib/engine/lineup.ts';
	import { lookahead } from '#lib/engine/lookahead.ts';
	import { step } from '#lib/engine/rally.ts';
	import { ABILITIES, OPPONENTS, canTake, choose, finishMatch, matchGame, newRun, useRunRules, type Run } from '#lib/engine/run.ts';
	import type { AbilityId, Game, Slot } from '#lib/engine/types.ts';
	import GameScreen from './GameScreen.svelte';
	import Menu from './Menu.svelte';
	import { playsItself } from './story.ts';

	/**
	 * A run: five matches against fixed opponents, two abilities to give out after every win, and a
	 * loss ends it. The engine runs here in the browser, and the run is kept in localStorage so a
	 * reload carries on where it was. Run games aren't saved to the history.
	 */

	useRunRules();
	/** The opponent plays its playbook with the lookahead's balanced mix. */
	const ai = lookahead(30);

	const KEY = 'volley-run';
	const randomSeed = () => Math.floor(Math.random() * 1_000_000);
	function load(): Run {
		try {
			const saved = localStorage.getItem(KEY);
			if (saved) return JSON.parse(saved) as Run;
		} catch {
			// No storage (a private window, say): a fresh run that won't survive a reload.
		}
		return newRun(randomSeed());
	}
	function save(next: Run) {
		run = next;
		try {
			localStorage.setItem(KEY, JSON.stringify(next));
		} catch {
			// Kept for this page only.
		}
	}

	const loaded = load();
	let run = $state.raw<Run>(loaded);
	/** Before a match, the match itself, or the screen after one (picks, or the end of the run). */
	let stage = $state<'intro' | 'match' | 'after'>(loaded.status === 'playing' ? 'intro' : 'after');
	let screen = $state<GameScreen>();
	let shown = $state.raw<Game>();
	const opponent = $derived(OPPONENTS[run.match]);
	const NAMES: Record<Slot, string> = { blocker: LINEUP.A.blocker.name, defender: LINEUP.A.defender.name };

	/** Who gets each offered ability, while picking. */
	let assigned = $state<Partial<Record<AbilityId, Slot>>>({});
	const SLOTS: Slot[] = ['blocker', 'defender'];
	const give = (ability: AbilityId, slot: Slot) => (assigned = { ...assigned, [ability]: slot });
	/** Every offered ability that someone can take has a player. */
	const ready = $derived(run.offer.every((id) => assigned[id] || !SLOTS.some((slot) => canTake(run, slot, id))));

	function startMatch() {
		stage = 'match';
	}

	/** Steps once with `choosers`, then everything that plays on its own, up to the next call or the end of the point. */
	function play(choosers: Choosers = ai.mixed) {
		const chain = [step(screen!.latest(), choosers)];
		let g = chain[0];
		if (g.phase.kind === 'hit') chain.push((g = step(g, ai.mixed)));
		while (playsItself(g)) chain.push((g = step(g, ai.mixed)));
		screen!.playChain(chain);
	}

	function matchOver() {
		const g = screen!.latest();
		save(finishMatch(run, g.winner === 'A'));
		assigned = {};
		stage = 'after';
	}

	function confirmPicks() {
		const picks = run.offer.flatMap((ability) => (assigned[ability] ? [{ ability, slot: assigned[ability]! }] : []));
		save(choose(run, picks));
		assigned = {};
		stage = 'intro';
	}

	function newRunNow() {
		save(newRun(randomSeed()));
		stage = 'intro';
	}

	const abilityList = (slot: Slot) => run.abilities[slot].map((id) => ABILITIES[id].name).join(', ') || 'no abilities yet';
	const attackName = (o: (typeof OPPONENTS)[number]['playbook'][number]) =>
		o.shot === 'over' ? 'dig over' : `${o.tempo === 'fast' ? 'quick' : 'high'} ${o.shot}`;
</script>

<svelte:head>
	<title>Volley · run</title>
</svelte:head>

{#if stage === 'match'}
	{#key run.match}
		<GameScreen
			bind:this={screen}
			bind:shown
			initial={matchGame(run)}
			controlled="A"
			names={{ A: 'You', B: opponent.team }}
			overLabel="Continue"
			onadvance={() => play()}
			onshot={(shot, extra) => play({ ...ai.mixed, shot: () => shot, tempo: (g, t, r) => extra?.tempo ?? ai.mixed.tempo!(g, t, r) })}
			ondefence={(d) =>
				play({ ...ai.mixed, block: () => d.block, stance: () => d.stance, blockMode: () => d.blockMode ?? 'commit' })}
			onover={matchOver}
		>
			{#snippet banner()}
				<p class="banner">
					Match {run.match + 1} of {OPPONENTS.length} · {opponent.team}
					<span>{NAMES.blocker}: {abilityList('blocker')} · {NAMES.defender}: {abilityList('defender')}</span>
				</p>
			{/snippet}
		</GameScreen>
	{/key}
{:else if stage === 'intro'}
	<Menu title="Match {run.match + 1} of {OPPONENTS.length}" subtitle="vs {opponent.team}" back={{ href: '/', label: 'Volley' }}>
		<div class="card">
			<b>{opponent.adds}</b>
			<span>{opponent.lesson}</span>
			<span class="muted">They attack with: {opponent.playbook.map(attackName).join(', ')}.</span>
		</div>
		<div class="card">
			<b>Your team</b>
			<span>{NAMES.blocker}: {abilityList('blocker')}</span>
			<span>{NAMES.defender}: {abilityList('defender')}</span>
			<span class="muted">Everyone can hit high line (off a set of ±0 or better), high cross, and dig it over. Abilities add the rest.</span>
		</div>
		<button class="choice" onclick={startMatch}><b>Play</b><span>First to 7, win by 2. Lose and the run is over.</span></button>
	</Menu>
{:else if run.status === 'picking'}
	<Menu title="You beat {OPPONENTS[run.match].team}" subtitle="Pick who gets each ability. Both can go to one player.">
		{#each run.offer as id (id)}
			{@const ability = ABILITIES[id]}
			<div class="card">
				<b>{ability.name} <small>{ability.role}</small></b>
				<span>{ability.text}</span>
				<span class="muted">Suits {ability.suits}.</span>
				<div class="who" role="group" aria-label="Give {ability.name} to">
					{#each SLOTS as slot (slot)}
						<button class:on={assigned[id] === slot} disabled={!canTake(run, slot, id)} onclick={() => give(id, slot)}>
							{NAMES[slot]}
						</button>
					{/each}
				</div>
			</div>
		{/each}
		<button class="choice" disabled={!ready} onclick={confirmPicks}>
			<b>On to match {run.match + 2}</b><span>vs {OPPONENTS[run.match + 1].team}</span>
		</button>
	</Menu>
{:else}
	<Menu
		title={run.status === 'won' ? 'Run won!' : `Out in match ${run.match + 1}`}
		subtitle={run.status === 'won' ? `You beat all ${OPPONENTS.length}.` : `${OPPONENTS[run.match].team} beat you.`}
		back={{ href: '/', label: 'Volley' }}
	>
		<div class="card">
			<b>Your team</b>
			<span>{NAMES.blocker}: {abilityList('blocker')}</span>
			<span>{NAMES.defender}: {abilityList('defender')}</span>
		</div>
		<button class="choice" onclick={newRunNow}><b>New run</b><span>Back to match 1 with a fresh team.</span></button>
	</Menu>
{/if}

<style>
	.banner {
		margin: 0;
		padding: 4px 8px;
		text-align: center;
		font-size: 0.85rem;
		font-weight: 700;
	}
	.banner span {
		display: block;
		font-weight: 400;
		color: var(--muted);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.card small {
		font-weight: 400;
		color: var(--muted);
		margin-left: 6px;
	}
	.muted {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.who {
		display: flex;
		gap: 8px;
		margin-top: 6px;
	}
	.who button {
		flex: 1;
	}
	.who .on {
		background: var(--block);
		border-color: var(--block);
		color: var(--bg);
		font-weight: 700;
	}
</style>
