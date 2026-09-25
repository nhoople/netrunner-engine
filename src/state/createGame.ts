import type {
  CardInstance,
  GameState,
  PlayerState,
  Server,
  ServerId,
  TimingCursor,
} from "./types.js";

function player(side: "corp" | "runner", identityId: string): PlayerState {
  return {
    side,
    clicks: 0,
    credits: 5,
    maxHandSize: 5,
    identityId,
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

export const CORP_DRAW_START: TimingCursor = {
  structure: "corp_turn",
  stepId: "sec_appendix_timing_structure_corps_turn_1_a",
  stepNumber: "11.2_1_a",
  label: "The Corp gains allotted clicks.",
};

/** Minimal stub deck for the vertical-slice demo and tests. */
export function createInitialState(): GameState {
  const cards: Record<string, CardInstance> = {};

  const put = (card: CardInstance) => {
    cards[card.id] = card;
  };

  put({
    id: "corp-id",
    title: "Stub Corp ID",
    type: "identity",
    side: "corp",
    installCost: 0,
    faceup: true,
    rezzed: true,
    zone: "corp:hq",
  });
  put({
    id: "runner-id",
    title: "Stub Runner ID",
    type: "identity",
    side: "runner",
    installCost: 0,
    faceup: true,
    rezzed: true,
    zone: "runner:grip",
  });

  // Corp R&D stubs (top → bottom).
  const corpDeck = ["corp-asset-1", "corp-ice-1", "corp-fill-1", "corp-fill-2", "corp-fill-3"];
  for (const id of corpDeck) {
    const type = id === "corp-asset-1" ? "asset" : id === "corp-ice-1" ? "ice" : "operation";
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

  // Runner stack + one installable program in grip for install slice.
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
    title: "Stub Program",
    type: "program",
    side: "runner",
    installCost: 0,
    faceup: true,
    rezzed: true,
    zone: "runner:grip",
  });

  const corp = player("corp", "corp-id");
  corp.deck = [...corpDeck];
  corp.hand = [];
  corp.credits = 5;

  const runner = player("runner", "runner-id");
  runner.deck = [...runnerDeck];
  runner.hand = ["runner-program-1"];
  runner.credits = 5;

  const servers: Record<ServerId, Server> = {
    hq: central("hq"),
    rd: central("rd"),
    archives: central("archives"),
  };

  return {
    turnNumber: 1,
    activeSide: "corp",
    turnPhase: "corp_draw",
    corp,
    runner,
    cards,
    servers,
    nextRemoteNumber: 1,
    run: null,
    timing: { ...CORP_DRAW_START },
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
