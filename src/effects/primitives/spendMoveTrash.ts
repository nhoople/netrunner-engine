/** Blood Money (bm) Flashpoint pack primitives — v1.124.0. */
import {
  breakNextSubroutines,
  interfaceBlock,
  runnerBreakBlock,
} from "../../state/turnAndActions/break.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { addBreakerStrengthBoostThisEncounter } from "../../state/continuous/lingeringEffects.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointBmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "spend_x_pump_and_break": {
      const credits = state.runner.credits;
      if (credits <= 0) {
        log(state, `Paperclip — no credits to spend.`);
        return { ok: true };
      }
      const maxX = Math.min(credits, 20);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let x = 1; x <= maxX; x++) {
        options.push({
          id: `paperclip-x:${x}`,
          label: `Spend ${x}¢: +${x} strength, break up to ${x}`,
          effect: fx.do({
            kind: "spend_x_pump_and_break_resolve",
            amount: x,
          }),
        });
      }
      options.push({
        id: "decline",
        label: "Decline",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "spend_x_pump_and_break_resolve": {
      const x = action.amount ?? 1;
      if (state.runner.credits < x) {
        log(state, `Paperclip — cannot afford ${x}¢.`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, x);
      if (!state.run) return { ok: true };
      addBreakerStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        breakerId: sourceId,
        amount: x,
      });
      log(state, `Paperclip — spend ${x}¢ → +${x} strength this encounter.`);
      const enc = state.run.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("barrier"))
        return { ok: true };
      // Printed: then, if this can interface with the barrier, break up to X
      // (CR 1.2.1). Strength via shared CR 9.12.1a calculator (lingerings).
      const blocked =
        interfaceBlock(state, sourceId, enc.iceId) ??
        runnerBreakBlock(state, sourceId, enc.iceId);
      if (blocked) {
        log(state, `Paperclip — cannot interface: ${blocked.error}`);
        return { ok: true };
      }
      const toBreak = breakNextSubroutines(state, sourceId, x);
      if (toBreak.length > 0) {
        log(
          state,
          `Paperclip — break ${toBreak.length} barrier subroutine(s).`,
        );
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
