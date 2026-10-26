/**
 * Pure library API for hosts (CLI, tests, future online Project).
 * No sockets / HTTP / UI — intents in, state out.
 */
import { applyAction } from "../actions/apply.js";
import { queryLegality } from "../legality/query.js";
import { createInitialState } from "../state/createGame.js";
import { agendaPointsFor } from "../state/scoring.js";
import { lingeringPlayAreaIds } from "../state/zones.js";
import { consideredAdvancement, gripRevealed } from "../state/cardDeclarations.js";
import type {
  Action,
  ApplyResult,
  CardInstance,
  GameConfig,
  GameState,
  Intent,
  PublicHostedCardView,
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
    return state;
  }
  return createInitialState({
    agendaPointsToWin: options.agendaPointsToWin ?? 7,
    stopAfterFirstCycle: options.stopAfterFirstCycle ?? false,
  });
}

/** Apply a host intent (alias of applyAction). */
export function applyIntent(state: GameState, intent: Intent): ApplyResult {
  return applyAction(state, intent as Action);
}

export { queryLegality };

/** Advancement counters hosted on an installed card. Zero stays unset. */
function openAdvancement(
  state: GameState,
  card: CardInstance,
): number | null {
  const count = consideredAdvancement(state, card);
  return count > 0 ? count : null;
}

/** Credit counters hosted on an installed card (CR 1.9.5a). Zero stays unset. */
function openHostedCredits(card: { hostedCredits?: number }): number | null {
  const count = card.hostedCredits ?? 0;
  return count > 0 ? count : null;
}

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

/**
 * Face of a card in the play area / set-aside for a viewer (CR 4.6.3 / 4.8.6).
 * Location is always open; the face is open when faceup or the viewer controls it.
 */
function openFace(
  card: CardInstance,
  viewer: Side,
): { title: string | null; type: CardInstance["type"] | null } {
  const faceOpen = card.faceup || card.side === viewer;
  return {
    title: faceOpen ? card.title : null,
    type: faceOpen ? card.type : null,
  };
}

function hostedCardViews(
  state: GameState,
  hostId: string,
  viewer: Side,
): PublicHostedCardView[] {
  const host = state.cards[hostId];
  if (!host) return [];
  const out: PublicHostedCardView[] = [];
  for (const hid of host.hostedCardIds ?? []) {
    const card = state.cards[hid];
    if (!card) continue;
    const face = openFace(card, viewer);
    out.push({
      id: hid,
      title: face.title,
      type: face.type,
      faceup: card.faceup,
      side: card.side,
    });
  }
  return out;
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

function publicPendingChoice(state: GameState, viewer: Side) {
  const choice = state.pendingChoice;
  if (!choice) return null;
  const copy = structuredClone(choice);
  if (viewer === choice.chooser) return copy;
  copy.options = copy.options.map((option) => {
    if (option.id.startsWith("dbs-bottom:")) {
      return { ...option, label: "Add a set-aside card to the bottom of R&D" };
    }
    if (option.id.startsWith("cultivate-trash:")) {
      return { ...option, label: "Trash a looked card" };
    }
    if (option.id.startsWith("cultivate-hq:")) {
      return { ...option, label: "Add a looked card to HQ" };
    }
    if (option.id.startsWith("rd-arrange:")) {
      return { ...option, label: "Place a looked card on R&D next" };
    }
    if (option.id.startsWith("raman:")) {
      return { ...option, label: "Swap a drawn card with an Archives card" };
    }
    return option;
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
        const visible = card.rezzed || side === "corp";
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
    pendingSabotage: state.pendingSabotage
      ? structuredClone(state.pendingSabotage)
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
    markServerId: state.markServerId,
    pendingAbilities: structuredClone(state.pendingAbilities),
    reactionStack: structuredClone(state.reactionStack),
    lingeringEffects: structuredClone(state.lingeringEffects),
    priorityStack: structuredClone(state.priorityStack),
    log: [...state.log],
  };
}
