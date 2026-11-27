import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { revealCards } from "../../state/visibility/reveal.js";
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

    case "may_add_operation_from_archives_to_hq": {
      const ops = state.corp.discardPile.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Clone Suffrage Movement — no operation in Archives.`);
        return { ok: true };
      }
      if (ops.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "add_operation_from_archives_to_hq_resolve",
          cardId: ops[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ops.map((cardId) => ({
          id: `csm:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to HQ`,
          effect: fx.do({
            kind: "add_operation_from_archives_to_hq_resolve",
            cardId,
          }),
        })),
      });
      return { ok: true };
    }

    case "add_operation_from_archives_to_hq_resolve": {
      const cardId = action.cardId;
      if (!state.corp.discardPile.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      if (!card.faceup) {
        revealCards(state, [card.id], sourceId);
        log(state, `Reveal ${card.title} (CR ${CR.revealFromHidden.number}).`);
      }
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      log(
        state,
        `Clone Suffrage Movement — add ${card.title} from Archives to HQ.`,
      );
      return { ok: true };
    }

    case "sensie_add_one_hq_to_bottom_rd": {
      if (state.corp.hand.length === 0) {
        log(state, `Sensie Actors Union — HQ empty.`);
        return { ok: true };
      }
      if (state.corp.hand.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "resolve_sensie_add_hq_to_bottom_rd",
          cardId: state.corp.hand[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((cardId) => ({
          id: `sensie:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to bottom of R&D`,
          effect: fx.do({
            kind: "resolve_sensie_add_hq_to_bottom_rd",
            cardId,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_sensie_add_hq_to_bottom_rd": {
      const cardId = action.cardId;
      if (!state.corp.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      log(
        state,
        `Sensie Actors Union — add ${card.title} from HQ to bottom of R&D.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
