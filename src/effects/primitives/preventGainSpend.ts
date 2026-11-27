import { printsCanBeAdvanced } from "../../state/counters/advanceable.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { fireOnPlay } from "../../state/triggers/cardLifecycleHooks.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { RuleCite } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointQuPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "gain_credits_per_corp_credits": {
      const gainAmt = Math.floor((state.corp.credits ?? 0) / 5);
      if (gainAmt <= 0) {
        log(state, `Tapwrm — Corp has <5¢; gain 0.`);
        return { ok: true };
      }
      state.runner.credits += gainAmt;
      log(
        state,
        `Tapwrm — gain ${gainAmt}¢ (Corp has ${state.corp.credits}¢).`,
      );
      return { ok: true };
    }

    case "schedule_additional_runner_turn": {
      state.pendingExtraRunnerTurns = (state.pendingExtraRunnerTurns ?? 0) + 1;
      log(state, `Encore — take an additional turn after this one.`);
      return { ok: true };
    }

    case "return_looked": {
      const looked = [...state.turn.rdLookedCards];
      state.turn.rdLookedCards = [];
      for (const id of looked.reverse()) {
        state.cards[id].faceup = false;
        state.corp.deck.unshift(id);
        state.cards[id].zone = "corp:rd";
      }
      log(state, `Psychokinesis — return looked cards to R&D.`);
      return { ok: true };
    }

    case "pay_up_to_place_advancements": {
      const max = Math.max(0, action.max ?? 2);
      const credits = state.corp.credits;
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c) continue;
          if (c.type === "agenda" || printsCanBeAdvanced(c)) targets.push(id);
        }
      }
      if (targets.length === 0 || credits <= 0 || max <= 0) {
        log(state, `Herald — nothing to advance.`);
        return { ok: true };
      }
      const maxPay = Math.min(max, credits);
      for (let n = 1; n <= maxPay; n++) {
        for (const cardId of targets) {
          options.push({
            id: `herald-adv:${n}:${cardId}`,
            label: `Pay ${n}¢: place ${n} advancement on ${state.cards[cardId]!.title}`,
            effect: fx.do({
              kind: "pay_place_advancements_resolve",
              amount: n,
              cardId,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "pay_place_advancements_resolve": {
      const n = action.amount ?? 0;
      const cardId = action.cardId;
      if (!cardId || n <= 0 || state.corp.credits < n) {
        log(state, `Herald — cannot pay.`);
        return { ok: true };
      }
      state.corp.credits -= n;
      const card = state.cards[cardId]!;
      card.advancementCounters = (card.advancementCounters ?? 0) + n;
      log(
        state,
        `Herald — pay ${n}¢ → place ${n} advancement on ${card.title}.`,
      );
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

    case "may_spend_to_place_power": {
      const maxGain = action.amount ?? 0;
      if (maxGain <= 0) return { ok: true };
      const maxSpend = Math.min(2, state.corp.credits, maxGain);
      if (maxSpend <= 0) {
        log(state, `NASX — cannot spend to place power.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (let n = 1; n <= maxSpend; n++) {
        options.push({
          id: `nasx-power:${n}`,
          label: `Spend ${n}¢: place ${n} power on NASX`,
          effect: fx.do({
            kind: "spend_place_power_resolve",
            amount: n,
            nasxId: sourceId,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "spend_place_power_resolve": {
      const n = action.amount ?? 0;
      const nasxId = action.nasxId ?? sourceId;
      const nasx = state.cards[nasxId];
      if (!nasx || n <= 0 || state.corp.credits < n) return { ok: true };
      state.corp.credits -= n;
      nasx.powerCounters = (nasx.powerCounters ?? 0) + n;
      log(state, `NASX — spend ${n}¢ → ${nasx.powerCounters} power.`);
      return { ok: true };
    }

    default:
      return null;
  }
}
