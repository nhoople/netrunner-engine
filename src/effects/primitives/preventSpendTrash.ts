import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarUaoPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "spend_click_additional_cost": {
      // A cost that cannot be paid in full is not paid (CR 1.16.1a).
      const player = action.side === "runner" ? state.runner : state.corp;
      const title = state.cards[ctx.sourceId]?.title ?? ctx.sourceId;
      if ((player.clicks ?? 0) < 1) {
        return {
          ok: false,
          error: `Cannot spend [click] for ${title}.`,
          cites: [CR.spendClicks],
        };
      }
      player.clicks -= 1;
      log(
        state,
        `${title} — spend 1 [click] (additional cost, CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
