# Run mode: five matches, one team that grows

A single-player run of five matches against fixed opponents. Each opponent attacks in one more way than the last, so each match teaches one defensive read. After every win you pick two abilities and give each to Hinata or Nishinoya; a loss ends the run. Your pair starts with only the basics and becomes a team of specialists by the last match.

## Goals

- Teach the game one idea at a time: defend deep, then read cross, then line, then quick sets.
- Growth that changes how a player plays, not just their numbers: abilities bend one rule for one player, usually at a cost.
- Short: five games to 7, about as long as a few normal games.
- Opponents that play their few attacks well, so a match is tense even when you know what's coming.
- The normal game, online play and saved replays don't change.

## Not doing (yet)

- Online runs, or bringing a run team into versus play.
- Saving runs to the server: a run lives in the browser (`localStorage`) and is lost with it.
- Special charges (pips) and aimed serves in runs. Both stay sim-only experiments for now.
- Choosing your pair, or opponents that change between runs.

## The run

| Match | Opponent attacks with | You learn to |
|---|---|---|
| 1 | Dig over (a soft ball sent deep, no swing) | Defend deep, and win points on your own attack |
| 2 | + High cross | Commit the block to cross |
| 3 | + High line | Guess line or cross |
| 4 | + Quick cross | Beat a fast set: commit or dig, reading is too slow |
| 5 | + Quick line | All of it |

Each opponent picks among its attacks with the lookahead player (the balanced, equilibrium mix), limited to its playbook. Opponent stats are tuned with the sim so a decent player wins match 1 most of the time and match 5 a bit over half the time.

A loss ends the run. Winning match 5 wins it.

## Your team's kit

Every player starts able to hit **high line** (off a set of ±0 or better, as in the gating sims), **high cross** and **dig over**. **Tip** and **quick** sets are abilities. On defence, every block mode is open from the start: commit to a channel, read (start on a channel, maybe get across), or no block (help the dig).

## Abilities

After each win you're offered two, drawn at random from the ones still open (an ability can be offered while either player lacks it, and some need another first). Give each to either player, or both to one.

An ability works whenever its player is in that role: an attacking ability when they hit, a setting one when they set, a blocking one when they block, a digging one when they dig. In beach the passer hits and the partner sets, so roles change every rally.

| Ability | Role | Effect |
|---|---|---|
| Tip | Hit | Can tip. |
| Quick | Hit | Can hit quick sets (line or cross) off a set of ±0 or better. Fast sets are harder to aim (−2) and hard to read. |
| Scrappy quick (needs Quick) | Hit | Quick sets off sets down to −2, with another −2 to aim when the set is below ±0. |
| Line specialist | Hit | Line off sets down to −1. |
| Heavy hitter | Hit | +1 power, −1 aim. |
| Tool the block | Hit | When the block only touches the ball, a 5 or 6 knocks it off the hands and out: point. |
| Libero instincts | Dig, set | +2 to digs, but this player's sets are never better than ±0 (they don't get back to the net in time). |
| Read blocker | Block | A read block against a high set gets the full commit bonus. |
| Wall | Block | +1 to committed blocks; can't read. |
| Pancake | Dig | A ball one zone away is dug at ¾ reach instead of ½. |

## Dig over

A new shot for both sides: no swing, just a soft ball sent deep. It can't be blocked. Its power is low (3 + a d6, with no set or setter bonus). A defender playing deep is there (full reach) and has read it (+3, like a short defender reading a tip); one playing short has to turn and chase it (a quarter reach). It's the bail-out on a bad set, and the whole of the first opponent's attack: always playing short against it loses that match about 3 times in 4.

## Engine changes

- **What a player can hit depends on who they are.** `availableShots(setMod)` becomes `attackOptions(game)`: the shot and tempo pairs the hitter can use off this set, from their team's playbook (opponents) or the run kit plus their abilities (your team), or every shot as now (normal games). The random computer player, the lookahead players and the engine's check all use it.
- **Defence options likewise** (`defenceOptions(game)`): Wall takes away reading.
- **Players carry abilities, teams carry a playbook** (both optional on the existing types). A run game is an ordinary `Game` with these filled in, so the engine, sims and court need nothing else.
- **Ability effects** are small hooks where the numbers are added: power and aim (hitter), set ceiling (setter), block bonus (blocker), reach and dig bonus (digger), and a block-out roll for Tool the block.
- **`over` joins the shots**, with its own target, power and read rule.
- Run games need set tempos and block modes on (`config.blockModes`), and line gating at ±0.

## The run module and screens

- `src/lib/engine/run.ts`: the five opponents (names, stats, playbooks), the ability list, drawing offers, and building each match's game from the run so far. Pure and seeded, so it can be tested and simulated.
- `/run`: the run screen. Before a match, the opponent and what's new about them. The match itself is the normal game screen, with your attack choices limited to what the hitter can do and the defence choices including block modes. After a win, two ability cards and a pick of player for each. After a loss or the final win, the result and a new run.
- Run games aren't saved to the history: replays don't know these rules.

## Tuning with the sim

`npm run sim:run` plays each match many times with a balanced player against the opponent, with the team the run would have by then (random picks), and reports the win rate per match. Opponent stats get tuned until the curve looks right.
