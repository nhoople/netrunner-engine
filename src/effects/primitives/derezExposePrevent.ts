import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function remoteServerCount(state: EffectCtx["state"]): number {
  return Object.keys(state.servers).filter((id) => id.startsWith("remote"))
    .length;
}

export function applyRedsandDcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "mad_dash_on_run_end": {
      const stole = (state.run?.agendasStolenThisRun ?? 0) > 0;
      if (stole) {
        return evalEffect(
          ctx,
          fx.do({ kind: "add_to_runner_score_as_agenda", agendaPoints: 1 }),
        );
      }
      return evalEffect(ctx, fx.do({ kind: "meat_damage", amount: 1 }));
    }

    case "refresh_khondi_plaza_recurring": {
      if (!source.recurringCreditsMaxEqualsRemoteServers) {
        return { ok: true };
      }
      // Blanked Khondi keeps a 0 pool (CR 9.12.1d).
      if (abilitiesSuppressed(state, sourceId)) {
        source.recurringCreditsMax = 0;
        source.recurringCredits = 0;
        return { ok: true };
      }
      const n = remoteServerCount(state);
      source.recurringCreditsMax = n;
      source.recurringCredits = n;
      log(
        state,
        `Khondi Plaza — recurring credits set to ${n} (remote servers).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
