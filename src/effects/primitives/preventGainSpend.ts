import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { fireOnPlay } from "../../state/triggers/cardLifecycleHooks.js";
import type { EffectCtx } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointQuPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "schedule_additional_runner_turn": {
      state.pendingExtraRunnerTurns = (state.pendingExtraRunnerTurns ?? 0) + 1;
      log(state, `Encore — take an additional turn after this one.`);
      return { ok: true };
    }

    case "play_archives_transaction": {
      const txs = state.corp.discardPile.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" && (c.subtypes ?? []).includes("transaction")
        );
      });
      if (txs.length === 0) {
        log(state, `Bryan Stinson — no transaction in Archives.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: txs.map((id) => ({
          id: `bryan-tx:${id}`,
          label: `Play ${state.cards[id]!.title} ignoring costs (RFG)`,
          effect: fx.do({
            kind: "play_archives_transaction_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "play_archives_transaction_resolve": {
      const cardId = action.cardId;
      const card = cardId ? state.cards[cardId] : undefined;
      if (!card || !state.corp.discardPile.includes(cardId!)) {
        log(state, `Bryan Stinson — transaction not in Archives.`);
        return { ok: true };
      }
      // Play ignoring costs: fire onPlay then RFG.
      removeCardFromCurrentZone(state, cardId!);
      fireOnPlay(state, cardId!);
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame) state.removedFromGame = [];
      state.removedFromGame.push(cardId!);
      log(
        state,
        `Bryan Stinson — play ${card.title} from Archives ignoring costs; RFG.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
