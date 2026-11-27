import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadKgPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "break_arm_icebreaker_additional_cost_this_run": {
      if (state.run) {
        state.run.kgIcebreakerBreakAdditionalCost =
          (state.run.kgIcebreakerBreakAdditionalCost ?? 0) + action.amount;
      }
      log(
        state,
        `${source?.title ?? "Interrupt 0"} — icebreaker break +${action.amount}¢ this run.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
