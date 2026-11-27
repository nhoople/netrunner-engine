import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyRedsandSoPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "pay_or_trash_top_stack": {
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.runner.credits >= 1) {
        options.push({
          id: "pay",
          label: "Pay 1¢",
          effect: fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
        });
      }
      options.push({
        id: "trash-top",
        label: "Trash the top card of the stack",
        effect: fx.do({ kind: "trash_top_of_stack" }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Clyde Van Rite — Runner must pay 1¢ or trash top of stack.`,
      });
      return { ok: true };
    }

    case "remove_bp_equal_forfeited_ap_gain_credits": {
      const x = Math.min(
        state.lastForfeitedAgendaPoints ?? 0,
        state.corp.badPublicity ?? 0,
      );
      if (x > 0) {
        state.corp.badPublicity = (state.corp.badPublicity ?? 0) - x;
        state.corp.credits += x;
        log(state, `Sacrifice — remove ${x} bad publicity; gain ${x}¢.`);
      } else {
        log(state, `Sacrifice — no bad publicity to remove.`);
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
