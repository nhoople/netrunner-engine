/**
 * Helper layer for ported jnet scenarios. Lives inside tests/jnet/ so the
 * quarantine can be removed as one unit; native tests use their own helpers.
 * Setups name cards by printed title, as the upstream tests do, and resolve
 * titles to pinned catalog slugs here.
 */
import {
  applyIntent,
  createInitialState,
  instantiateCard,
  legalActions,
  loadCardCatalog,
} from "../../src/index.js";
import type {
  Action,
  CardInstance,
  GameState,
  Server,
  ServerId,
  Side,
} from "../../src/state/types.js";

export function must(state: GameState, action: Action): GameState {
  const result = applyIntent(state, action);
  if (!result.ok) {
    throw new Error(`${action.type} refused: ${result.error}`);
  }
  return result.state;
}

let titleToSlug: Map<string, string> | null = null;

export function slugForTitle(title: string): string {
  if (!titleToSlug) {
    titleToSlug = new Map();
    for (const def of loadCardCatalog().values()) {
      titleToSlug.set(def.title, def.id);
    }
  }
  const slug = titleToSlug.get(title);
  if (!slug) throw new Error(`No pinned card titled "${title}"`);
  return slug;
}

/** Upstream `(qty "Hedge Fund" 10)`. */
export function qty(title: string, count: number): string[] {
  return Array.from({ length: count }, () => title);
}

export interface NewGameOptions {
  corpHand?: string[];
  corpDeck?: string[];
  runnerHand?: string[];
  runnerDeck?: string[];
  startAs?: Side;
  corpCredits?: number;
  runnerCredits?: number;
}

/**
 * Build a game with the named hands and decks, then walk the opening to the
 * requested side's action step. Deck order is the order given; the engine's
 * own shuffles and draws proceed from there.
 */
export function newGame(options: NewGameOptions = {}): GameState {
  let state = createInitialState({ stopAfterFirstCycle: false });
  const cards: Record<string, CardInstance> = {
    "corp-id": state.cards["corp-id"]!,
    "runner-id": state.cards["runner-id"]!,
  };
  const counters = new Map<string, number>();
  const place = (side: Side, title: string, zone: CardInstance["zone"]): string => {
    const slug = slugForTitle(title);
    const n = (counters.get(slug) ?? 0) + 1;
    counters.set(slug, n);
    const id = `${side}:${slug}:${n}`;
    cards[id] = instantiateCard(slug, id, zone);
    return id;
  };
  const corpDeck = (options.corpDeck ?? qty("Hedge Fund", 10)).map((t) =>
    place("corp", t, "corp:rd"),
  );
  const corpHand = (options.corpHand ?? []).map((t) => place("corp", t, "corp:hq"));
  const runnerDeck = (options.runnerDeck ?? qty("Sure Gamble", 10)).map((t) =>
    place("runner", t, "runner:stack"),
  );
  const runnerHand = (options.runnerHand ?? []).map((t) =>
    place("runner", t, "runner:grip"),
  );
  state = { ...state, cards };
  state.corp.deck = corpDeck;
  state.corp.hand = corpHand;
  state.corp.discardPile = [];
  state.corp.scoreArea = [];
  state.corp.installed = [];
  state.corp.playArea = [];
  state.corp.credits = options.corpCredits ?? 5;
  state.runner.deck = runnerDeck;
  state.runner.hand = runnerHand;
  state.runner.discardPile = [];
  state.runner.scoreArea = [];
  state.runner.installed = [];
  state.runner.playArea = [];
  state.runner.credits = options.runnerCredits ?? 5;
  for (const server of Object.values(state.servers)) {
    server.ice = [];
    server.root = [];
  }
  state.done = false;
  state.winner = null;
  state.winReason = null;

  while (legalActions(state).some((a) => a.type === "keep_starting_hand")) {
    state = must(state, { type: "keep_starting_hand" });
  }
  return toTakeAction(state, options.startAs ?? "corp");
}

