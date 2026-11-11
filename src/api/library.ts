/**
 * Pure library API for hosts (CLI, tests, future online Project).
 * No sockets / HTTP / UI — intents in, state out.
 */
import { applyAction } from "../actions/apply.js";
import { queryLegality } from "../legality/query.js";
import { createInitialState } from "../state/createGame.js";
import { seedRng } from "../state/rng.js";
import { gripRevealed } from "../state/cardDeclarations.js";
import { agendaPointsFor } from "../state/scoring.js";
import {
  hostedCardViews,
  iceFaceVisible,
  openAdvancement,
  openFace,
  openHostedCredits,
} from "../state/seatVisibility.js";
import { currentMark } from "../state/msKeywords.js";
import { lingeringPlayAreaIds } from "../state/zones.js";
import type {
  Action,
  ApplyResult,
  GameConfig,
  GameState,
  Intent,
  PublicPlayAreaCardView,
  PublicSetAsideCardView,
  PublicView,
  Side,
} from "../state/types.js";

export type CreateGameOptions = Partial<GameConfig> & {
  /**
   * When provided, use this state factory instead of the default stub setup.
   * Card-data hosts pass a loader that builds from vendored `vendor/cards-data/`.
   */
  setup?: () => GameState;
};

/**
 * Create a new game. Defaults to a multi-turn library game
 * (`stopAfterFirstCycle: false`). Use `createInitialState` for legacy demos.
 */
export function createGame(options: CreateGameOptions = {}): GameState {
  if (options.setup) {
    const state = options.setup();
    state.config = {
      ...state.config,
      agendaPointsToWin:
        options.agendaPointsToWin ?? state.config.agendaPointsToWin,
      stopAfterFirstCycle:
        options.stopAfterFirstCycle ?? state.config.stopAfterFirstCycle,
    };
    if (options.seed !== undefined) seedRng(state, options.seed);
    return state;
  }
  return createInitialState({
    agendaPointsToWin: options.agendaPointsToWin ?? 7,
    stopAfterFirstCycle: options.stopAfterFirstCycle ?? false,
    seed: options.seed,
  });
}

/** Apply a host intent (alias of applyAction). */
export function applyIntent(state: GameState, intent: Intent): ApplyResult {
  return applyAction(state, intent as Action);
}

export { queryLegality };

/** Ice named by these installed cards. Both seats see the same marks (CR 10.2.3b). */
function openChosenIce(
  state: GameState,
  ids: readonly string[],
): Array<{ cardId: string; iceId: string }> {
  const marks: Array<{ cardId: string; iceId: string }> = [];
  for (const cardId of ids) {
    const iceId = state.cards[cardId]?.chosenIceId;
    if (iceId) marks.push({ cardId, iceId });
  }
  return marks;
}

function lingeringPlayAreaViews(
  state: GameState,
  side: Side,
  viewer: Side,
): PublicPlayAreaCardView[] {
  const out: PublicPlayAreaCardView[] = [];
  for (const id of lingeringPlayAreaIds(state, side)) {
    const card = state.cards[id];
    if (!card) continue;
    const face = openFace(card, viewer);
    out.push({
      id,
      title: face.title,
      type: face.type,
      faceup: card.faceup,
      side: card.side,
      hostedCards: hostedCardViews(state, id, viewer),
    });
  }
  return out;
}

/**
 * Ids of cards whose face the viewer may not see: cards in the other
 * player's hand, facedown cards in either deck, facedown cards in Archives,
 * unrezzed installed Corp cards, and facedown Runner cards
 * (CR 1.21.1, 4.4.6c).
 */
function idsHiddenFrom(state: GameState, viewer: Side): string[] {
  const other = viewer === "corp" ? state.runner : state.corp;
  const otherHand = new Set(other.hand);
  const decks = new Set([...state.corp.deck, ...state.runner.deck]);
  const handOpen = viewer === "corp" && gripRevealed(state);
  const hidden: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.type === "identity") continue;
    if (decks.has(card.id)) {
      if (!card.faceup) hidden.push(card.id);
      continue;
    }
    if (card.side === viewer) continue;
    if (otherHand.has(card.id)) {
      if (!handOpen) hidden.push(card.id);
      continue;
    }
    if (!(card.faceup || card.rezzed)) hidden.push(card.id);
  }
  return hidden;
}

/** Every string inside an effect tree: the card ids it can name. */
function stringsIn(value: unknown, out: Set<string>): void {
  if (typeof value === "string") out.add(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, out);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) stringsIn(item, out);
  }
}

