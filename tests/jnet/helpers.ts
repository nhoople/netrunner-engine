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

function normalizeTitle(title: string): string {
  return title.replace(/’/g, "'");
}

export function slugForTitle(title: string): string {
  if (!titleToSlug) {
    titleToSlug = new Map();
    for (const def of loadCardCatalog().values()) {
      titleToSlug.set(normalizeTitle(def.title), def.id);
    }
  }
  const slug = titleToSlug.get(normalizeTitle(title));
  if (!slug) throw new Error(`No pinned card titled "${title}"`);
  return slug;
}

/** Upstream `(qty "Hedge Fund" 10)`. */
export function qty(title: string, count: number): string[] {
  return Array.from({ length: count }, () => title);
}

export interface NewGameOptions {
  corpIdentity?: string;
  runnerIdentity?: string;
  corpHand?: string[];
  corpDeck?: string[];
  corpDiscard?: string[];
  runnerHand?: string[];
  runnerDeck?: string[];
  startAs?: Side;
  corpCredits?: number;
  runnerCredits?: number;
  /**
   * Leave the opening mulligan unresolved (upstream `:dont-start-game`).
   * Hands and decks are as supplied; callers answer keep/mulligan themselves.
   */
  leaveAtMulligan?: boolean;
}

/**
 * Build a game with the named hands and decks, then walk the opening to the
 * requested side's action step. Deck order is the order given; the engine's
 * own shuffles and draws proceed from there.
 */
