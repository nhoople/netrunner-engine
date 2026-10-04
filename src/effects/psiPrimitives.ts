/**
 * Psi game. Card-specific bid outcomes stay with their packs.
 */
import { startPsiGame } from "../state/psi.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

export function applyPsiPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "play_psi_game": {
      const noop = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      } as Effect;
      const matchFx = action.ifBidsMatch ?? noop;
      const differFx = action.ifBidsDiffer ?? noop;
      startPsiGame(
        state,
        sourceId,
        action.maxBid,
        differFx,
        matchFx,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
