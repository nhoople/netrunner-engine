import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import {
  controllerOf,
  discardCard,
  trashCard,
} from "../../state/hostingAndTrash/trash.js";
import { offerCbiRaidHqToRd } from "../access/accessKinds.js";
import type { RuleCite } from "../../state/types.js";

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
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

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

    case "trash_rezzed_gain_trash_cost": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c?.rezzed && (c.type === "asset" || c.type === "upgrade")) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `Product Recall — no rezzed asset/upgrade.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        const card = state.cards[id]!;
        const gainAmt = card.trashCost ?? 0;
        trashCard(state, id, { by: controllerOf(state, sourceId) });
        state.corp.credits += gainAmt;
        log(state, `Product Recall — trash ${card.title}; gain ${gainAmt}¢.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => {
          const card = state.cards[id]!;
          const gainAmt = card.trashCost ?? 0;
          return {
            id: `recall:${id}`,
            label: `Trash ${card.title} → gain ${gainAmt}¢`,
            effect: fx.do({
              kind: "resolve_product_recall",
              cardId: id,
            }),
          };
        }),
      });
      return { ok: true };
    }

    case "resolve_product_recall": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card?.rezzed) return { ok: true };
      const gainAmt = card.trashCost ?? 0;
      trashCard(state, id, { by: controllerOf(state, sourceId) });
      state.corp.credits += gainAmt;
      log(state, `Product Recall — trash ${card.title}; gain ${gainAmt}¢.`);
      return { ok: true };
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

    case "bf_place_advancement_on_self": {
      if (!source) return { ok: true };
      const amount = action.amount ?? 1;
      source.advancementCounters = (source.advancementCounters ?? 0) + amount;
      log(
        state,
        `${source.title} — place ${amount} advancement → ${source.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "move_mumbad_construction_advancement_to_faceup": {
      if (!source || (source.advancementCounters ?? 0) < 1) {
        log(state, `Mumbad Construction Co. — no advancement to move.`);
        return { ok: true };
      }
      const faceup: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && id !== sourceId && (c.faceup || c.rezzed)) {
            faceup.push(id);
          }
        }
      }
      for (const id of state.corp.scoreArea) {
        if (state.cards[id]) faceup.push(id);
      }
      if (faceup.length === 0) {
        log(state, `Mumbad Construction Co. — no faceup destination.`);
        return { ok: true };
      }
      if (faceup.length === 1) {
        const id = faceup[0]!;
        source.advancementCounters = (source.advancementCounters ?? 0) - 1;
        const dest = state.cards[id]!;
        dest.advancementCounters = (dest.advancementCounters ?? 0) + 1;
        log(
          state,
          `Mumbad Construction Co. — move 1 advancement to ${dest.title}.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: faceup.map((id) => ({
          id: `mcc-move:${id}`,
          label: `Move advancement to ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "move_mumbad_construction_advancement_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "move_mumbad_construction_advancement_resolve": {
      if (!source || (source.advancementCounters ?? 0) < 1) return { ok: true };
      const id = action.cardId;
      const dest = state.cards[id];
      if (!dest) return { ok: true };
      source.advancementCounters = (source.advancementCounters ?? 0) - 1;
      dest.advancementCounters = (dest.advancementCounters ?? 0) + 1;
      log(
        state,
        `Mumbad Construction Co. — move 1 advancement to ${dest.title}.`,
      );
      return { ok: true };
    }

    case "place_advancement_cannot_score_until_next_turn": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `PAD Factory — no advanceable card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `pad-adv:${id}`,
          label: `Advance ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancement_resolve",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_advancement_resolve": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card) return { ok: true };
      card.advancementCounters = (card.advancementCounters ?? 0) + 1;
      // "You cannot score that card until your next turn begins": scoring
      // only, read by the score action and its legality (CR 1.2.2); the
      // list clears when the Corp's next turn begins.
      state.bfCannotScoreUntilNextCorpTurn = [
        ...(state.bfCannotScoreUntilNextCorpTurn ?? []),
        id,
      ];
      log(
        state,
        `PAD Factory — place 1 advancement on ${card.title}; cannot score until next Corp turn.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
