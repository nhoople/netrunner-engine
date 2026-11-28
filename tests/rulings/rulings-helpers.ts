/**
 * Board helpers shared by the official-rulings tests
 * (tests/rulings/rulings-*.test.ts, CR audit tool 1.14).
 */
import type { ZoneId } from "../../src/state/types/shared.js";
import {
  applyAction,
  createInitialState,
  instantiateCard,
  legalActions,
} from "../../src/index.js";
import type { GameState } from "../../src/index.js";
import type { Action } from "../../src/state/types/actions.js";
import type { ServerId } from "../../src/state/types/servers.js";
import { passIdle } from "../../src/demo/passIdle.js";
import type { Effect } from "../../src/effects/ir/effect.js";
import { openPendingChoose } from "../../src/state/triggers/pendingChoice.js";
import { serverIdForCard } from "../../src/effects/counters/counterKinds.js";

/** The default board with no Runner card marked rezzed (CR 8.1.4f). */
export function fresh(): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  // Out of the grip and out of the game, so no card is left in no zone.
  for (const id of s.runner.hand) delete s.cards[id];
  s.runner.hand = [];
  s.priorityStack = [];
  return s;
}

export function put(s: GameState, defId: string, id: string, zone: ZoneId) {
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  return card;
}

/**
 * The zone the engine gives a side's identity card: the one its current
 * identity was created in. There is no identity zone (`ZoneId`); the engine
 * builds a game with each identity in that side's hand zone
 * (`createInitialState`), and seat views show identities by card type.
 * CR 1.6.1 places identities faceup in the play area instead; that
 * difference is filed in the CR audit findings (setup and end), and tests
 * follow what the engine builds.
 */
export function identityZone(s: GameState, side: "corp" | "runner"): ZoneId {
  return s.cards[s[side].identityId]!.zone;
}

/** Replace a side's identity in place, keeping its id. */
export function setIdentity(
  s: GameState,
  side: "corp" | "runner",
  defId: string,
) {
  return put(s, defId, s[side].identityId, identityZone(s, side));
}

/** A Corp card alone in the root of a new remote server. */
export function installRoot(
  s: GameState,
  defId: string,
  id: string,
  rezzed = true,
) {
  // The engine numbers remotes (`remote-N`) and reads the number.
  const serverId: ServerId = `remote-${s.nextRemoteNumber++}`;
  s.servers[serverId] = {
    id: serverId,
    kind: "remote",
    root: [id],
    ice: [],
  };
  const card = put(s, defId, id, `server:${serverId}:root`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  return card;
}

/**
 * The server `cardId` is installed in, as the engine names it
 * (`serverIdForCard`). Throws when the card is not installed.
 */
export function serverOf(s: GameState, cardId: string): ServerId {
  const id = serverIdForCard(s, cardId);
  if (!id) throw new Error(`${cardId} is not installed`);
  return id;
}

/** A piece of ice installed outermost on `server` (index 0 is outermost). */
export function installIce(
  s: GameState,
  defId: string,
  id: string,
  server: ServerId,
  rezzed = true,
) {
  const card = put(s, defId, id, `server:${server}:ice`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.servers[server]!.ice.unshift(id);
  return card;
}

export function installRunner(s: GameState, defId: string, id: string) {
  const card = put(s, defId, id, "runner:installed");
  s.runner.installed.push(id);
  return card;
}

export function toHand(
  s: GameState,
  side: "corp" | "runner",
  defId: string,
  id: string,
) {
  put(s, defId, id, side === "corp" ? "corp:hq" : "runner:grip");
  (side === "corp" ? s.corp : s.runner).hand.push(id);
}

/** Put cards on top of R&D, first id on top. */
export function stackRd(s: GameState, cards: Array<[string, string]>): void {
  for (const [defId, id] of [...cards].reverse()) {
    put(s, defId, id, "corp:rd");
    s.corp.deck.unshift(id);
  }
}

export function corpTurn(s: GameState, credits = 10): GameState {
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 3;
  s.corp.credits = credits;
  return s;
}

export function runnerTurn(s: GameState, credits = 10): GameState {
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = credits;
  return s;
}

export function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(
      `${action.type}: ${result.error} ${JSON.stringify(result.cites)}`,
    );
  }
  return passIdle(result.state);
}

export function optionIds(s: GameState): string[] {
  return (s.pendingChoice?.options ?? []).map((o) => o.id);
}

const DRIVE_ORDER: Action["type"][] = [
  "continue_run",
  "access_card",
  "finish_access",
  "finish_breach",
  "pass_window",
  "discard_to_hand_size",
];

