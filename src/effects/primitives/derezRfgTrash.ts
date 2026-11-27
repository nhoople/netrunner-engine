import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyRedsandFmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "o2_shortage_runner_may_trash_random_grip_or_corp_gains_clicks": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "o2-trash",
            label: "Trash 1 card from grip at random",
            effect: fx.do({ kind: "trash_shortage_random_grip" }),
          },
          {
            id: "o2-decline",
            label: "Decline (Corp gains [click][click])",
            effect: fx.do({ kind: "o2_shortage_corp_gains_clicks" }),
          },
        ],
      });
      return { ok: true };
    }

    case "o2_shortage_corp_gains_clicks": {
      state.corp.clicks = (state.corp.clicks ?? 0) + 2;
      log(
        state,
        `O₂ Shortage — Corp gains [click][click] → ${state.corp.clicks}.`,
      );
      return { ok: true };
    }

    case "choose_type": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: (["resource", "hardware", "program"] as const).map((t) => ({
          id: `br:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "resolve_biased_reporting", cardType: t }),
        })),
      });
      return { ok: true };
    }

    case "resolve_biased_reporting": {
      const t = action.cardType;
      const installed = state.runner.installed.filter(
        (id) => state.cards[id]?.type === t,
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "br:trash-none",
            label: "Trash none",
            effect: fx.do({
              kind: "corp_gain",
              cardType: t,
              trashed: [],
            }),
          },
          ...installed.map((id) => ({
            id: `br:trash:${id}`,
            label: `Trash ${state.cards[id]?.title ?? id} (and continue)`,
            effect: fx.do({
              kind: "runner_trash_continue",
              cardType: t,
              trashed: [id],
              remaining: installed.filter((x) => x !== id),
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "corp_gain": {
      const t = action.cardType;
      const remaining = state.runner.installed.filter(
        (id) => state.cards[id]?.type === t,
      ).length;
      const gainAmt = remaining * 2;
      state.corp.credits += gainAmt;
      log(
        state,
        `Biased Reporting — Corp gains ${gainAmt}¢ (${remaining} ${t}(s) remain) → ${state.corp.credits}¢.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
