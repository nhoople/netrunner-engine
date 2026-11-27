/** The Devil and the Dragon (tdatd) Kitara pack primitives — v1.139.0. */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function lastAgendaAdvancementRequirement(state: EffectCtx["state"]): number {
  const id = state.turn.lastScoredOrStolenAgendaId;
  if (id) {
    const c = state.cards[id];
    if (c?.advancementRequirement != null) return c.advancementRequirement;
  }
  return 0;
}

export function applyKitaraTdatdPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "lose_tempus_clicks": {
      const lose = Math.min(2, state.runner.clicks);
      state.runner.clicks -= lose;
      log(
        state,
        `Tempus — Runner loses ${lose} click(s) → ${state.runner.clicks}.`,
      );
      return { ok: true };
    }

    case "trace_amani": {
      const x = lastAgendaAdvancementRequirement(state);
      log(state, `Amani Senai — Trace[${x}].`);
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "trace",
          strength: x,
          onSuccess: fx.do({ kind: "tdatd_amani_bounce" }),
        },
      });
    }

    default:
      return null;
  }
}
