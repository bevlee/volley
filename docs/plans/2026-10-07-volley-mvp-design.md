# Volley MVP — Design

Date: 2026-10-07
Ruleset: [Volleyball Co-op Dice Game — MVP Ruleset](https://claude.ai/artifact/2SRaYX8R1SwZRLXBABADZw)
Status: deferred. The MVP is now the [beach 2v2 design](2026-10-07-volley-beach-mvp-design.md).

A single-page SvelteKit + TypeScript app that plays a full game to 25 between two teams. In this first build every decision is chosen at random and every roll is a seeded d6, so games can be watched step by step, replayed by seed, and simulated in bulk to tune the numbers.

This doc records the decisions made on top of the ruleset. Where it differs from the ruleset, this doc wins.

## Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | SvelteKit, TypeScript, Svelte 5 runes | One route |
| Game logic | Plain TS engine in `src/lib/engine/`, no Svelte imports | Hand-rolled phase switch; can port to XState later |
| Rendering | SVG court | Chosen over CSS grid so a ball path can be added later; over Pixi as overkill |
| Styling | Svelte scoped CSS + a few CSS variables | Pico.css (~10 KB gz) can be added later with one import |
| State | One `$state` game object | No store library |
| Tests | Vitest on the engine | UI checked by hand in the browser |

## Architecture

```
src/lib/engine/
  types.ts      Game, Team, Player, Phase, Event types
  config.ts     every tunable number
  rng.ts        seeded RNG (mulberry32) + scripted RNG for tests
  rules.ts      pure formulas: ladder, power, accuracy, block, reach, dig
  choosers.ts   decisions (setter pick, block commits, defender zones, called target); random for now
  rally.ts      step(game, rng, choosers) -> game; the phase switch, scoring, rotation
src/lib/ui/
  Scoreboard.svelte, Controls.svelte, Court.svelte, PlayerChip.svelte, RallyLog.svelte
src/routes/+page.svelte
```

- Controls call `rally.ts` only. `rally.ts` reads/writes the one `Game` object. Scoreboard, Court and RallyLog only read it.
- `rules.ts` holds no state and makes no decisions: it resolves numbers.
- `choosers.ts` is an interface. Random choosers come first; a human UI or scripted AI team implements the same interface later, which satisfies the ruleset's "opponent works the same" requirement.
- RNG is injected everywhere. The same seed replays the same game exactly.

## Game state

`Game` holds: both teams (six players each, with role, Attack, Defense), each team's rotation (who is in zones 1–6), scores, `servingTeam`, `phase` (a discriminated union carrying that phase's data), `log: Event[]`, `seed`, and `winner`.

## Setup and rotation

