import {
  markSubroutineBroken,
  subroutineBreakBlock,
} from "../../state/turnAndActions/break.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import type { RuleCite } from "../../state/types.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyKitaraDtwnPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "break_first_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source?.title ?? "Kongamato"} — no encounter.`);
        return { ok: true };
      }
      const idx = enc.broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `${source?.title ?? "Kongamato"} — no unbroken subroutine.`);
        return { ok: true };
      }
      const blocked = subroutineBreakBlock(state, sourceId, idx);
      if (blocked) {
        log(state, `${source?.title ?? "Kongamato"} — ${blocked.error}`);
        return { ok: true };
      }
      markSubroutineBroken(state, sourceId, idx);
      log(
        state,
        `${source?.title ?? "Kongamato"} — break first subroutine (index ${idx}).`,
      );
      return { ok: true };
    }

    case "corp_additional_click_next_turn": {
      state.corpAllottedClicksDeltaNextTurn =
        (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
      log(
        state,
        `Nightdancer — Corp +1 click next turn (pending ${state.corpAllottedClicksDeltaNextTurn}).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
