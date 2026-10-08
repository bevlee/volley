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
	const set = () => {
		const a = g.attack!;
		const setter = g.teams[a.team][partner(a.hitter)];
		const die = roll(a.team, partner(a.hitter), 'set');
		a.setDie = die;
		a.setMod = rules.ladder(die + a.firstMod);
		log(`${setter.name} sets · d6 ${die}${plus(a.firstMod)} → ${signed(a.setMod)}`, 'set', {
			team: a.team,
			player: setter.name,
			die,
			mod: a.setMod,
			source: a.source
		});
		if (rules.isShank(a.firstDie, die)) return scorePoint(g, other(a.team), 'shank', 'two natural 1s');
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
			log(`${server} serves to ${receiving}`, 'serve', { team: phase.team, player: server, receiving });
			g.phase = { kind: 'freeBall', team: receiving };
			return;
		}

		case 'freeBall': {
			const slot = config.freeBallReceiver;
			const die = roll(phase.team, slot, 'pass');
			g.attack = { team: phase.team, hitter: slot, source: 'free', firstDie: die, firstMod: rules.firstTouch(die) };
			const passer = g.teams[phase.team][slot].name;
			log(`${passer} passes · d6 ${die} → ${signed(g.attack.firstMod)}`, 'pass', {
				team: phase.team,
				player: passer,
				die,
				mod: g.attack.firstMod
			});
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
				firstMod: rules.firstTouch(die)
			};
			return set();
		}

		case 'touched': {
			// Beach: the block touch counts as the first contact, so there's no pass. The defender sets it
			// straight away and the blocker attacks, with a penalty in place of the pass bonus. The block
			// die counts as the first touch's die for the two-1s shank rule.
			const blocked = g.attack!;
			const die = blocked.blockDie!;
			g.attack = {
				team: other(blocked.team),
				hitter: 'blocker',
				source: 'touch',
				firstDie: die,
				firstMod: config.touchFirstMod
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
			log(
				`Calls · ${a.team} ${a.calls.shot} · ${defending} blocks ${a.calls.block}, defender ${a.calls.stance}`,
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
			if (rules.isShank(a.setDie!, powerDie)) {
				log(`${hitter.name} swings · d6 1`, 'swing', { player: hitter.name, team: a.team, slot: a.hitter, shot: calls.shot, die: 1 });
				return scorePoint(g, other(a.team), 'shank', 'two natural 1s');
			}
			if (rules.isGuaranteedKill(a.setDie!, powerDie)) {
				log(`${hitter.name} swings · d6 6`, 'swing', { player: hitter.name, team: a.team, slot: a.hitter, shot: calls.shot, die: 6 });
				// No aim roll: an unstoppable hit lands where it was called.
				a.landing = rules.TARGET[calls.shot];
				return scorePoint(g, a.team, 'guaranteed kill', '6 on the set, 6 on the hit');
			}

			const power = rules.power(hitter.attack, powerDie, setMod);
			const hitData = () => ({
				team: a.team,
				slot: a.hitter,
				player: hitter.name,
				shot: calls.shot,
				attack: a.incoming!
			});
			const powerText = `${hitter.attack} + ${powerDie}${plus(setMod)} = ${power}`;
			if (calls.shot === 'tip') {
				a.incoming = power;
				log(`${hitter.name} tips · ${powerText}`, 'hit', hitData());
			} else {
				a.incoming = rules.teamAttack(power, setter.attack, a.setDie!);
				log(`${hitter.name} hits ${calls.shot} · ${powerText}, team ${a.incoming}`, 'hit', hitData());
			}

			const accDie = roll(a.team, a.hitter, 'aim');
			a.accuracy = rules.accuracy(accDie, a.firstMod, setMod, setter.attack);
			const accText = `Accuracy ${accDie}${plus(a.firstMod)}${plus(setMod)} + ${setter.attack} = ${a.accuracy}`;
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
			const intoBlock = a.aim === 'block' && calls.shot !== calls.block;
			if (calls.shot !== 'tip' && (calls.shot === calls.block || intoBlock)) {
				const die = roll(defending, 'blocker', 'block');
				const total = blocker.defense + die + config.blockBonus;
				const result = rules.blockResult(total, a.incoming!);
				log(
					`${blocker.name} blocks · ${blocker.defense} + ${die} + ${config.blockBonus} = ${total} vs ${a.incoming} → ${result}`,
					'block',
					{ result, total, attack: a.incoming!, player: blocker.name, team: defending, intoBlock }
				);
				if (result === 'stuff') return scorePoint(g, defending, 'stuff', `block ${total} vs ${a.incoming}`);
				if (result === 'touch') {
					a.blockDie = die;
					g.phase = { kind: 'touched' };
					return;
				}
			}

			const reach = rules.reach(rules.distance(defenderAt, where));
			const read = rules.isRead(calls.shot, calls.block, calls.stance);
			const digDie = roll(defending, 'defender', 'dig');
			let dig = rules.digTotal(defender.defense, reach, digDie, read);
			if (config.partnerPoolOnDig) dig += Math.floor((blocker.defense + roll(defending, 'blocker', 'pool')) / 2);
			const up = dig >= a.incoming!;
			log(
				`${defender.name} digs · ${defender.defense} × ${reach} + ${digDie}${read ? ` + ${config.readBonus} read` : ''} = ${dig} vs ${a.incoming} → ${up ? `up, first touch ${signed(rules.firstTouch(digDie))}` : 'kill'}`,
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
