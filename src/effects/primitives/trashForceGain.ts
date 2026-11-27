/** 23 Seconds (23s) Flashpoint pack primitives — v1.122.0. */
import { CR } from "../../timing/labels.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { startTrace } from "../../state/turnAndActions/trace.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect, grantAbilityCredits } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpoint23sPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "force_trace_then_gain_credits": {
      startTrace(
        state,
        sourceId,
        0,
        fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        fx.do({
          kind: "gain_credits_equal_to_agenda_points_both_score_areas",
          side: "runner",
        }),
      );
      log(state, `Another Day, Another Paycheck — force Corp Trace[0].`);
      return { ok: true };
    }

    case "gain_credits_equal_to_agenda_points_both_score_areas": {
      let ap = 0;
      for (const id of [...state.runner.scoreArea, ...state.corp.scoreArea]) {
        ap += state.cards[id]?.agendaPoints ?? 0;
      }
      const side = action.side ?? "runner";
      return grantAbilityCredits(ctx, side, ap);
    }

    case "resolve_two": {
      const effects: { id: string; label: string; effect: Effect }[] = [
        {
          id: "gain3",
          label: "Gain 3¢",
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 3 }),
        },
        {
          id: "draw2",
          label: "Draw 2 cards",
          effect: fx.do({ kind: "draw", side: "runner", amount: 2 }),
        },
        {
          id: "untag",
          label: "Remove 1 tag",
          effect: fx.do({ kind: "remove_tags", amount: 1 }),
        },
        {
          id: "expose-run",
          label: "Expose 1 ice, then make a run",
          effect: fx.do({ kind: "expose_then_run" }),
        },
      ];
      const pairs: { id: string; label: string; effect: Effect }[] = [];
      for (let i = 0; i < effects.length; i++) {
        for (let j = 0; j < effects.length; j++) {
          if (i === j) continue;
          const a = effects[i]!;
          const b = effects[j]!;
          pairs.push({
            id: `deuces:${a.id}+${b.id}`,
            label: `${a.label}; then ${b.label}`,
            effect: { op: "seq", effects: [a.effect, b.effect] },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: pairs,
      });
      return { ok: true };
    }

    case "pay_credits_or_trash_installed": {
      const amount = action.amount ?? 1;
      const side = action.side ?? "runner";
      const credits =
        side === "runner" ? state.runner.credits : state.corp.credits;
      const installed = side === "runner" ? state.runner.installed.length : 0;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (credits >= amount) {
        options.push({
          id: "pay",
          label: `Pay ${amount}¢`,
          effect: fx.do({ kind: "lose_credits", side, amount }),
        });
      }
      if (installed > 0) {
        options.push({
          id: "trash",
          label: "Trash 1 installed card",
          effect: fx.do({ kind: "runner_trashes_one_installed" }),
        });
      }
      if (options.length === 0) {
        log(
          state,
          `No way to pay ${amount}¢ or trash an installed card (CR ${CR.mustChoice.number}).`,
        );
        return { ok: true };
      }
      if (options.length === 1) {
        return evalEffect(ctx, options[0]!.effect);
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
