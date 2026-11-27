import { log } from "../../state/setupAndEnd/createGame.js";
import { startPsiGame } from "../../state/turnAndActions/psi.js";
import { startTrace } from "../../state/turnAndActions/trace.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySpinFalDtPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  switch (action.kind) {
    case "tallie_perrault_on_ops_trashed": {
      // Printed text is a "may": the Runner chooses.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tallie-apply",
            label: "Give the Corp 1 bad publicity and take 1 tag",
            effect: fx.do({ kind: "give_bad_publicity_and_tag" }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }
    case "give_bad_publicity_and_tag": {
      state.corp.badPublicity = (state.corp.badPublicity ?? 0) + 1;
      state.runner.tags = (state.runner.tags ?? 0) + 1;
      log(
        state,
        `Tallie Perrault — Corp takes 1 bad publicity; Runner takes 1 tag.`,
      );
      return { ok: true };
    }
    case "trace_prevent_bad_publicity": {
      // Printed: Trace[3]; if successful, prevent all of that bad publicity
      // (CR 1.2.1).
      const amount = state.turn.pendingBadPublicityTake ?? 1;
      const noop: Effect = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      };
      startTrace(
        state,
        sourceId,
        3,
        noop,
        fx.do({ kind: "suffer_bad_publicity", amount }),
      );
      log(
        state,
        `Broadcast Square — trace (base 3) instead of bad publicity; BP only if trace fails.`,
      );
      return { ok: true };
    }
    case "spend_caprice_nisei_secret": {
      // Printed: both players secretly spend 0, 1, or 2 credits; if they
      // spent a different number, end the run. (No advancement condition.)
      if (!state.run) {
        log(state, `Caprice Nisei — no run.`);
        return { ok: true };
      }
      const noop: Effect = {
        op: "do",
        action: { kind: "gain_credits", side: "corp", amount: 0 },
      };
      startPsiGame(state, sourceId, 2, fx.do({ kind: "end_the_run" }), noop);
      log(state, `Caprice Nisei — secret spend / psi.`);
      return { ok: true };
    }
    default:
      return null;
  }
}