/**
 * Play the obvious step (continue, access, finish, pass) until `stop` holds
 * or a choice opens. A test driver: it reads every candidate, hidden ones too.
 */
export function drive(
  s: GameState,
  stop: (s: GameState) => boolean,
): GameState {
  for (let i = 0; i < 200; i++) {
    if (stop(s) || s.pendingChoice || s.done) return s;
    const legal = legalActions(s);
    const next = DRIVE_ORDER.map((t) => legal.find((a) => a.type === t)).find(
      Boolean,
    );
    if (!next) {
      throw new Error(
        `stuck at ${s.timingKey}: ${legal.map((a) => a.type).join(", ")}`,
      );
    }
    s = must(s, next);
  }
  throw new Error(`no stop at ${s.timingKey}`);
}

export const atRunnerAction = (s: GameState) =>
  s.timingKey === "runner.takeAction" && !s.run;
export const atCorpAction = (s: GameState) => s.timingKey === "corp.takeAction";

/** Choose the first option whose id contains `part`. */
export function pick(s: GameState, part: string): GameState {
  const option = optionIds(s).find((id) => id.includes(part));
  if (!option) {
    throw new Error(`no option with "${part}": ${optionIds(s).join(", ")}`);
  }
  return must(s, { type: "choose_option", optionId: option });
}

/** The legal paid ability on `cardId`, if one is offered. */
export function paidAbility(s: GameState, cardId: string) {
  return legalActions(s).find(
    (a) => a.type === "use_paid_ability" && a.cardId === cardId,
  );
}

/**
 * Spend the Runner's last click and play on to the Corp's turn: stops at
 * the first choice (a turn-begin ability) or the Corp's first action.
 */
export function toCorpTurn(s: GameState): GameState {
  s.config.stopAfterFirstCycle = false;
  s.runner.clicks = 1;
  s = must(s, { type: "basic_gain_credit" });
  return drive(s, atCorpAction);
}

/**
 * Spend the Corp's last click and play on to the Runner's next turn: stops
 * at the first choice (a turn-begin ability) or the Runner's first action.
 */
export function toRunnerTurn(s: GameState): GameState {
  s.config.stopAfterFirstCycle = false;
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 1;
  s = must(s, { type: "basic_gain_credit" });
  return drive(s, atRunnerAction);
}

/** Take the first option of each open choice, then go on to `stop`. */
export function settle(s: GameState, stop = atRunnerAction): GameState {
  for (let i = 0; i < 10; i++) {
    s = drive(s, stop);
    if (!s.pendingChoice) return s;
    s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
  }
  return s;
}

const WALK_ORDER: Action["type"][] = [
  "continue_run",
  "access_card",
  "finish_access",
  "finish_breach",
  "pass_window",
];

/**
 * Take the obvious step until `stop` (by default the Runner's next action),
 * choosing the first option of each choice. Returns the cards offered for
 * access on the way.
 */
export function walkThrough(
  s: GameState,
  stop: (s: GameState) => boolean = atRunnerAction,
): { state: GameState; accessed: string[] } {
  const accessed: string[] = [];
  for (let i = 0; i < 100 && !stop(s); i++) {
    if (s.pendingChoice) {
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
      continue;
    }
    const legal = legalActions(s);
    const next = WALK_ORDER.map((t) => legal.find((a) => a.type === t)).find(
      Boolean,
    );
    if (!next) break;
    if (next.type === "access_card") accessed.push(next.cardId);
    s = must(s, next);
  }
  return { state: s, accessed };
}

/** Empty HQ, removing its cards from the game state. */
export function clearCorpHand(s: GameState): void {
  for (const id of s.corp.hand) delete s.cards[id];
  s.corp.hand = [];
}

/** Empty R&D, removing its cards from the game state. */
export function clearRd(s: GameState): void {
  for (const id of s.corp.deck) delete s.cards[id];
  s.corp.deck = [];
}

/**
 * Open a one-option choice that carries `effect`, so choosing it goes through
 * `applyAction` and its checkpoint, as an instruction inside a run does. For
 * tests of an instruction that resolves at once (Singularity, CR 6.7.4c).
 */
export function openAsChoice(
  s: GameState,
  sourceId: string,
  optionId: string,
  effect: Effect,
): { ok: true } {
  openPendingChoose(s, {
    sourceId,
    chooser: "runner",
    options: [{ id: optionId, label: optionId, effect }],
  });
  return { ok: true };
}
