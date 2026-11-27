import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import {
  emptyRunnerCreditPool,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/costs.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarUaoPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "universal_connectivity_fee_sub": {
      if (state.runner.tags > 0) {
        emptyRunnerCreditPool(state);
        log(state, `UCF — tagged Runner loses all credits; trash ice.`);
        if (source?.type === "ice") {
          // The ice's own subroutine trashes it (CR 1.14.5); the encounter
          // then ends (CR 6.2.7c).
          trashCard(state, sourceId, { by: "corp" });
        }
      } else if (state.runner.credits > 0) {
        subtractRunnerCreditPool(state, 1);
        log(state, `UCF — Runner loses 1¢.`);
      }
      return { ok: true };
    }
    case "spend_click_additional_cost": {
      // A cost that cannot be paid in full is not paid (CR 1.16.1a).
      const player = action.side === "runner" ? state.runner : state.corp;
      const title = state.cards[ctx.sourceId]?.title ?? ctx.sourceId;
      if ((player.clicks ?? 0) < 1) {
        return {
          ok: false,
          error: `Cannot spend [click] for ${title}.`,
          cites: [CR.spendClicks],
        };
      }
      player.clicks -= 1;
      log(
        state,
        `${title} — spend 1 [click] (additional cost, CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "corp_lose_two_if_can": {
      if (state.corp.credits >= 2) {
        state.corp.credits -= 2;
        log(state, `Fester — Corp loses 2¢.`);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
