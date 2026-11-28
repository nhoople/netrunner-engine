/**
 * A run in progress, for tests that set one up by hand. Every field
 * `RunState` requires is set, at the value the engine starts a run with
 * (`src/actions/run.ts`), so a test names only what its case is about.
 */
import type { RunState } from "../../../src/state/types/run.js";
import type { ServerId } from "../../../src/state/types/servers.js";

export function runState(
  attackedServerId: ServerId,
  phase: RunState["phase"],
  over: Partial<RunState> = {},
): RunState {
  return {
    attackedServerId,
    phase,
    position: null,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
    ...over,
  };
}
