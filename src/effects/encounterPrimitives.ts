/**
 * Encounter primitives that live in the effect evaluator.
 * Approaching ice and resolving the run stay in apply.ts.
 */
import { log } from "../state/createGame.js";
import { CR } from "../timing/labels.js";
import {
  fireOnBypassTriggers,
  type EffectCtx,
  type EvalResult,
} from "./eval.js";
import { fireOnEncounterEnd } from "../state/cardLifecycleHooks.js";
import type { Primitive } from "./ir.js";

export function applyEncounterPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "bypass_current_ice": {
      if (!state.run?.encounter) {
        return {
          ok: false,
          error: "Bypass requires an encounter.",
          cites: [CR.encounterBreakPaw],
        };
      }
      const iceId = state.run.encounter.iceId;
      const ice = state.cards[iceId];
      if (
        action.requireSubtype &&
        !(ice.subtypes ?? []).includes(action.requireSubtype)
      ) {
        return {
          ok: false,
          error: `Bypass requires encountering ${action.requireSubtype}.`,
          cites: [CR.encounterBreakPaw],
        };
      }
      // Ending the encounter drops abilities still pending from its start.
      if (state.run.encounter.onEncounterPending) {
        state.run.encounter.onEncounterPending = false;
        log(
          state,
          `Reaction window closes — ${ice.title} loses its pending status (CR ${CR.reactionWindowCloses.number}).`,
        );
      }
      // Mark all subs broken and skip to movement via ended encounter.
      state.run.encounter.broken = (ice.subroutines ?? []).map(() => true);
      state.run.bypassedIceIds = [
        ...(state.run.bypassedIceIds ?? []),
        iceId,
      ];
      log(state, `Bypass ${ice.title} (encounter ends without resolving subs).`);
      fireOnBypassTriggers(state, iceId);
      if (ice.rezzed) fireOnEncounterEnd(state, iceId);
      return { ok: true };
    }
    default:
      return null;
  }
}
