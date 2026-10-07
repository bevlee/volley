# Court-first UI

Picked from three mockups: "covered vs open" shading on the court, plus a slide-in debug drawer.

## Goals

- The court is the screen. Everything needed to play sits on it or directly under it.
- You can see what a call protects and what it leaves open, without reading rules first.
- Logs, dice maths and simulation controls stay one toggle away, for debugging.

## Layout

1. **Top bar**: "Volley", the score with serve dots, rally number, a **?** button (rules sheet) and a debug button (drawer).
2. **Court**: as large as the viewport allows. Callouts, dice and ball flight stay as they are.
3. **Dock under the court**: one status line (whose call it is, or what just happened), then the choices:
   - your attack: Line / Cross / Tip (the target zones on the court are also clickable);
   - your defence: Block line / cross, Dig deep / short, Lock in;
   - otherwise: the next step button (Space), or New game when it's over.
4. **Debug drawer**: slides in from the right over the court. Holds Play rally, Play game, replay, seed, "You play", the step's dice duels and the full rally log with dice maths.
5. **Rules sheet**: a dialog from **?** with the rally flow, the three calls, the covered/open idea, dice basics and keys.

## Covered vs open

For a defence (block, stance) each shot is one of:

| Shot | blocked | read (dig bonus) | open |
| --- | --- | --- | --- |
| line / cross | block matches the shot | deep, block on the other channel | short |
| tip | never | short | deep |

The court shades the defending side's target zone for each shot: red for blocked or read (labelled "covered"), green for open. It shows:

- while you choose your defence (live, as you toggle);
- once calls are revealed, for whichever side defends, so you see why the point went the way it did.

On your attack the other side's call is hidden, so the target zones show only the shot names. Hovering a shot draws its arrow, as now.

## Flow

Play only waits for the player at two points: the call, and the end of a point. Everything else plays on its own, one animated beat at a time: the serve, the pass and the set, and the set after a dig or block touch.

- At the call, the player picks a shot (or a block and dig); the pick is previewed on the court. Space reveals both sides' calls, holds for a moment, then rolls the attack.
- The pass and set dice stay on the court, faded, and the ball's path through the possession (serve, pass, set) stays as dotted lines until the attack clears them.
- Space while anything is still playing skips to where play next waits. It never commits a call.

## Who won the point

When a point ends, the half where the ball came down (the losing side: the defenders on a kill, the hitters on a block or error) gets a thin, glowing orange border drawn around it clockwise, with a faint orange tint. Orange is neutral, so it reads as "the ball landed here" rather than as a team; the callout and score say who won. It stays until the next rally.

Outcomes use one plain word each everywhere (callouts, log, score cards): Kill, Block, Block touch, Dig, Easy ball over, Error.

## Score panel

Left of the court (below the dock on a phone), one card each for the latest attack, block and dig:

- **Attack**: attack stat + power die + set quality + the setter's share (half their attack plus their set roll; not on a tip). The card shows the set's bonus to the hit ("Set +6 to the hit") and, once rolled, the total and whether it landed on target.
- **Block**: defence + die + block bonus, only when the block was in the shot's way; otherwise a one-line note on why there was no block.
- **Dig**: defence × reach + die + covered bonus.

Cards show only the result: the total and a verdict (Good hit, Stuffed, Good dig, Kill…). Hovering or focusing a card shows a short breakdown: "A2's base attack 5 · Roll 5 · Perfect set +8 (set quality +2, setter: ½ (A1's base attack 6 + set roll 6) +6) · Total 18, a covering dig is about 10". Aim is not in the short breakdown; the card says where the ball went (on target, drifts a zone, mis-hit). A "Full maths" toggle under the cards (off by default, remembered in the browser) adds what every number means and a "Where it lands" section with the aim sum. While the play is called, the attack total is `?` but the set bonus already shows. The last sheet stays up until the next ball is set.

## Quality grades

Every pass, dig, set and hit gets one word: Perfect, Good, Shaky or Poor (`src/lib/ui/grades.ts`). The log and the score panel use the words; the numbers are on hover.

- **Pass and dig:** by first-touch bonus: +2 Perfect, 0 or +1 Good, −1 Shaky, −2 Poor.
- **Set:** by set quality: +2 Perfect, 0 Good, −1 or −2 Shaky, −3 or below Poor.
- **Hit:** by attack total, around what a covering defender usually digs (about 10): 14+ Perfect, 11–13 Good, 8–10 Shaky, 7 or less Poor. Tips grade 3 lower (they never get the setter's share). A mis-hit is always Poor.

The attack card reads like "Perfect pass → Shaky set · +2 to the hit · on target", with the hit's grade and total in its header.

## Colours

Team A is blue, team B black (light grey in dark mode), so red and green are free for covered and open. The ball is yellow and blue with a dark outline.

## Out of scope

No engine or balance changes. The rules sheet text is static.
