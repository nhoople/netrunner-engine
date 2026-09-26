import { applyBreakerDef, applyIceDef } from "../cards/stubs.js";
import { instantiateCard } from "../cards/load.js";
import { START_STEP, STEPS, cursorFrom } from "../timing/graph.js";
import { emptyTurnBookkeeping } from "./turn.js";
import type {
  CardInstance,
  GameConfig,
  GameState,
  PlayerState,
  Server,
  ServerId,
} from "./types.js";

function player(side: "corp" | "runner", identityId: string): PlayerState {
  return {
    side,
    clicks: 0,
    credits: 5,
    maxHandSize: 5,
    identityId,
    tags: 0,
    brainDamage: 0,
    link: side === "runner" ? 0 : 0,
    memoryLimit: side === "runner" ? 4 : 0,
    deck: [],
    hand: [],
    discard: [],
    score: [],
    rig: [],
  };
}

function central(id: "hq" | "rd" | "archives"): Server {
  return { id, kind: "central", ice: [], root: [] };
}

export const DEFAULT_CONFIG: GameConfig = {
  agendaPointsToWin: 7,
  stopAfterFirstCycle: true,
};

/**
 * Minimal demo deck from System Gateway / SU21 cards.
 * Default ice: Ice Wall; default breaker: Marjanah.
 */
export function createInitialState(
  config: Partial<GameConfig> = {},
): GameState {
  const cards: Record<string, CardInstance> = {};

  const put = (card: CardInstance) => {
    cards[card.id] = card;
  };

  put(
    instantiateCard(
      "haas-bioroid-precision-design",
      "corp-id",
      "corp:hq",
    ),
  );
  const runnerId = instantiateCard(
    "the-catalyst-convention-breaker",
    "runner-id",
    "runner:grip",
  );
  runnerId.link = 0;
  put(runnerId);

  const corpDeck = [
    "corp-asset-1",
    "corp-ice-1",
    "corp-fill-1",
    "corp-fill-2",
    "corp-fill-3",
  ];
  for (const id of corpDeck) {
    const type =
      id === "corp-asset-1" ? "asset" : id === "corp-ice-1" ? "ice" : "operation";
    put({
      id,
      title: id,
      type,
      side: "corp",
      installCost: type === "ice" ? 1 : 0,
      faceup: false,
      rezzed: false,
      zone: "corp:rd",
    });
  }
  applyIceDef(cards["corp-ice-1"], "ice-wall");

  const runnerDeck = ["runner-fill-1", "runner-fill-2", "runner-fill-3"];
  for (const id of runnerDeck) {
    put({
      id,
      title: id,
      type: "event",
      side: "runner",
      installCost: 0,
      faceup: false,
      rezzed: false,
      zone: "runner:stack",
    });
  }
  put({
    id: "runner-program-1",
    title: "Marjanah",
    type: "program",
    side: "runner",
    installCost: 0,
    faceup: true,
    rezzed: true,
    zone: "runner:grip",
  });
  applyBreakerDef(cards["runner-program-1"], "marjanah");

  const corp = player("corp", "corp-id");
  corp.deck = [...corpDeck];
  corp.hand = [];
  corp.credits = 5;

  const runner = player("runner", "runner-id");
  runner.deck = [...runnerDeck];
  runner.hand = ["runner-program-1"];
  runner.credits = 5;
  runner.link = 0;

  const servers: Record<ServerId, Server> = {
    hq: central("hq"),
    rd: central("rd"),
    archives: central("archives"),
  };

  const start = STEPS[START_STEP];

  return {
    turnNumber: 1,
    activeSide: "corp",
    turnPhase: start.turnPhase ?? "corp_draw",
    corp,
    runner,
    cards,
    servers,
    nextRemoteNumber: 1,
    run: null,
    timingKey: START_STEP,
    timing: cursorFrom(start),
    checkpoints: [],
    priorityStack: [],
    restrictions: [],
    trace: null,
    pendingDamage: null,
    pendingTrashProgram: null,
    pendingChoice: null,
    turn: emptyTurnBookkeeping(),
    removedFromGame: [],
    winner: null,
    winReason: null,
    config: { ...DEFAULT_CONFIG, ...config },
    log: ["Game start — Corp turn 1 (CR 5.6 / appendix 11.2)."],
    done: false,
  };
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function activePlayer(state: GameState): PlayerState {
  return state.activeSide === "corp" ? state.corp : state.runner;
}

export function log(state: GameState, message: string): void {
  state.log.push(message);
}
