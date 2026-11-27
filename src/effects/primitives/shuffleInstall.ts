/** Magnum Opus (mo) primitives — v1.142.0. */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import type { RuleCite } from "../../state/types.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMagnumOpusPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "mo_slot_machine_if_shared_type_gte": {
      const have = state.run?.encounterSlotMachineSharedTypeMax ?? 0;
      if (have < action.threshold) {
        log(
          state,
          `Slot Machine — shared-type max ${have} < ${action.threshold}; skip.`,
        );
        return { ok: true };
      }
      return evalEffect(ctx, action.then);
    }

    default:
      return null;
  }
}
