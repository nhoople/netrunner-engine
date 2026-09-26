/**
 * Short-game setup from card data for integration tests / library hosts.
 */
import { START_STEP, STEPS, cursorFrom } from "../timing/graph.js";
import { DEFAULT_CONFIG } from "../state/createGame.js";
import { emptyTurnBookkeeping } from "../state/turn.js";
import type {
  CardInstance,
  GameConfig,
  GameState,
  PlayerState,
  Server,
  ServerId,
} from "../state/types.js";
import { instantiateCard } from "./load.js";

function player(side: "corp" | "runner", identityId: string): PlayerState {
  return {
    side,
    clicks: 0,
    credits: 5,
    maxHandSize: 5,
    identityId,
    tags: 0,
    brainDamage: 0,
    link: 0,
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

/**
 * Scripted short game: Corp has Hedge Fund + Priority Requisition + Static Wall;
 * Runner has Easy Mark + Crowbar. Agenda points to win = 3 (score/steal the agenda).
 */
export function createShortGameState(
  config: Partial<GameConfig> = {},
): GameState {
  const cards: Record<string, CardInstance> = {};
  const put = (c: CardInstance) => {
    cards[c.id] = c;
  };

  put(instantiateCard("stub-corp-id", "corp-id", "corp:hq"));
  const runnerId = instantiateCard("stub-runner-id", "runner-id", "runner:grip");
  runnerId.link = 0;
  put(runnerId);

  put(instantiateCard("hedge-fund", "corp-hedge", "corp:rd"));
  put(instantiateCard("priority-requisition", "corp-agenda", "corp:rd"));
  put(instantiateCard("static-wall", "corp-ice-1", "corp:rd"));
  put(instantiateCard("pad-campaign", "corp-pad", "corp:rd"));
  // Fillers so mandatory draw / draws work
  for (let i = 1; i <= 4; i++) {
    put(instantiateCard("hedge-fund", `corp-fill-${i}`, "corp:rd"));
  }

  put(instantiateCard("easy-mark", "runner-easy", "runner:stack"));
  put(instantiateCard("crowbar", "runner-program-1", "runner:grip"));
  put(instantiateCard("aesops-pawnshop", "runner-aesop", "runner:stack"));
  for (let i = 1; i <= 3; i++) {
    put(instantiateCard("easy-mark", `runner-fill-${i}`, "runner:stack"));
  }

  const corp = player("corp", "corp-id");
  corp.deck = [
    "corp-hedge",
    "corp-agenda",
    "corp-ice-1",
    "corp-pad",
    "corp-fill-1",
    "corp-fill-2",
    "corp-fill-3",
    "corp-fill-4",
  ];
  corp.credits = 10;

  const runner = player("runner", "runner-id");
  runner.deck = ["runner-easy", "runner-aesop", "runner-fill-1", "runner-fill-2", "runner-fill-3"];
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
    winner: null,
    winReason: null,
    config: {
      ...DEFAULT_CONFIG,
      stopAfterFirstCycle: false,
      agendaPointsToWin: 3,
      ...config,
    },
    log: ["Short game start — data-loaded cards (Phase 1–3)."],
    done: false,
  };
}
