import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyMumbadDagPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "may_spend_voting_machine_lose_click": {
      if (!source) return { ok: true };
      const counters = source.agendaCounters ?? 0;
      if (counters < 1) {
        log(state, `Voting Machine Initiative — no agenda counters.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "vmi:spend",
            label: "Spend 1 agenda counter: Runner loses [click], if able",
            effect: fx.do({ kind: "spend_voting_machine_lose_click" }),
          },
          {
            id: "vmi:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "spend_voting_machine_lose_click": {
      if (!source) return { ok: true };
      const counters = source.agendaCounters ?? 0;
      if (counters < 1) return { ok: true };
      source.agendaCounters = counters - 1;
      if (state.runner.clicks > 0) {
        state.runner.clicks -= 1;
        log(
          state,
          `Voting Machine Initiative — spend counter; Runner loses [click] → ${state.runner.clicks}.`,
        );
      } else {
        log(
          state,
          `Voting Machine Initiative — spend counter; Runner has no click to lose.`,
        );
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
