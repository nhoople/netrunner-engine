/**
 * Board helpers for the jnet scenarios classified by CR audit session P1-l
 * (tests/jnet-interactions-*.test.ts). Not a test file: vitest only runs
 * `*.test.ts`. The quarantined ports keep their own helpers in
 * tests/jnet/helpers.ts, so this file does not import from there.
 *
 * Boards are built through intents wherever the engine has one: cards start
 * in hand and are installed, rezzed, and run on with the same actions a
 * player takes. Card names are printed titles, resolved to pinned slugs.
 */
import {
  applyIntent,
  createInitialState,
  instantiateCard,
  legalActions,
  loadCardCatalog,
} from "../src/index.js";
import type { Action } from "../src/state/types/actions.js";
import type { CardInstance } from "../src/state/types/card.js";
import type { GameState } from "../src/state/types/game.js";
import type { ServerId } from "../src/state/types/servers.js";
import type { Side } from "../src/state/types/shared.js";

export function must(state: GameState, action: Action): GameState {
  const result = applyIntent(state, action);
  if (!result.ok) {
    throw new Error(
      `${action.type} refused at ${state.timingKey}: ${result.error}`,
    );
  }
  return result.state;
}

let titleToSlug: Map<string, string> | null = null;
const norm = (title: string): string => title.replace(/’/g, "'");

function slug(title: string): string {
  if (!titleToSlug) {
    titleToSlug = new Map();
    for (const def of loadCardCatalog().values()) {
      titleToSlug.set(norm(def.title), def.id);
    }
  }
  const id = titleToSlug.get(norm(title));
  if (!id) throw new Error(`No pinned card titled "${title}"`);
  return id;
}

export interface BoardOptions {
  corpId?: string;
  runnerId?: string;
  corpHand?: string[];
  corpDeck?: string[];
  corpDiscard?: string[];
  runnerHand?: string[];
  runnerDeck?: string[];
  runnerDiscard?: string[];
  corpCredits?: number;
  runnerCredits?: number;
  corpBadPublicity?: number;
}

/**
 * A game at the Corp's first action, hands and decks as given (deck order
 * is the order given, top first). Card ids are `side:slug:n`.
 */
export function board(options: BoardOptions = {}): GameState {
  let state = createInitialState({ stopAfterFirstCycle: false });
  const cards: Record<string, CardInstance> = {
    "corp-id": options.corpId
      ? instantiateCard(slug(options.corpId), "corp-id", "corp:hq")
      : state.cards["corp-id"]!,
    "runner-id": options.runnerId
      ? instantiateCard(slug(options.runnerId), "runner-id", "runner:grip")
      : state.cards["runner-id"]!,
  };
  const counters = new Map<string, number>();
  const place = (
    side: Side,
    title: string,
    zone: CardInstance["zone"],
  ): string => {
    const s = slug(title);
    const n = (counters.get(`${side}:${s}`) ?? 0) + 1;
    counters.set(`${side}:${s}`, n);
    const id = `${side}:${s}:${n}`;
    cards[id] = instantiateCard(s, id, zone);
    return id;
  };
  const corpDeck = (options.corpDeck ?? Array(10).fill("Hedge Fund")).map(
    (t: string) => place("corp", t, "corp:rd"),
  );
  const corpHand = (options.corpHand ?? []).map((t) =>
    place("corp", t, "corp:hq"),
  );
  const corpDiscard = (options.corpDiscard ?? []).map((t) =>
    place("corp", t, "corp:archives"),
  );
  const runnerDeck = (options.runnerDeck ?? Array(10).fill("Sure Gamble")).map(
    (t: string) => place("runner", t, "runner:stack"),
  );
  const runnerHand = (options.runnerHand ?? []).map((t) =>
    place("runner", t, "runner:grip"),
  );
  const runnerDiscard = (options.runnerDiscard ?? []).map((t) =>
    place("runner", t, "runner:heap"),
  );
  state = { ...state, cards };
  Object.assign(state.corp, {
    deck: corpDeck,
    hand: corpHand,
    discardPile: corpDiscard,
    scoreArea: [],
    installed: [],
    playArea: [],
    credits: options.corpCredits ?? 5,
  });
  Object.assign(state.runner, {
    deck: runnerDeck,
    hand: runnerHand,
    discardPile: runnerDiscard,
    scoreArea: [],
    installed: [],
    playArea: [],
    credits: options.runnerCredits ?? 5,
  });
  if (options.corpBadPublicity !== undefined) {
    state.corp.badPublicity = options.corpBadPublicity;
  }
  for (const server of Object.values(state.servers)) {
    Object.assign(server, { ice: [], root: [] });
  }
  state.done = false;
  state.winner = null;
  state.winReason = null;
  while (legalActions(state).some((a) => a.type === "keep_starting_hand")) {
    state = must(state, { type: "keep_starting_hand" });
  }
  return toAction(state, "corp");
}

