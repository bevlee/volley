import { randomChoosers, type Choosers } from './choosers';
import { config } from './config';
import { LINEUP, type Lineup } from './lineup';
import { d6, mulberry32, pick, type Rng, type SeededRng } from './rng';
import * as rules from './rules';
import type { Game, LogEntry, Player, PointKind, RollLabel, Slot, Team, TeamId } from './types';

export const other = (team: TeamId): TeamId => (team === 'A' ? 'B' : 'A');
export const partner = (slot: Slot): Slot => (slot === 'blocker' ? 'defender' : 'blocker');

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const plus = (n: number) => (n >= 0 ? ` + ${n}` : ` − ${-n}`);

/** A new game between the players in `lineup` (the Haikyu!! four by default). The seed decides the dice. */
export function newGame(seed: number, lineup: Lineup = LINEUP): Game {
	const rng = mulberry32(seed);
	const player = (team: TeamId, slot: Slot): Player => ({ ...lineup[team][slot], slot });
	const team = (id: TeamId): Team => ({
		id,
		blocker: player(id, 'blocker'),
		defender: player(id, 'defender')
	});
	const teams = { A: team('A'), B: team('B') };
	// B serves first, from its defender.
	const server = teams.B.defender.name;
	return {
		seed,
		rngState: rng.state,
		teams,
		score: { A: 0, B: 0 },
		serving: 'B',
		servers: { A: 'defender', B: 'defender' },
		rally: 1,
		phase: { kind: 'serve', team: 'B' },
		attack: null,
		log: [{ rally: 1, text: `${server} to serve`, tag: 'rallyStart', data: { team: 'B', player: server } }],
		logStart: 0,
		rolls: [],
		steps: 0,
		winner: null
	};
}

/** Advance one phase. Pass `rng` only in tests; otherwise the game's own seeded state is used and saved. */
export const step = (game: Game, choosers = randomChoosers, rng?: Rng) =>
	run(game, 1, () => true, choosers, rng);

/** Advance until the current rally's point is scored. */
export const playRally = (game: Game, choosers = randomChoosers, rng?: Rng) =>
	run(game, 10_000, (g) => g.phase.kind === 'pointOver', choosers, rng);

/** Advance until the game is won. */
export const playGame = (game: Game, choosers = randomChoosers, rng?: Rng) =>
	run(game, 1_000_000, () => false, choosers, rng);

function run(
	game: Game,
	maxSteps: number,
	stop: (g: Game) => boolean,
	choosers: Choosers,
	rng?: Rng
): Game {
	const g = structuredClone(game);
	const r = rng ?? mulberry32(g.rngState);
	for (let i = 0; i < maxSteps && g.phase.kind !== 'gameOver'; i++) {
		advance(g, choosers, r);
		if (stop(g)) break;
	}
	if (!rng) g.rngState = (r as SeededRng).state;
	return g;
}

