/** First Contact (fc) Lunar pack primitives. */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarFcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "pay_shattered_remains": {
      const n = (action as { hardwareCount: number }).hardwareCount;
      if (state.corp.credits < 1) {
        return {
          ok: false,
          error: "Cannot pay 1¢ for Shattered Remains.",
          cites: [],
        };
      }
      state.corp.credits -= 1;
      const hw = state.runner.installed.filter(
        (id) => state.cards[id]?.type === "hardware",
      );
      for (let i = 0; i < n && hw.length > 0; i++) {
        const id = hw.shift()!;
        trashCard(state, id);
        log(state, `Shattered Remains — trash ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