/** Walk pass windows and the other side's clicks to `side`'s action step. */
export function toTakeAction(state: GameState, side: Side): GameState {
  const wanted = side === "corp" ? "corp.takeAction" : "runner.takeAction";
  for (let guard = 0; guard < 300; guard++) {
    if (state.timingKey === wanted) return state;
    const legal = legalActions(state);
    if (legal.some((a) => a.type === "keep_starting_hand")) {
      state = must(state, { type: "keep_starting_hand" });
      continue;
    }
    if (legal.some((a) => a.type === "discard_to_hand_size")) {
      state = must(state, { type: "discard_to_hand_size" });
      continue;
    }
    const atOtherAction =
      (state.timingKey === "corp.takeAction" && side === "runner") ||
      (state.timingKey === "runner.takeAction" && side === "corp");
    if (atOtherAction && legal.some((a) => a.type === "basic_gain_credit")) {
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
        .join(", ")}`,
    );
  }
  throw new Error(`Cannot reach ${wanted}; step budget exhausted`);
}

/** Upstream `take-credits`: spend the side's remaining clicks and end the turn. */
export function takeCredits(state: GameState, side: Side): GameState {
  return toTakeAction(state, side === "corp" ? "runner" : "corp");
}

/** Close an open action paid-ability window so the next basic action is legal. */
export function settle(state: GameState): GameState {
  for (let guard = 0; guard < 20; guard++) {
    if (state.pendingChoice) return state;
    if (!state.timingKey.endsWith("actionPaw")) return state;
    if (!legalActions(state).some((a) => a.type === "pass_window")) return state;
    state = must(state, { type: "pass_window" });
  }
  return state;
}

export function findInHand(state: GameState, side: Side, title: string): string {
  const hand = side === "corp" ? state.corp.hand : state.runner.hand;
  const id = hand.find((cardId) => state.cards[cardId]?.title === title);
  if (!id) throw new Error(`${title} is not in the ${side} hand`);
  return id;
}

export function cardByTitle(
  state: GameState,
  title: string,
  ids: readonly string[],
): CardInstance {
  const id = ids.find((cardId) => state.cards[cardId]?.title === title);
  if (!id) throw new Error(`${title} not found among ${ids.join(", ")}`);
  return state.cards[id]!;
}

/**
 * Upstream `play-from-hand`. `target` names a server ("HQ", "R&D",
 * "Archives") for ice; agenda, asset, and upgrade installs open a new
 * remote, and Runner installs go to the rig.
 */
export function playFromHand(
  state: GameState,
  side: Side,
  title: string,
  target?: string,
): GameState {
  state = settle(state);
  const cardId = findInHand(state, side, title);
  const card = state.cards[cardId]!;
  if (side === "corp" && card.type === "operation") {
    return must(state, { type: "play_operation", cardId });
  }
  if (side === "runner" && card.type === "event") {
    return must(state, { type: "play_event", cardId });
  }
  if ((card.subtypes ?? []).includes("trojan")) {
    // A trojan's host ice is its install destination in this engine, chosen
    // at install time; upstream installs first and answers a prompt.
    const ice = Object.values(state.servers)
      .flatMap((server) => server.ice)
      .map((id) => state.cards[id])
      .find((candidate) => candidate?.title === target);
    if (!ice) throw new Error(`No installed ice titled "${target}" to host ${title}`);
    return must(state, {
      type: "basic_install",
      cardId,
      destination: { kind: "host_ice", iceId: ice.id },
    });
  }
  if (card.type === "ice") {
    const central = (target ?? "").toLowerCase();
    if (central === "hq" || central === "rd" || central === "archives") {
      return must(state, {
        type: "basic_install",
        cardId,
        destination: { kind: "protect", serverId: central as ServerId },
      });
    }
    return must(state, {
      type: "basic_install",
      cardId,
      destination: { kind: "new_remote" },
    });
  }
  if (side === "corp") {
    return must(state, {
      type: "basic_install",
      cardId,
      destination: { kind: "new_remote" },
    });
  }
  return must(state, {
    type: "basic_install",
    cardId,
    destination: { kind: "installed" },
  });
}

/** Upstream `click-card` on an open prompt: choose the option naming the card. */
export function clickCard(state: GameState, title: string): GameState {
  const choice = state.pendingChoice;
  if (!choice) throw new Error(`No open choice while clicking ${title}`);
  const option =
    choice.options.find((o) => o.label.includes(title)) ??
    choice.options.find((o) => o.id.includes(slugForTitle(title)));
  if (!option) {
    throw new Error(
      `No option names ${title}; options: ${choice.options.map((o) => o.label).join(" | ")}`,
    );
  }
  return must(state, { type: "choose_option", optionId: option.id });
}

export function advance(state: GameState, cardId: string): GameState {
  return must(settle(state), { type: "advance", cardId });
}

export function remotes(state: GameState): Server[] {
  return Object.values(state.servers).filter((s) => s.kind === "remote");
}

export function firstRemote(state: GameState): Server {
  const remote = remotes(state)[0];
  if (!remote) throw new Error("No remote server exists");
  return remote;
}

export function rootCard(state: GameState, server: Server, index = 0): CardInstance {
  const id = server.root[index];
  if (!id) throw new Error(`No card at root ${index} of ${server.id}`);
  return state.cards[id]!;
}

export function iceCard(state: GameState, server: Server, index = 0): CardInstance {
  const id = server.ice[index];
  if (!id) throw new Error(`No ice at ${index} of ${server.id}`);
  return state.cards[id]!;
}

export function installedCards(state: GameState, side: Side): CardInstance[] {
  const ids = side === "corp" ? state.corp.installed : state.runner.installed;
  return ids.map((id) => state.cards[id]!);
}
