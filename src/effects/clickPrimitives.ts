/**
 * Click gain and loss. Seidr's first click spent during a run and
 * the Valencia first-click-loss hook run here.
 */
import { log } from "../state/createGame.js";
import type { RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { EffectCtx } from "./eval.js";
import type { Effect, Primitive, SideRef } from "./ir.js";
import { fireRunnerValTrigger } from "./sansanValHooks.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

type ResolveSide = (ctx: EffectCtx, ref: SideRef) => Side;
type EvalEffect = (ctx: EffectCtx, effect: Effect) => PrimResult;

export function applyClickPrimitive(
  ctx: EffectCtx,
  action: Primitive,
  resolveSide: ResolveSide,
  evalEffect: EvalEffect,
): PrimResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "lose_clicks": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.clicks);
      p.clicks -= lost;
      if (side === "runner" && lost > 0) {
        // Lazy import avoided — Seidr hook via turn flag + identity effect.
        if (state.run && !state.turn.seidrClickDuringRunFiredThisTurn) {
          const idCard = state.cards[state.corp.identityId];
          const seidrFx = idCard?.onFirstRunnerClickSpendOrLoseDuringRun;
          if (seidrFx) {
            state.turn.seidrClickDuringRunFiredThisTurn = true;
            const r = evalEffect({ state, sourceId: idCard.id }, seidrFx);
            if (!r.ok) {
              log(state, `Seidr click-during-run failed: ${r.error}`);
            }
          }
        }
        fireRunnerValTrigger(
          state,
          "valClickLossTriggerCount",
          (c) => c.onFirstClickLossEachTurnExceptPaidAbility,
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
      const p = side === "corp" ? state.corp : state.runner;
      p.clicks += action.amount;
      if (side === "runner" && state.run && action.amount > 0) {
        state.run.clicksGainedThisRun =
          (state.run.clicksGainedThisRun ?? 0) + action.amount;
      }
      log(
        state,
        `${side} gains ${action.amount} click(s) → ${p.clicks} (CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
