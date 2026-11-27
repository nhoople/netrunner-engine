import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { effectiveIceStrength } from "../../cards/stubs.js";
import { CR } from "../../timing/labels.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyKitaraKaPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "trace_strength_equal_source_strength": {
      const definingAbilityInactive =
        !source?.rezzed ||
        source.zone === "corp:archives" ||
        abilitiesSuppressed(state, sourceId);
      const strength = definingAbilityInactive
        ? 0
        : effectiveIceStrength(state, sourceId);
      if (definingAbilityInactive) {
        log(
          state,
          `${source?.title ?? sourceId} — X is 0 (CR ${CR.valueDefinedByX.number}).`,
        );
      }
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "trace",
          strength,
          onSuccess:
            action.onSuccess ??
            fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          ...(action.onFailure ? { onFailure: action.onFailure } : {}),
        },
      });
    }

    default:
      return null;
  }
}