export function newGame(options: NewGameOptions = {}): GameState {
  let state = createInitialState({ stopAfterFirstCycle: false });
  const cards: Record<string, CardInstance> = {
    "corp-id": options.corpIdentity
      ? instantiateCard(slugForTitle(options.corpIdentity), "corp-id", "corp:hq")
      : state.cards["corp-id"]!,
    "runner-id": options.runnerIdentity
      ? instantiateCard(
          slugForTitle(options.runnerIdentity),
          "runner-id",
          "runner:grip",
        )
      : state.cards["runner-id"]!,
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
  const corpDiscard = (options.corpDiscard ?? []).map((t) =>
    place("corp", t, "corp:archives"),
  );
  state.corp.deck = corpDeck;
  state.corp.hand = corpHand;
  state.corp.discardPile = corpDiscard;
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

  if (options.leaveAtMulligan) {
    return state;
  }
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
  const id = hand.find(
    (cardId) =>
      normalizeTitle(state.cards[cardId]?.title ?? "") === normalizeTitle(title),
  );
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
function centralId(target?: string): ServerId | null {
  const name = (target ?? "").toLowerCase();
  if (name === "hq") return "hq";
  if (name === "rd" || name === "r&d") return "rd";
  if (name === "archives") return "archives";
  return null;
}

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
    const serverId = centralId(target);
    return must(
      state,
      serverId
        ? { type: "play_event", cardId, serverId }
        : { type: "play_event", cardId },
    );
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
    const central = centralId(target);
    if (central) {
      return must(state, {
        type: "basic_install",
        cardId,
        destination: { kind: "protect", serverId: central },
      });
    }
    return must(state, {
      type: "basic_install",
      cardId,
      destination: { kind: "new_remote" },
    });
  }
  if (side === "corp" && card.type === "upgrade") {
    const central = centralId(target);
    if (central) {
      return must(state, {
        type: "basic_install",
        cardId,
        destination: { kind: "remote_root", serverId: central },
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

/**
 * Advance the named agenda to its requirement across as many Corp turns as
 * it takes, then score it.
 */
export function scoreAgenda(state: GameState, cardId: string): GameState {
  for (let guard = 0; guard < 200; guard++) {
    const legal = legalActions(state);
    if (legal.some((a) => a.type === "score_agenda" && a.cardId === cardId)) {
      return must(state, { type: "score_agenda", cardId });
    }
    if (state.timingKey === "corp.takeAction") {
      const card = state.cards[cardId]!;
      const requirement = card.advancementRequirement ?? 0;
      if ((card.advancementCounters ?? 0) < requirement) {
        state = must(settle(state), { type: "advance", cardId });
      } else {
        state = must(settle(state), { type: "basic_gain_credit" });
      }
      continue;
    }
    if (state.timingKey === "runner.takeAction") {
      state = toTakeAction(state, "corp");
      continue;
    }
    if (legal.some((a) => a.type === "discard_to_hand_size")) {
      state = must(state, { type: "discard_to_hand_size" });
      continue;
    }
    if (legal.some((a) => a.type === "pass_window")) {
      state = must(state, { type: "pass_window" });
      continue;
    }
    throw new Error(
      `Score of ${cardId} parked at ${state.timingKey} with ${legal
        .map((a) => a.type)
        .join(", ")}`,
    );
  }
  throw new Error(`Score of ${cardId} never became legal`);
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

/** Upstream `click-prompt`: choose the open option whose label names `label`. */
export function clickPrompt(state: GameState, label: string): GameState {
  const choice = state.pendingChoice;
  if (!choice) throw new Error(`No open choice while clicking "${label}"`);
  const option =
    choice.options.find((o) => o.label === label) ??
    choice.options.find((o) => o.label.includes(label));
  if (!option) {
    throw new Error(
      `No option names "${label}"; options: ${choice.options.map((o) => o.label).join(" | ")}`,
    );
  }
  return must(state, { type: "choose_option", optionId: option.id });
}

/**
 * Upstream `run-on` plus continuing to the breach: start a run and pass the
 * intervening windows until access candidates are offered or the run ends.
 */
export function runToAccess(state: GameState, serverId: ServerId): GameState {
  state = must(settle(state), { type: "basic_run", serverId });
  return walkToAccess(state, serverId);
}

/** Pass the intervening windows of an already-started run until access. */
export function walkToAccess(state: GameState, serverId: ServerId): GameState {
  for (let guard = 0; guard < 200; guard++) {
    if (!state.run) return state;
    if (state.timingKey === "breach.awaitAccess") return state;
    if (state.pendingChoice) {
      throw new Error(
        `Open choice during run to ${serverId}: ${state.pendingChoice.options
          .map((o) => o.label)
          .join(" | ")}`,
      );
    }
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
      `Run to ${serverId} parked at ${state.timingKey} with ${legal
        .map((a) => a.type)
        .join(", ")}`,
    );
  }
  throw new Error(`Run to ${serverId} did not reach access`);
}

/** Access one offered candidate. */
export function accessCard(state: GameState, cardId: string): GameState {
  return must(state, { type: "access_card", cardId });
}

/**
 * Decline whatever the accessed card offers and walk until the next access
 * candidate is offered or the run ends.
 */
export function finishAccess(state: GameState): GameState {
  for (let guard = 0; guard < 200; guard++) {
    if (!state.run) return state;
    if (state.timingKey === "breach.awaitAccess" && !state.run.accessingCardId) {
      return state;
    }
    const legal = legalActions(state);
    if (
      state.run.accessingCardId &&
      legal.some((a) => a.type === "finish_access")
    ) {
      state = must(state, { type: "finish_access" });
      continue;
    }
    if (legal.some((a) => a.type === "pass_window")) {
      state = must(state, { type: "pass_window" });
      continue;
    }
    if (state.pendingChoice) {
      throw new Error(
        `Open choice while finishing access: ${state.pendingChoice.options
          .map((o) => o.label)
          .join(" | ")}`,
      );
    }
    throw new Error(
      `Access parked at ${state.timingKey} with ${legal.map((a) => a.type).join(", ")}`,
    );
  }
  throw new Error("Access did not finish");
}

/** Steal the currently accessed agenda. */
export function stealAccessed(state: GameState, cardId: string): GameState {
  for (let guard = 0; guard < 200; guard++) {
    const legal = legalActions(state);
    if (
      legal.some((a) => a.type === "steal_agenda" && a.cardId === cardId)
    ) {
      return must(state, { type: "steal_agenda", cardId });
    }
    if (legal.some((a) => a.type === "pass_window")) {
      state = must(state, { type: "pass_window" });
      continue;
    }
    throw new Error(
      `Steal of ${cardId} parked at ${state.timingKey} with ${legal
        .map((a) => a.type)
        .join(", ")}`,
    );
  }
  throw new Error(`Steal of ${cardId} never became legal`);
}

/** Title of the card currently being accessed, if any. */
export function accessingTitle(state: GameState): string | null {
  const id = state.run?.accessingCardId;
  return id ? (state.cards[id]?.title ?? null) : null;
}

/** Upstream `rez`: rez the named card in its current window. */
export function rezCard(state: GameState, cardId: string): GameState {
  const card = state.cards[cardId];
  if (!card) throw new Error(`${cardId} is not on the board`);
  return must(
    state,
    card.type === "ice"
      ? { type: "rez_ice", cardId }
      : { type: "rez_asset", cardId },
  );
}

/**
 * Start a run on a server, rez the named ice, and walk to the encounter
 * paid-ability window where pumping and breaking are legal.
 */
export function startEncounter(
  state: GameState,
  serverId: ServerId,
  iceId: string,
): GameState {
  state = must(settle(state), { type: "basic_run", serverId });
  for (let guard = 0; guard < 200; guard++) {
    if (state.timingKey === "run.encounterPaw") return state;
    const opening = legalActions(state);
    if (
      !state.cards[iceId]?.rezzed &&
      opening.some((a) => a.type === "rez_ice" && a.cardId === iceId)
    ) {
      state = must(state, { type: "rez_ice", cardId: iceId });
      continue;
    }
    if (state.pendingChoice) {
      throw new Error(
        `Open choice before encounter: ${state.pendingChoice.options
          .map((o) => o.label)
          .join(" | ")}`,
      );
    }
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
      `Encounter parked at ${state.timingKey} with ${legal.map((a) => a.type).join(", ")}`,
    );
  }
  throw new Error("Encounter never opened");
}

/** Use a breaker's pump paid ability once. */
export function pumpBreaker(
  state: GameState,
  breakerId: string,
  abilityId: string,
): GameState {
  return must(state, { type: "use_paid_ability", cardId: breakerId, abilityId });
}

/** Break one subroutine with the named breaker. */
export function breakSubroutine(
  state: GameState,
  breakerId: string,
  subIndex: number,
): GameState {
  return must(state, { type: "break_subroutine", breakerId, subIndex });
}
