/**
 * Click gain and loss. Seidr's first click spent during a run and
 * the Valencia first-click-loss hook run here.
 */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite, Side } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { abilityCreditTally } from "../keywordsAndCredits/creditTally.js";
import type { Effect } from "../ir/effect.js";
import type { Primitive } from "../ir/primitive.js";
import type { SideRef } from "../ir/shared.js";
import { fireRunnerValTrigger } from "../triggers/firstTimeEachTurnTriggers.js";
import {
  maybeFireSeidrOnClickSpendOrLose,
  noteRunnerClickDuringRun,
} from "../../state/turnAndActions/clickHooks.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

type ResolveSide = (ctx: EffectCtx, ref: SideRef) => Side;
type EvalEffect = (ctx: EffectCtx, effect: Effect) => PrimResult;

export function applyClickPrimitive(
  ctx: EffectCtx,
  action: Primitive,
  resolveSide: ResolveSide,
  _evalEffect: EvalEffect,
): PrimResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "lose_clicks": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.clicks);
      p.clicks -= lost;
      if (side === "runner" && lost > 0) {
        noteRunnerClickDuringRun(state);
        maybeFireSeidrOnClickSpendOrLose(state);
        fireRunnerValTrigger(
          state,
          "valClickLossTriggerCount",
          "onFirstClickLossEachTurnExceptPaidAbility",
          "onFirstClickLossEachTurnExceptPaidAbility",
        );
      }
      log(
        state,
        `${side} loses ${lost} click(s) (requested ${action.amount}) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "gain_clicks": {
      const side = resolveSide(ctx, action.side);
      let amount = action.amount;
      if (action.tally) {
        const tallied = abilityCreditTally(state, ctx.sourceId, action.tally);
        // A summed value of 0 or less does not happen (CR 9.12.2b).
        if (tallied.amount <= 0) return { ok: true };
        amount = tallied.amount;
      }
      const p = side === "corp" ? state.corp : state.runner;
      p.clicks += amount;
      if (side === "runner" && state.run && amount > 0) {
        state.run.clicksGainedThisRun =
          (state.run.clicksGainedThisRun ?? 0) + amount;
      }
      log(
        state,
        `${side} gains ${amount} click(s) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
