import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import type { Primitive } from "../ir.js";

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