- Starting lineup, both teams: zone 1 S, 2 OH, 3 MB, 4 OPP, 5 OH, 6 MB.
- Zones follow the standard court layout: front row 4-3-2, back row 5-6-1 (from the team's own view). Team B is mirrored on screen.
- Stats: Attack and Defense each random 3–6 per player, from the seed. Progression is out of scope.
- No serve. The team that won the last point is "serving"; the other team starts the rally with a free-ball first touch. First rally: Team A receives.
- Side-out: if the receiving team wins the point, it rotates clockwise (2→1, 1→6, 6→5, 5→4, 4→3, 3→2) and becomes the serving team.
- Game to 25, win by 2.

### Who does what in a rotation

- **Hitters:** front-row players (zones 2–4) except the setter. Three hitters when the setter is back row, two when front row. No back-row attacks.
- **Blockers:** whoever is in zones 2–4, setter included.
- **Defenders (dig):** the three back-row players commit to a zone. Front-row players are at the net and only count toward the half pool.
- **Setter:** always sets, even after taking the dig.
- **Position modifiers follow role, not zone.** A middle in zone 4 still hits as a middle.

## Rally flow

`rallyStart → firstTouch → set → commit → hit → block → dig → (other side's firstTouch | point)`

Points end via shank, guaranteed kill, stuff, or kill. A block touch or a successful dig sends the ball to the other side's first touch. Every point passes through rotation (only applied on side-out) and then either a new rally or game over.

## Formulas

All divisions round down. All thresholds live in `config.ts`.

**Touch ladder.** `total = d6 + incoming modifier`, then read the modifier for the next touch:

| Total | Modifier |
| --- | --- |
| 6 or more | +2 |
| 4–5 | 0 |
| 3 | −1 |
| 2 | −2 |
| 1 or less | total − 4 (1 → −3, 0 → −4, …) |

Negatives carry with no floor.

**First touch.** Free ball or easy ball: a plain d6 on the ladder. After a successful dig: the main defender's dig d6 on the ladder. Gives `firstMod`.

**Set.** `d6 + firstMod` on the ladder. Gives `setMod`. The setter's Attack does not enter the set; it goes into accuracy.

**Commit.** The setter secretly picks a hitter; each blocker secretly picks a hitter; revealed together. Defenders pick zones; the hitter calls a target zone (1–6 on the opposing court).

**Power.**
- Hitter's power = hitter Attack + d6 + `setMod` + position modifier (to power).
- Team attack total = hitter's power + half of the sum of the other five players' (Attack + d6).

**Position modifiers** (by number of blockers who picked this hitter):

| Role | 0 blockers | 1 blocker | 2+ blockers |
| --- | --- | --- | --- |
| Outside | 0 | 0 | 0 |
| Middle | +5 power | +5 block | +5 block |
| Opposite | +2 power | +2 power | −4 power |

**Accuracy (changed from the ruleset).**
`accuracy = d6 + firstMod + setMod + setter Attack`

| Accuracy | Ball goes to |
| --- | --- |
| 9 or more | The called zone |
| 6–8 | A zone adjacent to the called one (one step across or front/back) that has a defender. If none is adjacent, the nearest defended zone. Ties pick at random. |
| 5 or less | Easy ball: the other team takes it as a free-ball first touch |

**Guaranteed kill.** Natural 6 on the set and natural 6 on the power die: point, no block or dig.

**Shank.** Two natural 1s on consecutive touches (first touch then set, or set then a hit die): point to the other team. Raw dice, not totals.

**Block.**
- Block total = sum of (Defense + d6) for blockers who picked the hitter + half of the sum of the other blockers' (Defense + d6) + middle bonus if any.
- `block − attack ≥ 3` → **stuff**, point to blockers.
- `attack − block ≥ 3` → **clean**, ball goes to the dig at full team attack total.
- Otherwise → **touch**: ball goes to the blocking side at half the team attack total. The block touch is not counted as a touch; the blocking side then digs it against that half value at the landing zone from accuracy.

**Dig.**
- Reach from a defender's committed zone to the landing zone: same zone ×1, one step ×0.5, further ×0.25.
- Each back-row defender's score = Defense × reach + d6. The highest is the main defender.
- Dig total = main defender's score (×2 if they committed to the landing zone) + half of the sum of the other five players' (Defense + d6).
- Dig total ≥ incoming power → ball up (ties go to the dig), becomes that side's first touch. Otherwise → **kill**.

## UI (layout A: court and log)

One page. Wide screens: court on the left, log on the right. Narrow screens: stacked.

- **Scoreboard:** `Team A 12 – 9 Team B`, serving dot, each team's rotation number, winner banner at game end.
- **Controls:** Step (one phase), Play rally, Play game, Reset (same seed, new game), New seed. Seed is shown and editable.
- **Court (SVG, fixed viewBox, scales to width):** 3×2 zones per side, net in the middle, Team B mirrored. Player chips show role, Attack/Defense, zone. During a rally: ball holder outlined, block commits shown as tags under blockers ("blocks OPP", green when correct), dig commits as dots, called zone tinted, landing zone tinted stronger, ball as a circle. Chips slide to new zones on rotation using Svelte `Tween`.
- **Rally log:** newest first. Each finished rally collapses to one line (rally number, who scored, how, score). The current rally is expanded and shows every roll, e.g. `Accuracy 2+0+2+4 = 8 → adjacent, zone 6`.

Later: animated ball path along an SVG `<path>`.

## Testing

- **Unit tests (Vitest) on `rules.ts`** with a scripted RNG that returns a given list of dice:
  - ladder values including below-1 totals
  - power with each position modifier and blocker count
  - accuracy thresholds and adjacent-zone choice
  - block outcomes at the ±3 boundaries
  - reach multipliers, main-defender pick, on-spot doubling, tie goes to dig
- **Rally tests on `rally.ts`:**
  - shank on 1-1, guaranteed kill on 6-6, stuff, kill, touch loop, dig loop
  - side-out rotation moves the right players
  - setter in front row leaves two hitters
  - game ends at 25 win by 2 (e.g. continues at 25–24)
- **Determinism:** same seed → identical event log.
- **Simulation:** play 1,000 random games headless; assert every game ends with a valid score and no errors. A `npm run sim` script prints balance numbers (kill/stuff/touch/shank rates, unblocked-middle kill rate, average rally length, share of the dig total from the pool) for tuning `config.ts`.

## Build order

1. Scaffold SvelteKit + TS + Vitest.
2. `types.ts`, `config.ts`, `rng.ts`.
3. `rules.ts` test-first.
4. `choosers.ts` and `rally.ts` (phases, scoring, rotation) test-first.
5. Simulation test and `sim` script.
6. Page shell: Scoreboard, Controls, RallyLog.
7. SVG Court, PlayerChip, rotation tween, commit and target overlays.

## Open questions (settle with play-testing)

- Pool scale: half of five teammates may outweigh the main player in dig and attack totals. Fallbacks: pool dice only, or only players adjacent to the landing zone.
- Middle +5 may be too strong; try +3.
- Is ±3 the right block margin?
- Are the accuracy thresholds 9 / 6 right with setter Attack 3–6?
- Starting stat range and progression between games.
- Setter's Attack could also feed the set roll if setters feel too weak.

## Parked for after the MVP

Serves and aces, libero, block touches deflecting back to the attacking side, setter dump, back-row attacks and deeper role identities, catch-up mechanics, human and scripted choosers, ball-path animation.