function idNames(optionId: string, cardId: string): boolean {
  if (optionId === cardId) return true;
  return (
    optionId.endsWith(`:${cardId}`) ||
    optionId.startsWith(`${cardId}:`) ||
    optionId.includes(`:${cardId}:`)
  );
}

/** Label the other player reads for an option that names a hidden card. */
function hiddenOptionLabel(optionId: string): string {
  if (optionId.startsWith("dbs-bottom:")) return "Add a set-aside card to the bottom of R&D";
  if (optionId.startsWith("cultivate-trash:")) return "Trash a looked card";
  if (optionId.startsWith("cultivate-hq:")) return "Add a looked card to HQ";
  if (optionId.startsWith("rd-arrange:")) return "Place a looked card on R&D next";
  if (optionId.startsWith("raman:")) return "Swap a drawn card with an Archives card";
  return "Hidden";
}

/**
 * True when the pending option names a card the chooser's opponent may
 * not see, so the log must not carry its label (CR 1.21.2).
 */
export function pendingOptionHiddenFromOpponent(
  state: GameState,
  optionId: string,
): boolean {
  const choice = state.pendingChoice;
  if (!choice || choice.shownToOpponent) return false;
  if (choice.hiddenFromOpponent) return true;
  const option = choice.options.find((o) => o.id === optionId);
  if (!option) return false;
  const viewer: Side = choice.chooser === "corp" ? "runner" : "corp";
  const hiddenIds = idsHiddenFrom(state, viewer);
  const hiddenSet = new Set(hiddenIds);
  const named = new Set<string>();
  stringsIn(option.effect, named);
  return (
    [...named].some((value) => hiddenSet.has(value)) ||
    hiddenIds.some((id) => idNames(option.id, id))
  );
}

function publicPendingChoice(state: GameState, viewer: Side) {
  const choice = state.pendingChoice;
  if (!choice) return null;
  const copy = structuredClone(choice);
  if (viewer === choice.chooser) return copy;
  // The other player cannot pick an option. They do not get what each
  // option would do, and an option that names a card they may not see is
  // shown without its id or label (CR 1.21.2).
  const noEffect = {
    op: "do" as const,
    action: { kind: "gain_credits" as const, side: viewer, amount: 0 },
  };
  if (choice.shownToOpponent) {
    copy.options = copy.options.map((option) => ({ ...option, effect: noEffect }));
    return copy;
  }
  const hiddenIds = idsHiddenFrom(state, viewer);
  const hiddenSet = new Set(hiddenIds);
  copy.options = copy.options.map((option, index) => {
    const named = new Set<string>();
    stringsIn(option.effect, named);
    const hidden =
      choice.hiddenFromOpponent === true ||
      [...named].some((value) => hiddenSet.has(value)) ||
      hiddenIds.some((id) => idNames(option.id, id));
    if (!hidden) return { ...option, effect: noEffect };
    return {
      id: `hidden:${index}`,
      label: choice.hiddenFromOpponent ? "Hidden" : hiddenOptionLabel(option.id),
      effect: noEffect,
    };
  });
  return copy;
}

function setAsideViews(
  state: GameState,
  viewer: Side,
): PublicSetAsideCardView[] {
  const out: PublicSetAsideCardView[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const card = state.cards[id];
    if (!card) return;
    const face = openFace(card, viewer);
    out.push({
      id,
      title: face.title,
      type: face.type,
      faceup: card.faceup,
      side: card.side,
      // Facedown groups are open as location groupings (CR 4.8.7); faces stay secret.
      ...(card.faceup ? {} : { groupId: card.setAsideGroupId ?? null }),
    });
  };
  for (const id of state.runner.setAside ?? []) push(id);
  for (const id of state.corp.corpSetAside ?? []) push(id);
  for (const id of state.corp.setAside ?? []) push(id);
  for (const id of state.pendingDrawSetAside?.cardIds ?? []) push(id);
  return out;
}

