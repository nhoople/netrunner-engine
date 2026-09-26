/**
 * Pure library API for hosts (CLI, tests, future online Project).
 * No sockets / HTTP / UI — intents in, state out.
 */
import { applyAction } from "../actions/apply.js";
import { queryLegality } from "../legality/query.js";
import { createInitialState } from "../state/createGame.js";
import { agendaPointsFor } from "../state/scoring.js";
import type {
  Action,
  ApplyResult,
  GameConfig,
  GameState,
  Intent,
  PublicView,
  Side,
} from "../state/types.js";

export type CreateGameOptions = Partial<GameConfig> & {
  /**
   * When provided, use this state factory instead of the default stub setup.
   * Card-data hosts pass a loader that builds from `data/cards/`.
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
      brainDamage: self.brainDamage,
      link: self.link,
      maxHandSize: self.maxHandSize,
      hand: [...self.hand],
      handCount: self.hand.length,
      deckCount: self.deck.length,
      discard: [...self.discard],
      score: [...self.score],
      scorePoints: agendaPointsFor(state, side),
      rig: [...self.rig],
      identityId: self.identityId,
    },
    opponent: {
      clicks: opp.clicks,
      credits: opp.credits,
      tags: opp.tags,
      brainDamage: opp.brainDamage,
      link: opp.link,
      maxHandSize: opp.maxHandSize,
      handCount: opp.hand.length,
      deckCount: opp.deck.length,
      discardFaceup: opp.discard.filter((id) => state.cards[id].faceup),
      score: [...opp.score],
      scorePoints: agendaPointsFor(state, oppSide),
      rig: [...opp.rig],
      identityId: opp.identityId,
    },
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
        };
      }),
      root: server.root.map((id) => {
        const card = state.cards[id];
        const visible = card.rezzed || card.faceup || side === "corp";
        return {
          id,
          title: visible ? card.title : null,
          rezzed: card.rezzed,
          type: visible ? card.type : null,
          advancementTokens:
            side === "corp" || card.faceup
              ? (card.advancementTokens ?? null)
              : null,
        };
      }),
    })),
    run: state.run ? structuredClone(state.run) : null,
    trace: state.trace ? structuredClone(state.trace) : null,
    pendingDamage: state.pendingDamage
      ? structuredClone(state.pendingDamage)
      : null,
    pendingTrashProgram: state.pendingTrashProgram
      ? structuredClone(state.pendingTrashProgram)
      : null,
    priorityStack: structuredClone(state.priorityStack),
    log: [...state.log],
  };
}