function advance(g: Game, choosers: Choosers, rng: Rng): void {
	if (g.phase.kind === 'gameOver') return;
	g.steps++;
	g.rolls = [];
	g.logStart = g.log.length;
	const roll = (team: TeamId, slot: Slot, label: RollLabel) => {
		const die = d6(rng);
		g.rolls.push({ team, slot, die, label });
		return die;
	};
	const log = (text: string, tag?: string, data?: LogEntry['data']) =>
		g.log.push({ rally: g.rally, text, tag, data });
	const phase = g.phase;
	/** Adds a player's special charges for their great or perfect touch, up to the cap. */
	const charge = (team: TeamId, slot: Slot, pips: number, touch: string) => {
		if (!config.specials || pips === 0) return;
		g.pips ??= { A: { blocker: 0, defender: 0 }, B: { blocker: 0, defender: 0 } };
		const player = g.teams[team][slot].name;
		const before = g.pips[team][slot];
		const after = Math.min(config.maxPips, before + pips);
		g.pips[team][slot] = after;
		log(`${touch} by ${player} · charges ${after}/${config.maxPips}`, 'pips', {
			team,
			slot,
			player,
			gained: after - before,
			wasted: before + pips - after,
			pips: after
		});
	};
	const set = () => {
		const a = g.attack!;
		const setter = g.teams[a.team][partner(a.hitter)];
		const die = roll(a.team, partner(a.hitter), 'set');
		a.setDie = die;
		// Setter's touch: more great sets (the natural die still counts for a hitting error).
		const setRoll = rules.has(setter, 'settersTouch') && die >= config.abilities.settersTouchFrom && die < 6 ? die + 1 : die;
		a.setMod = rules.ladder(setRoll + a.firstMod);
		log(`${setter.name} sets · d6 ${die}${setRoll !== die ? ` (as ${setRoll})` : ''}${plus(a.firstMod)} → ${signed(a.setMod)}`, 'set', {
			team: a.team,
			player: setter.name,
			die,
			mod: a.setMod,
			source: a.source
		});
		if (rules.isShank(a.firstDie, die)) return scorePoint(g, other(a.team), 'shank', 'two natural 1s');
		charge(a.team, partner(a.hitter), rules.setPips(a.setMod), 'Great set');
		g.phase = { kind: 'calls' };
	};

	switch (phase.kind) {
		case 'pointOver': {
			g.rally++;
			g.attack = null;
			const server = g.teams[g.serving][g.servers[g.serving]].name;
			g.phase = { kind: 'serve', team: g.serving };
			log(`${server} to serve`, 'rallyStart', { team: g.serving, player: server });
			return;
		}

		case 'serve': {
			// No serve roll yet: the serve always comes over for the other side to pass.
			const server = g.teams[phase.team][g.servers[phase.team]].name;
			const receiving = other(phase.team);
			if (!config.serveTargets) {
				log(`${server} serves to ${receiving}`, 'serve', { team: phase.team, player: server, receiving });
				g.phase = { kind: 'freeBall', team: receiving };
				return;
			}
			const target = (choosers.serve ?? randomChoosers.serve!)(g, phase.team, rng);
			const seam = target === 'seam';
			// Into the seam, either receiver might end up with it.
			const receiver = seam ? pick(rng, ['blocker', 'defender'] as const) : target;
			const passer = g.teams[receiving][receiver].name;
			log(`${server} serves ${seam ? `the seam, ${passer} takes it` : `at ${passer}`}`, 'serve', {
				team: phase.team,
				player: server,
				receiving,
				target,
				receiver
			});
			g.phase = { kind: 'freeBall', team: receiving, receiver, seam };
			return;
		}

		case 'freeBall': {
			const slot = phase.receiver ?? config.freeBallReceiver;
			const die = roll(phase.team, slot, 'pass');
			const passer = g.teams[phase.team][slot].name;
			// Steady passer reads the pass roll higher (the natural die still counts for a hitting error).
			const steady = rules.has(g.teams[phase.team][slot], 'steadyPasser') ? config.abilities.steadyPass : 0;
			const passDie = Math.min(6, die + steady);
			const firstMod = phase.receiver
				? rules.servePass(passDie, g.teams[phase.team][slot].defense, phase.seam ?? false)
				: rules.firstTouch(passDie);
			g.attack = { team: phase.team, hitter: slot, source: 'free', firstDie: die, firstMod };
			log(`${passer} passes · d6 ${die} → ${signed(g.attack.firstMod)}`, 'pass', {
				team: phase.team,
				player: passer,
				die,
				mod: g.attack.firstMod
			});
			charge(phase.team, slot, rules.firstTouchPips(firstMod), `${firstMod >= 2 ? 'Perfect' : 'Great'} pass`);
			g.phase = { kind: 'set' };
			return;
		}

		case 'dug': {
			// The digger's dig die is their first touch, and their partner sets straight away.
			const dug = g.attack!;
			const die = dug.digDie!;
			g.attack = {
				team: other(dug.team),
				hitter: 'defender',
				source: 'dig',
				dugAt: rules.defenderZone(dug.calls!.stance, dug.calls!.block),
				firstDie: die,
				// Libero instincts: a dig that comes up sets up a better attack.
				firstMod: rules.firstTouch(
					Math.min(6, die + (rules.has(g.teams[other(dug.team)].defender, 'liberoInstincts') ? config.abilities.liberoTouch : 0))
				)
			};
			const mod = g.attack.firstMod;
			charge(g.attack.team, 'defender', rules.firstTouchPips(mod), `${mod >= 2 ? 'Perfect' : 'Great'} dig`);
			return set();
		}

		case 'touched': {
			// Beach: the block touch counts as the first contact, so there's no pass. The defender sets it
			// straight away and the blocker attacks, with a penalty in place of the pass bonus. The block
			// die counts as the first touch's die for the two-1s shank rule.
			const blocked = g.attack!;
			const die = blocked.blockDie!;
			// Soft block: a blocker who plays the touch up to their setter.
			const soft = rules.has(g.teams[other(blocked.team)].blocker, 'softBlock');
			g.attack = {
				team: other(blocked.team),
				hitter: 'blocker',
				source: 'touch',
				firstDie: die,
				firstMod: soft ? config.abilities.softBlockTouch : config.touchFirstMod
			};
			return set();
		}

		case 'set':
			return set();

		case 'calls': {
			const a = g.attack!;
			const defending = other(a.team);
			a.calls = {
				shot: choosers.shot(g, a.team, rng),
				block: choosers.block(g, defending, rng),
				stance: choosers.stance(g, defending, rng)
			};
			if (config.blockModes) {
				a.calls.tempo = (choosers.tempo ?? randomChoosers.tempo!)(g, a.team, rng);
				a.calls.blockMode = (choosers.blockMode ?? randomChoosers.blockMode!)(g, defending, rng);
			}
			// The hitter can spend one of their charges on the hit, and the blocker or digger one of theirs.
			// It's gone once called, whether or not it comes into play.
			if (config.specials && g.pips) {
				const mine = g.pips[a.team];
				if (mine[a.hitter] > 0 && (choosers.special ?? randomChoosers.special!)(g, a.team, rng)) {
					a.calls.special = true;
					mine[a.hitter]--;
				}
				const theirs = g.pips[defending];
				const open = rules.availableSpends(theirs);
				const spend = open.length > 1 ? (choosers.defenceSpecial ?? randomChoosers.defenceSpecial!)(g, defending, rng) : 'none';
				if (!open.includes(spend)) throw new Error(`${defending} has no charge to spend on the ${spend}`);
				if (spend !== 'none') {
					a.calls.defenceSpecial = spend;
					theirs[spend === 'block' ? 'blocker' : 'defender']--;
				}
			}
			const open = rules.attackOptionsIn(g);
			if (!open.some((o) => o.shot === a.calls!.shot && (!o.tempo || !a.calls!.tempo || o.tempo === a.calls!.tempo)))
				throw new Error(`${a.calls.tempo ? `${a.calls.tempo} ` : ''}${a.calls.shot} isn't on off a ${signed(a.setMod!)} set`);
			if (a.calls.blockMode && !rules.blockModesFor(g.teams[defending].blocker).includes(a.calls.blockMode))
				throw new Error(`${g.teams[defending].blocker.name} can't ${a.calls.blockMode}`);
			log(
				`Calls · ${a.team} ${a.calls.shot}${a.calls.special ? ' (special)' : ''} · ${defending} blocks ${a.calls.block}, defender ${a.calls.stance}${a.calls.defenceSpecial ? ` (special ${a.calls.defenceSpecial})` : ''}`,
				'calls',
				{
					...a.calls,
					team: a.team,
					defending,
					hitter: g.teams[a.team][a.hitter].name,
					blocker: g.teams[defending].blocker.name,
					defender: g.teams[defending].defender.name
				}
			);
			g.phase = { kind: 'hit' };
			return;
		}

		case 'hit': {
			const a = g.attack!;
			const calls = a.calls!;
			const setMod = a.setMod!;
			const team = g.teams[a.team];
			const hitter = team[a.hitter];
			const setter = team[partner(a.hitter)];

			const powerDie = roll(a.team, a.hitter, 'power');
			a.powerDie = powerDie;
			// A dig over isn't a swing: no hitting error and no unstoppable hit.
			const over = calls.shot === 'over';
			if (!over && rules.isShank(a.setDie!, powerDie)) {
				log(`${hitter.name} swings · d6 1`, 'swing', { player: hitter.name, team: a.team, slot: a.hitter, shot: calls.shot, die: 1 });
				return scorePoint(g, other(a.team), 'shank', 'two natural 1s');
			}
			if (!over && rules.isGuaranteedKill(a.setDie!, powerDie)) {
				log(`${hitter.name} swings · d6 6`, 'swing', { player: hitter.name, team: a.team, slot: a.hitter, shot: calls.shot, die: 6 });
				// No aim roll: an unstoppable hit lands where it was called.
				a.landing = rules.TARGET[calls.shot];
				return scorePoint(g, a.team, 'guaranteed kill', '6 on the set, 6 on the hit');
			}

			const special = calls.special ? config.specialHitPower : 0;
			const hard = !rules.isSoft(calls.shot);
			const heavy = hard && rules.has(hitter, 'heavyHitter');
			const lineBoost =
				(calls.shot === 'line' && rules.has(hitter, 'lineSpecialist') ? config.abilities.lineSpecialistPower : 0) +
				(calls.tempo === 'fast' && rules.has(hitter, 'quick') ? config.abilities.quickPower : 0);
			const power =
				rules.power(hitter.attack, powerDie, setMod) + special + (heavy ? config.abilities.heavyHitterPower : 0) + lineBoost;
			const hitData = () => ({
				team: a.team,
				slot: a.hitter,
				player: hitter.name,
				shot: calls.shot,
				attack: a.incoming!
			});
			const powerText = `${hitter.attack} + ${powerDie}${plus(setMod)}${special ? ` + ${special} special` : ''}${heavy ? ` + ${config.abilities.heavyHitterPower} heavy` : ''}${lineBoost ? ` + ${lineBoost} ability` : ''} = ${power}`;
			if (over) {
				a.incoming = config.overPower + powerDie;
				log(`${hitter.name} digs it over deep · ${config.overPower} + ${powerDie} = ${a.incoming}`, 'hit', hitData());
			} else if (calls.shot === 'tip') {
				a.incoming = power;
				log(`${hitter.name} tips · ${powerText}`, 'hit', hitData());
			} else {
				a.incoming = rules.teamAttack(power, setter.attack, a.setDie!);
				log(`${hitter.name} hits ${calls.shot} · ${powerText}, team ${a.incoming}`, 'hit', hitData());
			}

			const accDie = roll(a.team, a.hitter, 'aim');
			// Quick: a hitter used to fast sets aims them better.
			const tempoMod = calls.tempo === 'fast' ? (rules.has(hitter, 'quick') ? config.abilities.quickAim : config.fastAccuracyMod) : 0;
			const specialAim = calls.special ? config.specialHitAccuracy : 0;
			// Abilities: Heavy hitter aims worse.
			const abilityAim = heavy ? config.abilities.heavyHitterAim : 0;
			a.accuracy = rules.accuracy(accDie, a.firstMod, setMod, setter.attack) + tempoMod + specialAim + abilityAim;
			const accText = `Accuracy ${accDie}${plus(a.firstMod)}${plus(setMod)} + ${setter.attack}${tempoMod ? `${plus(tempoMod)} fast` : ''}${specialAim ? ` + ${specialAim} special` : ''}${abilityAim ? `${plus(abilityAim)} ability` : ''} = ${a.accuracy}`;
			const defenderAt = rules.defenderZone(calls.stance, calls.block);
			const where = rules.landing(calls.shot, a.accuracy, defenderAt, (zones) => pick(rng, zones));
			a.aim = rules.aimResult(calls.shot, a.accuracy);
			if (where === 'easy') {
				log(`${accText} → easy ball`, 'accuracy', { result: 'easy', target: rules.TARGET[calls.shot] });
				return freeBallTo(g, other(a.team));
			}
			a.landing = where;
			const AIM_TEXT = { exact: 'on target', drift: 'drifts', block: 'into the block' } as const;
			log(`${accText} → ${AIM_TEXT[a.aim as keyof typeof AIM_TEXT]}, zone ${where}`, 'accuracy', {
				result: a.aim,
				zone: where,
				target: rules.TARGET[calls.shot]
			});

			// The blocker and defender roll in the same step as the attackers.
			const defending = other(a.team);
			const { blocker, defender } = g.teams[defending];
			// The block is in play when the shot went down the blocker's channel, or was aimed into the block.
			// A reading blocker might also get across to the other channel, but late, with less over the net.
			const mode = calls.blockMode ?? 'commit';
			const intoBlock = a.aim === 'block' && calls.shot !== calls.block;
			let blocking = mode !== 'none' && hard && (calls.shot === calls.block || intoBlock);
			if (mode === 'read' && hard && !blocking) {
				const die = roll(defending, 'blocker', 'read');
				blocking = die <= config.readChance[calls.tempo ?? 'high'];
				log(`${blocker.name} reads ${calls.shot} · d6 ${die} → ${blocking ? 'gets across' : 'too late'}`, 'read', {
					die,
					across: blocking,
					player: blocker.name,
					team: defending
				});
			}
			if (blocking) {
				const die = roll(defending, 'blocker', 'block');
				// A read block is late, with less over the net. Wall commits harder.
				const bonus =
					(mode === 'read' ? config.readBlockBonus : config.blockBonus) +
					(mode === 'commit' && rules.has(blocker, 'wall') ? config.abilities.wallBlock : 0) +
					(calls.defenceSpecial === 'block' ? config.specialBlock : 0);
				const total = blocker.defense + die + bonus;
				const result = rules.blockResult(total, a.incoming!);
				log(
					`${blocker.name} blocks · ${blocker.defense} + ${die} + ${bonus} = ${total} vs ${a.incoming} → ${result}`,
					'block',
					{ result, total, attack: a.incoming!, player: blocker.name, team: defending, intoBlock, mode }
				);
				if (result === 'stuff') return scorePoint(g, defending, 'stuff', `block ${total} vs ${a.incoming}`);
				if (result === 'touch') {
					// Tool the block: the hitter goes off the hands and out.
					if (rules.has(hitter, 'toolTheBlock')) {
						const tool = roll(a.team, a.hitter, 'tool');
						const out = tool >= config.abilities.toolTheBlockOn;
						log(`${hitter.name} goes for the hands · d6 ${tool} → ${out ? 'off the block and out' : 'stays in'}`, 'tool', {
							die: tool,
							out,
							player: hitter.name,
							team: a.team
						});
						if (out) return scorePoint(g, a.team, 'kill', `off ${blocker.name}'s hands`);
					}
					a.blockDie = die;
					g.phase = { kind: 'touched' };
					return;
				}
			}

			const reach = calls.shot === 'over' ? rules.overReach(calls.stance) : rules.reach(rules.distance(defenderAt, where), defender);
			const read = rules.isRead(calls.shot, calls.block, calls.stance);
			const digDie = roll(defending, 'defender', 'dig');
			let dig = rules.digTotal(defender.defense, reach, digDie, read);
			if (mode === 'none') dig += config.noBlockDigBonus;
			if (calls.defenceSpecial === 'dig') dig += config.specialDig;
			const libero = rules.has(defender, 'liberoInstincts') ? config.abilities.liberoDig : 0;
			dig += libero;
			if (config.partnerPoolOnDig) dig += Math.floor((blocker.defense + roll(defending, 'blocker', 'pool')) / 2);
			const up = dig >= a.incoming!;
			log(
				`${defender.name} digs · ${defender.defense} × ${reach} + ${digDie}${read ? ` + ${config.readBonus} read` : ''}${mode === 'none' ? ` + ${config.noBlockDigBonus} help` : ''}${calls.defenceSpecial === 'dig' ? ` + ${config.specialDig} special` : ''}${libero ? ` + ${libero} libero` : ''} = ${dig} vs ${a.incoming} → ${up ? `up, first touch ${signed(rules.firstTouch(digDie))}` : 'kill'}`,
				'dig',
				{
					shot: calls.shot,
					read,
					up,
					total: dig,
					die: digDie,
					attack: a.incoming!,
					reach,
					stance: calls.stance,
					player: defender.name,
					team: defending
				}
			);
			if (!up) return scorePoint(g, a.team, 'kill', `${a.incoming} vs dig ${dig}`);
			a.digDie = digDie;
			g.phase = { kind: 'dug' };
			return;
		}
	}
}

/** `start` marks the free ball that opens a rally (there's no serve yet). */
function freeBallTo(g: Game, team: TeamId, start = false): void {
	g.phase = { kind: 'freeBall', team };
	g.log.push({ rally: g.rally, text: `Free ball to ${team}`, tag: 'freeBall', data: { team, start } });
}

function scorePoint(g: Game, winner: TeamId, kind: PointKind, detail: string): void {
	g.score[winner]++;
	// Side-out: the team winning the serve back switches server, as in beach volleyball.
	if (winner !== g.serving) g.servers[winner] = partner(g.servers[winner]);
	g.serving = winner;
	g.winner = rules.gameWinner(g.score);
	g.phase = g.winner ? { kind: 'gameOver' } : { kind: 'pointOver' };
	g.log.push({
		rally: g.rally,
		text: `${winner} scores · ${kind} (${detail}) · ${g.score.A}–${g.score.B}${g.winner ? ` · Team ${g.winner} wins` : ''}`,
		tag: 'point',
		data: { winner, kind, scoreA: g.score.A, scoreB: g.score.B, gameOver: g.winner !== null }
	});
}
