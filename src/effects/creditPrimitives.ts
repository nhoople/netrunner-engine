/**
 * Credit pool gain and loss. Card formulas that compute an amount
 * and then add credits stay in eval.ts.
 */
import { log } from "../state/createGame.js";
import { noteCorpAbilityCausedRunnerCreditLossOrSpend } from "../state/gamenet.js";
import type { GameState, RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import {
  deferContinuationBefore,
  effectResolutionBlocked,
} from "./continuation.js";
import type { EffectCtx } from "./eval.js";
import type { Effect, Primitive, SideRef } from "./ir.js";
import { abilityCreditTally } from "./creditTally.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

type ResolveSide = (ctx: EffectCtx, ref: SideRef) => Side;
type EvalEffect = (ctx: EffectCtx, effect: Effect) => PrimResult;

export function applyCreditPrimitive(
  ctx: EffectCtx,
  action: Primitive,
  resolveSide: ResolveSide,
  evalEffect: EvalEffect,
  maybeFireZwickyCreditsGained: (state: GameState, sourceId: string) => void,
  maybeFireDadianaChaconZeroCredits: (state: GameState) => void,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "gain_credits": {
      let side = resolveSide(ctx, action.side);
      let amount = action.amount;
      if (action.tally) {
        const tallied = abilityCreditTally(state, sourceId, action.tally);
        // A summed value of 0 or less does not happen (CR 9.12.2b).
        if (tallied.amount <= 0) return { ok: true };
        side = tallied.side;
        amount = tallied.amount;
      }
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += amount;
      log(
        state,
        `${side} gains ${amount}¢ (CR ${CR.gainCredits.number}).`,
      );
      if (amount > 0 && side === "corp") {
        maybeFireZwickyCreditsGained(state, sourceId);
        // NASX: whenever the Corp gains credits through a card ability,
        // including NASX's own (printed text; CR 1.2.1). One offer per
        // gain instance (CR 9.12.2b when the gain is a single instruction).
        for (const server of Object.values(state.servers)) {
          for (const id of server.root) {
            const nasx = state.cards[id];
            if (!nasx?.rezzed || !nasx.nasxMaySpendUpTo2OnAbilityCreditGainToPlacePower) {
              continue;
            }
            if (state.pendingChoice) break;
            const r = evalEffect(
              { state, sourceId: id },
              {
                op: "do",
                action: {
                  kind: "may_spend_to_place_power",
                  amount,
                },
              },
            );
            if (!r.ok) {
              log(state, `NASX offer failed: ${r.error}`);
            }
            break;
          }
        }
      }
      return { ok: true };
    }
    case "lose_all_credits": {
      const side = resolveSide(ctx, action.side);
      if (side === "runner" && state.run?.blockCreditPoolSpendAndLose) {
        log(
          state,
          `Runner cannot lose credits from credit pool (Aircheck-class block).`,
        );
        return { ok: true };
      }
      const p = side === "corp" ? state.corp : state.runner;
      const lost = p.credits;
      p.credits = 0;
      log(
        state,
        `${side} loses all credits (${lost}¢) → 0 (CR ${CR.gainCredits.number}).`,
      );
      if (lost > 0 && side === "runner") {
        noteCorpAbilityCausedRunnerCreditLossOrSpend(state, lost, sourceId);
      }
      return { ok: true };
    }
    case "lose_credits": {
      const side = resolveSide(ctx, action.side);
      if (
        side === "runner" &&
        state.run?.runnerCannotSpendCreditsForRun &&
        action.amount > 0
      ) {
        return {
          ok: false,
          error: "Runner cannot spend credits for remainder of this run.",
          cites: [CR.gainCredits],
        };
      }
      if (
        side === "runner" &&
        state.run?.runnerCannotSpendCredits &&
        action.amount > 0
      ) {
        return {
          ok: false,
          error: "Runner cannot spend credits while this ice's subroutines resolve.",
          cites: [CR.gainCredits],
        };
      }
      if (
        side === "runner" &&
        state.run?.blockCreditPoolSpendAndLose &&
        action.amount > 0
      ) {
        log(
          state,
          `Runner cannot lose credits from credit pool (Aircheck-class block).`,
        );
        return { ok: true };
      }
      const p = side === "corp" ? state.corp : state.runner;
      const lost = Math.min(action.amount, p.credits);
      p.credits -= lost;
      log(
        state,
        `${side} loses ${lost}¢ (requested ${action.amount}) → ${p.credits} (CR ${CR.gainCredits.number}).`,
      );
      if (lost > 0 && side === "runner") {
        noteCorpAbilityCausedRunnerCreditLossOrSpend(state, lost, sourceId);
      }
      if (lost > 0 && side === "corp") {
        // Ixodidae: whenever Corp loses ≥1¢, gain N¢.
        for (const rid of [...state.runner.rig]) {
          const rc = state.cards[rid];
          const n = rc?.gainCreditsWhenCorpLosesCredits;
          if (typeof n !== "number" || n <= 0) continue;
          state.runner.credits += n;
          log(
            state,
            `${rc!.title} — gain ${n}¢ (Corp lost credits) → ${state.runner.credits}¢.`,
          );
        }
      }
      if (lost > 0 && action.gainPerCreditLost) {
        const gainSide = resolveSide(ctx, action.gainPerCreditLost.side);
        const gainAmt = lost * action.gainPerCreditLost.per;
        if (gainAmt > 0) {
          const gained = evalEffect(ctx, {
            op: "do",
            action: { kind: "gain_credits", side: gainSide, amount: gainAmt },
          });
          if (!gained.ok) return gained;
        }
      }
      if (side === "runner" && state.runner.credits === 0) {
        maybeFireDadianaChaconZeroCredits(state);
      }
      // "If they do" — only when at least 1 credit was actually lost.
      if (lost > 0 && action.then) {
        if (effectResolutionBlocked(state)) {
          deferContinuationBefore(state, {
            sourceId,
            effects: [action.then],
          });
          return { ok: true };
        }
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
