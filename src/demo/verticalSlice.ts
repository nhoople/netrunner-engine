import { applyAction, legalActions } from "../actions/apply.js";
import { createInitialState } from "../state/createGame.js";
import type { Action, GameState, ServerId } from "../state/types.js";

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(`${result.error} cites=${JSON.stringify(result.cites)}`);
  }
  return result.state;
}

function pass(state: GameState): GameState {
  return must(state, { type: "pass_window" });
}

/**
 * Vertical slice: Corp credit/draw → install ice (empty remote) →
 * Runner run empty server → access/breach (0 cards) → end.
 */
export function runVerticalSlice(): GameState {
  let s = createInitialState();

  // Corp draw phase: gain clicks → mandatory draw
  s = pass(s);
  s = pass(s);

  // Actions (3 clicks): draw ice, gain credit, install ice → new empty remote
  s = pass(s); // paid window → take action
  s = must(s, { type: "basic_draw" });
  s = pass(s);
  s = must(s, { type: "basic_gain_credit" });
  s = pass(s);

  const iceId = s.corp.hand.find((id) => s.cards[id].type === "ice");
  if (!iceId) throw new Error("Expected ice in HQ after draw");
  s = must(s, {
    type: "basic_install",
    cardId: iceId,
    destination: { kind: "new_remote" },
  });
  // clicks = 0 → actionPhaseEnd

  s = pass(s); // → discard phase
  s = must(s, { type: "discard_to_hand_size" });
  s = pass(s); // → Runner turn

  // Runner: gain clicks (no draw phase)
  s = pass(s);
  s = pass(s); // window → action

  const emptyRemote = Object.values(s.servers).find(
    (srv) => srv.kind === "remote" && srv.root.length === 0,
  );
  if (!emptyRemote) throw new Error("Expected empty remote");

  s = must(s, { type: "basic_run", serverId: emptyRemote.id as ServerId });
  // Run auto-resolves through unrezzed ice → success → empty breach → action window

  while (s.runner.clicks > 0) {
    if (
      s.timing.stepId ===
      "sec_appendix_timing_structure_runners_turn_1_e"
    ) {
      s = pass(s);
    }
    s = must(s, { type: "basic_gain_credit" });
  }

  s = pass(s); // action phase end → discard
  s = must(s, { type: "discard_to_hand_size" });
  s = pass(s); // turn complete / done

  return s;
}

export function listLegal(state: GameState): Action[] {
  return legalActions(state);
}
