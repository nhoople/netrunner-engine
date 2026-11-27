/** Council of the Crest (cotc) Kitara pack primitives — v1.138.0. */
import {
  markSubroutineBroken,
  subroutineBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyKitaraCotcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "break_last_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source?.title ?? "Gbahali"} — no encounter.`);
        return { ok: true };
      }
      // Printed: "Break the last subroutine" — the last one in order. If
      // it is already broken, there is nothing to break; do not fall back
      // to an earlier subroutine.
      const ice = state.cards[enc.iceId];
      const idx = (ice?.subroutines?.length ?? enc.broken.length) - 1;
      if (idx < 0 || enc.broken[idx]) {
        log(
          state,
          `${source?.title ?? "Gbahali"} — last subroutine already broken.`,
        );
        return { ok: true };
      }
      const blocked = subroutineBreakBlock(state, sourceId, idx);
      if (blocked) {
        log(state, `${source?.title ?? "Gbahali"} — ${blocked.error}`);
        return { ok: true };
      }
      markSubroutineBroken(state, sourceId, idx);
      log(
        state,
        `${source?.title ?? "Gbahali"} — break last subroutine (index ${idx}).`,
      );
      return { ok: true };
    }

    case "cotc_white_hat": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "do-trace",
            label: "Resolve Trace[3]",
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: 3,
                onSuccess: fx.do({
                  kind: "gain_credits",
                  side: "corp",
                  amount: 0,
                }),
                onFailure: fx.do({ kind: "reveal_white_hat" }),
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    case "trace_white_hat": {
      return applyKitaraCotcPrimitive(ctx, { kind: "cotc_white_hat" });
    }

    case "trace_kuwinda": {
      const x = source?.powerCounters ?? 0;
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "kuwinda-trace",
            label: `Trace[${x}]`,
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: x,
                onSuccess: fx.seq(
                  fx.do({ kind: "core_damage", amount: 1 }),
                  fx.do({ kind: "trash_self" }),
                ),
                onFailure: fx.do({ kind: "add_power_counter", amount: 1 }),
              },
            },
          },
        ],
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
