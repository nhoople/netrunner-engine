import { breakNextSubroutines } from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { dealDamage } from "../../state/damageAndPrevention/damage.js";
import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { EffectCtx } from "../eval.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarTsPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "trace_troll_encounter": {
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "trace_troll_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_troll_success": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "troll-lose-click",
            label: "Lose [click]",
            effect: fx.do({
              kind: "lose_clicks",
              side: "runner",
              amount: 1,
            }),
          },
          {
            id: "troll-etr",
            label: "End the run",
            effect: fx.do({ kind: "end_the_run" }),
          },
        ],
      });
      return { ok: true };
    }
    case "trace_virgo_subroutine": {
      // "If successful, give the Runner 1 tag. If your trace strength is 5
      // or greater, give the Runner 1 tag": the second part does not need a
      // successful trace (CR 10.8.5). Tags go through the tag procedure, so
      // the Runner can avoid them (CR 9.9.6a).
      const tag = fx.do({ kind: "give_tags", amount: 1 });
      const kick = fx.do({
        kind: "resolve_if_trace_strength_at_least",
        min: 5,
        then: tag,
      });
      const r = autoResolveTrace(state, sourceId, 2, fx.seq(tag, kick), kick);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_self_destruct_success": {
      dealDamage(state, "net", 3, sourceId);
      return { ok: true };
    }
    case "break_code_gate_or_barrier": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `Sage — no encounter.`);
        return { ok: true };
      }
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      if (!subs.includes("code gate") && !subs.includes("barrier")) {
        return {
          ok: false,
          error: "Sage can only break code gate or barrier subroutines.",
          cites: [],
        };
      }
      // Strength was checked when the ability was used (CR 3.9.5g, 9.5.4).
      const [idx] = breakNextSubroutines(state, sourceId, 1);
      if (idx === undefined) {
        log(state, `Sage — no unbroken subroutines.`);
        return { ok: true };
      }
      log(
        state,
        `Sage — break "${ice?.subroutines?.[idx]?.text ?? `sub ${idx}`}" on ${ice?.title}.`,
      );
      if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
      if (!state.run!.breakersThatBroke.includes(sourceId)) {
        state.run!.breakersThatBroke.push(sourceId);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
