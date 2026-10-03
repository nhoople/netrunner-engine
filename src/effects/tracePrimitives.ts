/**
 * Trace primitives. Starting a trace and changing its base strength.
 * Cards that spend the stored trace excess stay in eval.ts.
 */
import { log } from "../state/createGame.js";
import { autoResolveTrace, startTrace } from "../state/trace.js";
import type { RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { EffectCtx } from "./eval.js";
import type { Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

export function applyTracePrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "trace": {
      if (action.interactive) {
        startTrace(
          state,
          sourceId,
          action.strength,
          action.onSuccess,
          action.onFailure,
        );
        return { ok: true };
      }
      const r = autoResolveTrace(
        state,
        sourceId,
        action.strength,
        action.onSuccess,
        action.onFailure,
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [CR.trace] };
      return { ok: true };
    }
    case "set_trace_base_strength": {
      if (!state.trace) {
        log(state, `${source.title} — set trace base: no trace in progress.`);
        return { ok: true };
      }
      const prev = state.trace.baseStrength;
      state.trace.baseStrength = Math.max(0, action.amount);
      log(
        state,
        `${source.title} — set trace base strength ${prev} → ${state.trace.baseStrength}.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
