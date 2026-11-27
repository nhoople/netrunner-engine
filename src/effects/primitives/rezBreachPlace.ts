import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { offerCbiRaidHqToRd } from "../access/accessKinds.js";
import type { RuleCite } from "../../state/types.js";
import { discardCard } from "../../state/hostingAndTrash/trash.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

/**
 * Printed: "discards down to their maximum hand size" — the Runner chooses
 * each discard. Offer one discard at a time until the grip is at the limit.
 */
function offerDiscardDownToHandSize(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const max = state.runner.maxHandSize ?? 5;
  if (state.runner.hand.length <= max) return { ok: true };
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: state.runner.hand.map((id) => ({
      id: `harvester-discard:${id}`,
      label: `Discard ${state.cards[id]!.title}`,
      effect: fx.do({
        kind: "draw_then_discard_down_to_hand_size_continue",
        cardId: id,
      }),
    })),
  });
  return { ok: true };
}

export function applyMumbadBfPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state } = ctx;

  switch (action.kind) {
    case "place_hq_on_top_rd_continue": {
      const id = (action as { cardId?: string }).cardId;
      if (!id || !state.corp.hand.includes(id)) return { ok: true };
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      state.corp.deck.unshift(id);
      const card = state.cards[id]!;
      card.zone = "corp:rd";
      card.faceup = false;
      log(state, `CBI Raid — ${card.title} to top of R&D.`);
      return offerCbiRaidHqToRd(ctx);
    }

    case "draw_then_discard_down_to_hand_size": {
      const n = action.drawAmount ?? 3;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        state.runner.hand.push(top);
        const c = state.cards[top]!;
        c.zone = "runner:grip";
      }
      log(state, `Harvester — Runner draws ${n}.`);
      return offerDiscardDownToHandSize(ctx);
    }

    case "draw_then_discard_down_to_hand_size_continue": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.hand.includes(cardId)) return { ok: true };
      // A discard, not a trash (CR 1.19.3).
      discardCard(state, cardId);
      log(state, `Harvester — Runner discards ${state.cards[cardId]!.title}.`);
      return offerDiscardDownToHandSize(ctx);
    }

    default:
      return null;
  }
}