/**
 * Walk pass windows and the other side's clicks to `side`'s action step.
 */
export function toAction(
  state: GameState,
  side: Side,
  options: { declineOptional?: boolean } = {},
): GameState {
  const wanted = `${side}.takeAction`;
  for (let guard = 0; guard < 300; guard++) {
    if (state.timingKey === wanted && !state.pendingChoice) return state;
    // With declineOptional, optional abilities met on the way ("you may")
    // are declined; otherwise an open choice stops the walk with an error.
    const decline = options.declineOptional
      ? state.pendingChoice?.options.find((o) =>
          /^(Decline|Do not|No$|Don't)/.test(o.label),
        )
      : undefined;
    if (decline) {
      state = must(state, { type: "choose_option", optionId: decline.id });
      continue;
    }
    const legal = legalActions(state);
    if (legal.some((a) => a.type === "keep_starting_hand")) {
      state = must(state, { type: "keep_starting_hand" });
      continue;
    }
    if (legal.some((a) => a.type === "discard_to_hand_size")) {
      state = must(state, { type: "discard_to_hand_size" });
      continue;
    }
    if (
      state.timingKey.endsWith(".takeAction") &&
      state.timingKey !== wanted &&
      legal.some((a) => a.type === "basic_gain_credit")
    ) {
      state = must(state, { type: "basic_gain_credit" });
      continue;
    }
    if (legal.some((a) => a.type === "pass_window")) {
      state = must(state, { type: "pass_window" });
      continue;
    }
    throw new Error(
      `Cannot reach ${wanted}; parked at ${state.timingKey} with ${legal
        .map((a) => a.type)
        .join(
          ", ",
        )}${state.pendingChoice ? ` / choice: ${optionLabels(state).join(" | ")}` : ""}`,
    );
  }
  throw new Error(`Cannot reach ${wanted}; step budget exhausted`);
}

/** Close an open action paid-ability window so the next action is legal. */
export function settle(state: GameState): GameState {
  for (let guard = 0; guard < 20; guard++) {
    if (state.pendingChoice) return state;
    if (!state.timingKey.endsWith("actionPaw")) return state;
    if (!legalActions(state).some((a) => a.type === "pass_window"))
      return state;
    state = must(state, { type: "pass_window" });
  }
  return state;
}

function inHand(state: GameState, side: Side, title: string): string {
  const hand = side === "corp" ? state.corp.hand : state.runner.hand;
  const id = hand.find(
    (c) => norm(state.cards[c]?.title ?? "") === norm(title),
  );
  if (!id) throw new Error(`${title} is not in the ${side} hand`);
  return id;
}

/** The first card with this title, wherever it is. */
export function card(state: GameState, title: string, n = 1): CardInstance {
  const found = Object.values(state.cards).filter(
    (c) => norm(c.title) === norm(title),
  );
  const c = found.sort((a, b) => a.id.localeCompare(b.id))[n - 1];
  if (!c) throw new Error(`No card titled ${title} (#${n})`);
  return c;
}

/** Corp install from HQ: ice protects `server`; other cards go in its root. */
export function corpInstall(
  state: GameState,
  title: string,
  server: ServerId | "new",
): GameState {
  const cardId = inHand(settle(state), "corp", title);
  const def = state.cards[cardId]!;
  if (def.type === "ice") {
    return must(settle(state), {
      type: "basic_install",
      cardId,
      destination:
        server === "new"
          ? { kind: "new_remote" }
          : { kind: "protect", serverId: server },
    });
  }
  return must(settle(state), {
    type: "basic_install",
    cardId,
    destination:
      server === "new"
        ? { kind: "new_remote" }
        : { kind: "remote_root", serverId: server },
  });
}

/** Runner install from the grip to the rig, or onto a host. */
export function runnerInstall(
  state: GameState,
  title: string,
  hostId?: string,
): GameState {
  const cardId = inHand(settle(state), "runner", title);
  return must(settle(state), {
    type: "basic_install",
    cardId,
    destination: hostId ? { kind: "host_card", hostId } : { kind: "installed" },
  });
}

export function playEvent(
  state: GameState,
  title: string,
  serverId?: ServerId,
): GameState {
  const cardId = inHand(settle(state), "runner", title);
  return must(
    settle(state),
    serverId
      ? { type: "play_event", cardId, serverId }
      : { type: "play_event", cardId },
  );
}

export function playOperation(state: GameState, title: string): GameState {
  const cardId = inHand(settle(state), "corp", title);
  return must(settle(state), { type: "play_operation", cardId });
}

export function optionLabels(state: GameState): string[] {
  return (state.pendingChoice?.options ?? []).map((o) => o.label);
}

/** Choose the open option whose label is, or else contains, `label`. */
export function choose(state: GameState, label: string): GameState {
  const choice = state.pendingChoice;
  if (!choice) throw new Error(`No open choice while choosing "${label}"`);
  const option =
    choice.options.find((o) => o.label === label) ??
    choice.options.find((o) => o.label.includes(label));
  if (!option) {
    throw new Error(
      `No option names "${label}"; options: ${optionLabels(state).join(" | ")}`,
    );
  }
  return must(state, { type: "choose_option", optionId: option.id });
}

/** Pass windows (and continue) until `done` holds, or fail. */
export function passUntil(
  state: GameState,
  done: (s: GameState) => boolean,
  what: string,
): GameState {
  for (let guard = 0; guard < 120; guard++) {
    if (done(state)) return state;
    const legal = legalActions(state);
    if (legal.some((a) => a.type === "pass_window")) {
      state = must(state, { type: "pass_window" });
      continue;
    }
    if (legal.some((a) => a.type === "continue_run")) {
      state = must(state, { type: "continue_run" });
      continue;
    }
    throw new Error(
      `Never reached ${what}; parked at ${state.timingKey} with ${legal
        .map((a) => a.type)
        .join(
          ", ",
        )}${state.pendingChoice ? ` / choice: ${optionLabels(state).join(" | ")}` : ""}`,
    );
  }
  throw new Error(`Never reached ${what}; step budget exhausted`);
}

export const encountering = (iceId: string) => (s: GameState) =>
  s.run?.encounter?.iceId === iceId && s.timingKey === "run.encounterPaw";

export const approaching = (iceId: string) => (s: GameState) =>
  s.timingKey === "run.approachPaw" &&
  s.run?.encounter == null &&
  s.run?.position != null &&
  currentIce(s) === iceId;

/** The ice at the Runner's position on the attacked server, if any. */
export function currentIce(state: GameState): string | null {
  const run = state.run;
  if (!run || run.position == null) return null;
  return state.servers[run.attackedServerId]?.ice[run.position] ?? null;
}

export const pass = (s: GameState): GameState =>
  must(s, { type: "pass_window" });

export const logText = (s: GameState): string => s.log.join("\n");

/**
 * Board setup: the card starts rezzed, as upstream's `rez` helper leaves it.
 * The Corp cannot normally rez ice outside the approach window (CR 6.4.3),
 * so there is no intent for this.
 */
export function rezNow(s: GameState, cardId: string): GameState {
  const c = s.cards[cardId]!;
  c.rezzed = true;
  c.faceup = true;
  return s;
}

/** Use a paid ability now if it is legal, else after closing the action window. */
export function paid(
  s: GameState,
  cardId: string,
  abilityId: string,
): GameState {
  const now = legalActions(s).some(
    (a) =>
      a.type === "use_paid_ability" &&
      a.cardId === cardId &&
      a.abilityId === abilityId,
  );
  return must(now ? s : settle(s), {
    type: "use_paid_ability",
    cardId,
    abilityId,
  });
}

/** Pass, continue and access through a run, answering choices with `pick`. */
export function driveRun(
  s: GameState,
  pick: (labels: string[]) => string,
): GameState {
  for (let i = 0; i < 80 && s.run; i++) {
    if (s.pendingChoice) {
      s = choose(s, pick(optionLabels(s)));
      continue;
    }
    const legal = legalActions(s);
    const access = legal.find((a) => a.type === "access_card");
    if (legal.some((a) => a.type === "pass_window")) s = pass(s);
    else if (legal.some((a) => a.type === "continue_run"))
      s = must(s, { type: "continue_run" });
    else if (access) s = must(s, access);
    else if (legal.some((a) => a.type === "finish_access"))
      s = must(s, { type: "finish_access" });
    else break;
  }
  return s;
}
