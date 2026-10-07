# Volley Beach MVP — Design

Date: 2026-10-07
Ruleset base: [Volleyball Co-op Dice Game — MVP Ruleset](https://claude.ai/artifact/2SRaYX8R1SwZRLXBABADZw)
Supersedes as the MVP: [indoor design](2026-10-07-volley-mvp-design.md) (kept for later)

A 2v2 beach version of the dice game, built as a single-page SvelteKit + TypeScript app. Each rally comes down to one three-way guess: the hitter picks line, cross or tip; the blocker picks line or cross; the defender plays deep or short. In this first build every choice is random and every roll is a seeded d6, so games can be stepped through, replayed by seed, and simulated in bulk.

Where this doc differs from the ruleset, this doc wins.

## Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | SvelteKit, TypeScript, Svelte 5 runes | One route |
| Game logic | Plain TS engine in `src/lib/engine/`, no Svelte imports | Hand-rolled phase switch |
| Rendering | SVG court | Leaves room for an animated ball path later |
| Styling | Svelte scoped CSS + a few CSS variables | No CSS framework |
| State | One `$state` game object | No store library |
| Tests | Vitest on the engine | UI checked by hand in the browser |

## Architecture

```
src/lib/engine/
  types.ts      Game, Team, Player, Phase, Event types
  config.ts     every tunable number (see Config)
  rng.ts        seeded RNG (mulberry32) + scripted RNG for tests
  rules.ts      pure formulas: ladder, power, tip, accuracy, landing zone, block, reach, dig
  choosers.ts   the three calls (shot, block channel, defender stance); random for now
  rally.ts      step(game, rng, choosers) -> game; phase switch and scoring
src/lib/ui/
  Scoreboard.svelte, Controls.svelte, Court.svelte, PlayerChip.svelte, RallyLog.svelte
src/routes/+page.svelte
scripts/sim.ts  headless bulk simulation that prints balance numbers
```

- Controls call `rally.ts` only. `rally.ts` reads and writes the one `Game` object. Scoreboard, Court and RallyLog only read it.
- `rules.ts` has no state and makes no decisions.
- `choosers.ts` is an interface. Random choosers come first; a human UI or scripted AI implements the same interface later.
- RNG is injected everywhere. The same seed replays the same game exactly.

## Teams and court

- Two players per side, each with **Attack** and **Defense**, random 3–6 from the seed. No positions, no rotation, no substitutions.
- Each team has a designated **blocker** (player 1) and **defender** (player 2).
- The court keeps the six zones per side: front row 4-3-2, back row 5-6-1 (from the team's own view). Team B is mirrored on screen.
- **Every attack comes from the attacker's left.** On the defending side that makes:

```
            net
   4    |   3    |   2
   5    |   6    |   1
 cross             line
```

| Shot | Target zone | Can be blocked |
| --- | --- | --- |
| Line | 1 (deep line) | Yes, if the blocker took line |
| Cross | 5 (deep cross) | Yes, if the blocker took cross |
| Tip | 3 (short middle) | Never |

## Who plays each touch

- **First touch:** after a dig, the defender who dug. After a free ball, an easy ball or a block touch, the blocker (free balls always land in the blocker's spot). So the defender hits in transition and the blocker hits off free balls.
- **Set:** the partner of whoever took the first touch.
- **Hit:** the player who took the first touch.

## Serving and scoring

- The team that won the last point serves. The server holds the ball in their back court (zone 1); the Serve step sends it over to the receiving team's passer. There's no serve roll yet, so every serve is passed. First rally: B serves, A receives.
- Servers alternate within a team: each time a team wins the serve back (a side-out), its other player serves. B2 serves first; A1 serves A's first serve.
- No rotation and no side switches.
- Game to 21, win by 2.

## Rally flow

`serve → pass → set → calls → hit (attackers, blocker and defender all roll) → dug → set on the other side … | point`

- **Calls** are made after the set and revealed together: the hitter picks line, cross or tip; the blocker picks line or cross; the defender picks deep or short.
- **Deep** means deep in the channel the blocker isn't covering (zone 1 if the block is on cross, zone 5 if the block is on line). **Short** means zone 3.
- Points end on a shank, guaranteed kill, stuff, kill, or a dig that falls short. A block touch or an easy ball turns into a free ball for the other side. A successful dig becomes that side's first touch.
- **The hit is one step.** The attackers roll power, pool and aim, and in the same step the blocker rolls (only if the shot goes into the block) and the defender rolls the dig (only if the ball reaches them). A successful dig leaves the court on the dug ball; the next step turns the digger into the hitter and rolls their partner's set.

## Formulas

All divisions round down. Every number here lives in `config.ts`.

**Touch ladder.** `total = d6 + incoming modifier`, read off this table. Negatives carry with no floor.

| Total | Modifier to next touch |
| --- | --- |
| 6 or more | +2 |
| 4–5 | 0 |
| 3 | −1 |
| 2 | −2 |
| 1 or less | total − 4 |

**First touch.** Free ball: a plain d6 on the ladder. After a dig: the digger's dig d6 on the ladder. Gives `firstMod`.

**Set.** `d6 + firstMod` on the ladder. Gives `setMod`.

**Hard shot (line or cross).**
- Hitter's power = hitter Attack + d6 + `setMod`.
- Team attack = hitter's power + half of (partner Attack + d6).

**Tip.** Tip power = hitter Attack + d6 + `setMod`. No partner half, and it can't be blocked.

**Accuracy.** `accuracy = d6 + firstMod + setMod + setter's Attack`

| Accuracy | Ball lands |
| --- | --- |
| 8 or more | The target zone |
| 3–7 | The zone next to the target (one step across or front/back) that is closest to the defender |
| 2 or less | Easy ball: free ball to the other side |

Whether the block is in play depends on the shot that was called, not where a mis-hit lands.

**Guaranteed kill.** A natural 6 on the set and a natural 6 on the power die is a point. No block or dig.

**Shank.** Two natural 1s on consecutive touches (first touch then set, or set then power) lose the point. Raw dice, not totals.

**Block.** Only for a hard shot into the blocker's channel.
- Block total = blocker Defense + d6 + 3.
- Block beats team attack by 3 or more: **stuff**, point to the blockers.
- Team attack beats block by 3 or more: **clean**, the ball goes to the dig at full team attack.
- Otherwise: **touch**, a free ball to the blocking side.

**Dig.**
- Reach from the defender's zone to the landing zone: same zone ×1, one step ×½, two or more ×¼.
- Dig total = Defense × reach + d6, +1 if the defender read the shot. A read means deep against a hard shot into the open channel, or short against a tip.
- No partner pool on the dig: the partner is at the net.
- Dig total ≥ incoming power (team attack or tip power) means the ball is up. Ties go to the dig. Otherwise it's a **kill**.

## Expected balance

From a 200,000-sample check of each matchup alone (stats 3–6, ladder modifiers carried). Mis-hits drifting and transition play are not included.

| Matchup | Result for the attacker |
| --- | --- |
| Hard shot into the block | 31% stuffed · 49% touch · 21% through |
| Hard shot, defender read it | 60% kill |
| Hard shot, defender misread | 94% kill |
| Tip, defender read it | 22% kill |
| Tip, defender misread | 71% kill |
| Accuracy | 36% on target · 44% adjacent · 20% easy ball |
| Guaranteed kill | 3% of attacks |

The read of tip versus hard is the biggest swing, the block guess is second, and a correct read still leaves the attacker slightly ahead on hard shots.

## Config

| Key | Value |
| --- | --- |
| `statMin`, `statMax` | 3, 6 |
| `targetScore`, `winBy` | 21, 2 |
| `blockBonus` | 3 |
| `readBonus` | 1 |
| `blockMargin` | 3 |
| `accuracyExact`, `accuracyEasy` | 8, 2 |
| `reach` | 1, ½, ¼ |
| `partnerPoolOnAttack`, `partnerPoolOnDig` | true, false |
| `freeBallReceiver` | blocker |

## UI (layout A: court and log)

One page. Wide screens: court on the left, log on the right. Narrow screens: stacked.

- **Scoreboard:** `Team A 12 – 9 Team B`, a dot for the serving team, and a winner banner at game end.
- **Court (SVG, fixed viewBox, scales to width):** two chips per side. Players are named A1/A2 and B1/B2 (1 is the designated blocker). A chip's role label follows the play: the attacking pair show **Attacker** and **Setter**, the other side **Blocker** and **Defender**. Each chip also shows Attack and Defense. During a rally:
  - each Step plays in two beats. First every die rolled in that step tumbles on the tile where its roller is standing (labelled pass, set, power, pool, aim, block or dig; natural 1s red, 6s green). About 0.75 s later, once the dice settle, the step resolves: players move and relabel, the ball moves, and the log and score update. The dice stay on their tiles until the next step. Play rally and Play game skip the beat.
  - the hitter is outlined
  - the blocker's channel is shaded at the net
  - the defender sits in their deep or short zone
  - the called shot is a dashed arrow to a dashed-outline target zone
  - once the ball lands, a solid arrow runs to the filled landing zone
  - the ball is a circle
- **Play panel (above the court):** after the calls it previews the play in words ("A1 is going cross-court / B1 takes away the line · B2 stays deep"). After the attack it shows one line of what happened ("A1 cross-court, around the block · …") and the attack-versus-block and attack-versus-dig numbers as a tug bar with a verdict (Stuffed, Touched, Through, Saved, Dug up, Kill). Fixed height so the court never moves.
- **Callouts:** big moments pop up over the back court of the team they favour: Kill!, Crushed!, Tip kill!, Stuff block!, Roofed!, Touched!, Dig!, Dive save!, Scramble!, Huge dig!, Mis-hit!, Unstoppable!, Set error!, Hitting error!, Team X wins!. Epic ones are bigger and shake the court; a ring marks where a point lands. A stuffed ball drops on the hitter's side.
- **Player actions:** chips animate what each player did, with a word over them: spike!, tip!, stuff! / touch! / beaten (block), dig!, dive! (lunging toward the ball), too late.
- **Rally log:** newest first, in plain volleyball commentary ("Perfect pass from A1", "B1 stuffs it!", "Point Team B · stuff block · 3–4"). The dice maths is behind a "Show dice maths" toggle.
- **Controls:** the main button names the next action (Pass, Set, Call the play, Attack!, Next rally, then New game) and never runs ahead of what's on screen; Space or → also steps. Replay, New seed and the seed box sit under Options. The control bar sticks to the top when scrolling.
- **Movement order:** players move in volleyball order. The pass or dig is played where the player stands. On the Set step the setter first runs to the setting spot (zone 3), then rolls the set (unless the digger is already standing there, in which case they set from where they are). The ball stays with the passer or digger until then, and goes straight to the setter as they arrive in the middle. Only after the set does the passer or digger come up to zone 4 to hit, and the ball goes with them. Receiving formation: passer back left (5), partner back right (1).
- **Layout:** the court sizes itself to fit the window height (at least 260 px wide); score and controls stay pinned at the top; callouts sit in the band of the favoured team's half furthest from any player; dice fade once their result shows.

- **Ball flight:** the ball flies along an arc to each new spot, with a shadow on the court under it and a faint dotted trail of its path. Spikes are fast and flat, tips soft and lofted, serves long and high, passes and sets high floating balls.
- **Choosing the shot and the defence:** the player controls one team (Team A by default; "You play" under Options switches to Team B or watch only). On that team's attack the main button becomes Line / Cross / Tip (keys 1/2/3 or L/C/T), the panel explains each shot, and hovering a choice previews its arrow on the court. When the other team attacks, the player sets their defence instead: Block Line or Cross (keys 1/2) and Defender Deep or Short (keys 3/4), previewed live on the court (block bar and defender position), then Lock it in (Space, Enter or the button). The last defence is remembered as the default. The other team's calls stay random. Play rally stops when it's your call; Play game plays the rest automatically with random calls.
- **Free balls mid-rally** (block touch or mis-hit) keep the attack on screen until the Pass step, when the passer runs to their passing spot (or the middle if their partner is there) and the ball comes to them.

## Testing

- **Unit tests (Vitest) on `rules.ts`** with a scripted RNG that returns a given list of dice:
  - ladder values, including totals below 1
  - hard and tip power, with and without the partner half
  - accuracy thresholds and choosing the drift zone
  - block outcomes at the ±3 boundaries, and no block for tips or the open channel
  - reach by distance and the read bonus
  - ties going to the dig
- **Rally tests on `rally.ts`:**
  - each point ending (shank, guaranteed kill, stuff, kill)
  - a block touch and an easy ball both becoming free balls
  - the right player passing, setting and hitting
  - the game ending at 21, win by 2 (it continues at 21–20)
- **Determinism:** the same seed produces an identical event log.
- **Simulation:** 1,000 random games headless; every game ends with a valid score and no errors. `npm run sim` prints the Expected balance table from full games plus average rally length and the hitter/blocker/defender call outcomes, for tuning `config.ts`.

## Build order

1. Scaffold SvelteKit + TS + Vitest.
2. `types.ts`, `config.ts`, `rng.ts`.
3. `rules.ts`, test-first.
4. `choosers.ts` and `rally.ts`, test-first.
5. Simulation test and `sim` script; check numbers against Expected balance.
6. Page shell: Scoreboard, Controls, RallyLog.
7. SVG Court, PlayerChip, call overlays.

## Open questions (settle with play-testing)

- With the designated blocker taking free balls, the defender only hits in transition. Does that feel right, or should free balls alternate?
- The touch ladder averages about −0.7 per touch. Keep it, or rebalance it (for example 3 → 0)?
- Is ±3 the right block margin with only one blocker?
- Should accuracy drift ever be able to find an empty zone?

## Parked for after the MVP

Serves and aces, the "pull" option (blocker drops off the net), choosing the blocker each rally, attacks from the right, side switches, progression between games, human and scripted choosers, ball-path animation, and the indoor 6v6 game.
