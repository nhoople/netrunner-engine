import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import type { RuleCite } from "../../state/types.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyKitaraWinPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "lose_remaining_clicks": {
      const lost = state.runner.clicks;
      state.runner.clicks = 0;
      log(state, `Logic Bomb — lose ${lost} remaining click(s).`);
      return { ok: true };
    }

    default:
      return null;
  }
}
