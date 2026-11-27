import { breakNextSubroutines } from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySpinTcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  switch (action.kind) {
    case "lawyer_up": {
      const max = Math.min(2, state.runner.tags);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= max; n++) {
        options.push({
          id: `lawyer-tags-${n}`,
          label: n === 0 ? "Remove 0 tags" : `Remove ${n} tag(s)`,
          effect: fx.seq(
            fx.do({ kind: "remove_tags", amount: n }),
            fx.draw("runner", 3),
          ),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Lawyer Up — remove up to ${max} tag(s), draw 3.`,
      });
      return { ok: true };
    }
    case "turn_begin": {
      const card = state.cards[sourceId];
      if ((card?.powerCounters ?? 0) <= 0) return { ok: true };
      card!.powerCounters = (card!.powerCounters ?? 0) - 1;
      log(
        state,
        `Rex Campaign — remove 1 power counter → ${card!.powerCounters}.`,
      );
      if ((card!.powerCounters ?? 0) <= 0) {
        return applySpinTcPrimitive(ctx, { kind: "rex_campaign_when_empty" });
      }
      return { ok: true };
    }
    case "rex_campaign_when_empty": {
      const trashTail = fx.do({ kind: "trash_self" });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "remove-bp",
            label: "Remove 1 bad publicity",
            effect: fx.seq(
              fx.do({ kind: "remove_bad_publicity", amount: 1 }),
              trashTail,
            ),
          },
          {
            id: "gain-5",
            label: "Gain 5[credit]",
            effect: fx.seq(
              fx.do({ kind: "gain_credits", side: "corp", amount: 5 }),
              trashTail,
            ),
          },
        ],
        logLine: `Rex Campaign — empty; choose benefit then trash.`,
      });
      return { ok: true };
    }
    case "remove_bad_publicity_up_to": {
      const max = action.max ?? 0;
      const have = state.corp.badPublicity ?? 0;
      const cap = Math.min(max, have);
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= cap; n++) {
        options.push({
          id: `rbp-${n}`,
          label: `Remove ${n} bad publicity`,
          effect: fx.do({ kind: "remove_bad_publicity", amount: n }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }
    case "break_all_destroyer_subroutines_on_encounter": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      if (!ice?.subtypes?.includes("destroyer")) {
        log(state, `Sharpshooter — host ice is not destroyer.`);
        return { ok: true };
      }
      const broken = breakNextSubroutines(state, sourceId, Infinity);
      log(
        state,
        `Sharpshooter — break ${broken.length} subroutine(s) on ${ice.title}.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