/** Side-filtered public view for future online hosts. */
export function getPublicView(state: GameState, side: Side): PublicView {
  const self = side === "corp" ? state.corp : state.runner;
  const opp = side === "corp" ? state.runner : state.corp;
  const oppSide: Side = side === "corp" ? "runner" : "corp";

  return {
    viewer: side,
    turnNumber: state.turnNumber,
    activeSide: state.activeSide,
    timingKey: state.timingKey,
    timing: { ...state.timing },
    done: state.done,
    winner: state.winner,
    winReason: state.winReason,
    self: {
      clicks: self.clicks,
      credits: self.credits,
      tags: self.tags,
      coreDamage: self.coreDamage,
      link: self.link,
      maxHandSize: self.maxHandSize,
      hand: [...self.hand],
      handCount: self.hand.length,
      deckCount: self.deck.length,
      discardPile: [...self.discardPile],
      scoreArea: [...self.scoreArea],
      scorePoints: agendaPointsFor(state, side),
      installed: [...self.installed],
      chosenIce: openChosenIce(state, self.installed),
      playArea: lingeringPlayAreaViews(state, side, side),
      identityId: self.identityId,
    },
    opponent: {
      clicks: opp.clicks,
      credits: opp.credits,
      tags: opp.tags,
      coreDamage: opp.coreDamage,
      link: opp.link,
      maxHandSize: opp.maxHandSize,
      handCount: opp.hand.length,
      revealedHand:
        oppSide === "runner" && gripRevealed(state) ? [...state.runner.hand] : undefined,
      deckCount: opp.deck.length,
      discardPileFaceup: opp.discardPile.filter((id) => state.cards[id].faceup),
      scoreArea: [...opp.scoreArea],
      scorePoints: agendaPointsFor(state, oppSide),
      installed: [...opp.installed],
      chosenIce: openChosenIce(state, opp.installed),
      playArea: lingeringPlayAreaViews(state, oppSide, side),
      identityId: opp.identityId,
    },
    setAside: setAsideViews(state, side),
    badPublicityFund: state.badPublicityFund ?? 0,
    servers: Object.values(state.servers).map((server) => ({
      id: server.id,
      kind: server.kind,
      ice: server.ice.map((id) => {
        const card = state.cards[id];
        const visible = iceFaceVisible(card, side);
        return {
          id,
          title: visible ? card.title : null,
          rezzed: card.rezzed,
          strength: visible ? (card.strength ?? null) : null,
          // Counters on an installed card are open even when the face is hidden (CR 1.18.1, CR 10.2.3a, CR 10.2.2a).
          advancementCounters: openAdvancement(state, card),
          hostedCredits: openHostedCredits(card),
          hostedCards: hostedCardViews(state, id, side),
        };
      }),
      root: server.root.map((id) => {
        const card = state.cards[id];
        const hostedPublic = (card.hostedCardIds ?? []).some(
          (hid) => state.cards[hid]?.hostAgendaGainsPublic,
        );
        const visible = card.rezzed || card.faceup || side === "corp" || hostedPublic;
        return {
          id,
          title: visible ? card.title : null,
          rezzed: card.rezzed,
          type: visible ? card.type : null,
          advancementCounters: openAdvancement(state, card),
          hostedCredits: openHostedCredits(card),
          hostedCards: hostedCardViews(state, id, side),
        };
      }),
    })),
    run: state.run ? structuredClone(state.run) : null,
    trace: state.trace ? structuredClone(state.trace) : null,
    pendingDamage: state.pendingDamage
      ? structuredClone(state.pendingDamage)
      : null,
    pendingTags: state.pendingTags
      ? structuredClone(state.pendingTags)
      : null,
    pendingEndTheRun: state.pendingEndTheRun
      ? structuredClone(state.pendingEndTheRun)
      : null,
    pendingEffectContinuation: state.pendingEffectContinuation
      ? structuredClone(state.pendingEffectContinuation)
      : null,
    pendingTrashProgram: state.pendingTrashProgram
      ? structuredClone(state.pendingTrashProgram)
      : null,
    // The Corp's HQ picks are not the Runner's to see (CR 10.12.2a).
    pendingSabotage: state.pendingSabotage
      ? {
          sourceId: state.pendingSabotage.sourceId,
          amount: state.pendingSabotage.amount,
          ...(side === "corp" && state.pendingSabotage.picked
            ? { picked: [...state.pendingSabotage.picked] }
            : {}),
        }
      : null,
    pendingChoice: publicPendingChoice(state, side),
    pendingExclusiveChoices: state.pendingExclusiveChoices
      ? structuredClone(state.pendingExclusiveChoices)
      : null,
    pendingStartRunOnMark: state.pendingStartRunOnMark
      ? structuredClone(state.pendingStartRunOnMark)
      : null,
    pendingStartRun: state.pendingStartRun
      ? structuredClone(state.pendingStartRun)
      : null,
    pendingScoreAgendaId: state.pendingScoreAgendaId,
    pendingRezCardId: state.pendingRezCardId,
    markServerId: currentMark(state),
    pendingAbilities: structuredClone(state.pendingAbilities),
    reactionStack: structuredClone(state.reactionStack),
    lingeringEffects: structuredClone(state.lingeringEffects),
    priorityStack: structuredClone(state.priorityStack),
    log: [...state.log],
  };
}
