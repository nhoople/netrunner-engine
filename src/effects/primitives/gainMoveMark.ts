import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyOacPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "trace_strength_equal_source_advancements": {
      const strength = source?.advancementCounters ?? 0;
      const onSuccess =
        (action as { onSuccess?: Effect }).onSuccess ??
        fx.gainCredits("corp", 0);
      const r = autoResolveTrace(state, sourceId, strength, onSuccess);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }

    default:
      return null;
  }
}
