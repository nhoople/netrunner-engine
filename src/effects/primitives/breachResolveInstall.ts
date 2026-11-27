import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
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
    case "resolve_diversion_of_funds": {
      if (state.run) state.run.skipBreach = true;
      const lose = Math.min(action.loseAmount, state.corp.credits);
      state.corp.credits -= lose;
      state.runner.credits += lose;
      log(
        state,
        `Diversion of Funds — Corp loses ${lose}¢; Runner gains ${lose}¢.`,
      );
      return { ok: true };
    }

    case "ka_market_forces": {
      const tags = state.runner.tags;
      const want = tags * 3;
      const lost = Math.min(want, state.runner.credits);
      subtractRunnerCreditPool(state, lost);
      state.corp.credits += lost;
      log(
        state,
        `Market Forces — Runner loses ${lost}¢ (${tags} tag(s) × 3); Corp gains ${lost}¢.`,
      );
      return { ok: true };
    }

    case "give_tags_per_two_advancements": {
      const adv = source?.advancementCounters ?? 0;
      const amount = Math.floor(adv / 2);
      if (amount <= 0) {
        log(state, `False Flag — 0 tags (advancements=${adv}).`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "give_tags", amount }));
    }

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
