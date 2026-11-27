import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import { grantAbilityCredits, type EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointInPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "gain_credits_if_runner_has_installed_subtype": {
      const subtype = (action.subtype ?? "ai").toLowerCase();
      const amount = action.amount ?? 2;
      const side = action.side ?? "corp";
      const has = state.runner.installed.some((id) =>
        (state.cards[id]?.subtypes ?? [])
          .map((s) => s.toLowerCase())
          .includes(subtype),
      );
      if (!has) {
        log(
          state,
          `${source?.title ?? "Bulwark"} — no installed ${subtype} program.`,
        );
        return { ok: true };
      }
      return grantAbilityCredits(ctx, side, amount);
    }

    default:
      return null;
  }
}
