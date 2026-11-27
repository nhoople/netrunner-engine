/** Escalation (es) Flashpoint pack primitives — v1.124.0. */
import {
  breakNextSubroutines,
  interfaceBlock,
  runnerBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { addBreakerStrengthBoostThisEncounter } from "../../state/continuous/lingeringEffects.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointEsPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "spend_pump_and_break": {
      if (!state.run?.encounter) {
        log(state, `Black Orchestra — no encounter.`);
        return { ok: true };
      }
      addBreakerStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        breakerId: sourceId,
        amount: 2,
      });
      log(state, `Black Orchestra — +2 strength this encounter.`);
      const enc = state.run.encounter;
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("code gate")) {
        return { ok: true };
      }
      // "Then, if this program can interface with the code gate" (CR 3.9.5g).
      const blocked =
        interfaceBlock(state, sourceId, enc.iceId) ??
        runnerBreakBlock(state, sourceId, enc.iceId);
      if (blocked) {
        log(state, `Black Orchestra — cannot interface: ${blocked.error}`);
        return { ok: true };
      }
      const toBreak = breakNextSubroutines(state, sourceId, 2);
      if (toBreak.length > 0) {
        log(
          state,
          `Black Orchestra — break ${toBreak.length} code gate subroutine(s).`,
        );
      }
      return { ok: true };
    }

    case "net_mercur_place_or_draw": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "place",
            label: "Place 1¢ on Net Mercur",
            effect: fx.do({ kind: "net_mercur_place_credit" }),
          },
          {
            id: "draw",
            label: "Draw 1 card",
            effect: fx.do({ kind: "draw", side: "runner", amount: 1 }),
          },
        ],
      });
      return { ok: true };
    }

    case "net_mercur_place_credit": {
      source.hostedCredits = (source.hostedCredits ?? 0) + 1;
      log(state, `Net Mercur — place 1¢ → ${source.hostedCredits} hosted.`);
      return { ok: true };
    }

    default:
      return null;
  }
}
