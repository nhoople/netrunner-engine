import { breakNextSubroutines } from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySpinTcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  switch (action.kind) {
    case "break_all_destroyer_subroutines_on_encounter": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      if (!ice?.subtypes?.includes("destroyer")) {
        log(state, `Sharpshooter — host ice is not destroyer.`);
        return { ok: true };
      }
      const broken = breakNextSubroutines(state, sourceId, Infinity);
      log(
        state,
        `Sharpshooter — break ${broken.length} subroutine(s) on ${ice.title}.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
