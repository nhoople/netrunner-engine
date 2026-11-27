import { emptyRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarUpPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "trace_taurus_subroutine": {
      // "If successful, trash 1 piece of hardware. If your trace strength is
      // 5 or greater, trash 1 piece of hardware": the second part does not
      // need a successful trace (CR 10.8.5), and waits for the first.
      const trash = fx.do({ kind: "trash_hardware", pick: "choose" });
      const kick = fx.do({
        kind: "resolve_if_trace_strength_at_least",
        min: 5,
        then: trash,
      });
      const r = autoResolveTrace(state, sourceId, 2, fx.seq(trash, kick), kick);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "lose_nasir_all_credits": {
      emptyRunnerCreditPool(state);
      log(state, `Nasir Meidan — Runner loses all credits in pool.`);
      // "Gain credits equal to the rez cost of that ice": the ice being
      // encountered. Its printed rez cost: the rez procedure's modified
      // value is not exposed outside a rez yet (area 7).
      const iceId = state.run?.encounter?.iceId;
      const gain = iceId ? (state.cards[iceId]?.rezCost ?? 0) : 0;
      if (gain > 0) {
        state.runner.credits += gain;
        log(state, `Nasir Meidan — Runner gains ${gain}¢.`);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
