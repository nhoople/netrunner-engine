/**
 * Primitive kinds whose procedure is play.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type { Primitive } from "../ir.js";
import {
  corpInstallCost,
  creditsAvailableForInstall,
  subtractRunnerCreditPool,
} from "../../state/costs.js";
import { log } from "../../state/createGame.js";
import { fireCorpIdentityFlippedFirstOperationPlay } from "../../state/identityFlipHooks.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import { noteCorpCardAddedToArchives } from "../../state/trashHooks.js";
import { enterLingeringPlayArea } from "../../state/zones.js";
import { CR } from "../../timing/labels.js";
import { fireOnAfterOperationOrExpendable } from "../eval.js";

import {
  noteCheckpointAndResolvePlay,
} from "../eval.js";

export function applyPlayKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "may_play_or_install_from_hq": {
      const installEligible = state.corp.hand.filter((id) => {
        const t = state.cards[id].type;
        return (
          t === "agenda" || t === "asset" || t === "ice" || t === "upgrade"
        );
      });
      const affordableInstall = installEligible.filter(
        (id) =>
          creditsAvailableForInstall(state, "corp") >=
          corpInstallCost(state.cards[id]!, 0),
      );
      const playableOps = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c.type === "operation" &&
          state.corp.credits >= (c.playCost ?? 0)
        );
      });
      if (affordableInstall.length === 0 && playableOps.length === 0) {
        log(state, `Play or install from HQ — no eligible cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...affordableInstall.map((id) => ({
            id: `hq-install:${id}`,
            label: `Install ${state.cards[id].title} for ${corpInstallCost(state.cards[id]!, 0)}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "install_hq_card_paying_costs" as const,
                cardId: id,
              },
            },
          })),
          ...playableOps.map((id) => ({
            id: `hq-play:${id}`,
            label: `Play ${state.cards[id].title} for ${state.cards[id].playCost ?? 0}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "play_hq_operation_paying_costs" as const,
                cardId: id,
              },
            },
          })),
        ],
logLine: `May play an operation or install from HQ.`,
});
      return { ok: true };
    }

case "play_hq_operation_paying_costs": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "operation") {
        log(state, `Play from HQ — not an operation.`);
        return { ok: true };
      }
      if (!state.corp.hand.includes(cardId)) {
        log(state, `Play from HQ — operation not in HQ.`);
        return { ok: true };
      }
      const cost = card.playCost ?? 0;
      if (state.corp.credits < cost) {
        log(state, `Play from HQ — cannot afford ${cost}¢.`);
        return { ok: true };
      }
      state.corp.credits -= cost;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      state.corp.discardPile.push(cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      noteCorpCardAddedToArchives(state);
      log(state, `Corp plays ${card.title} from HQ for ${cost}¢.`);
      noteCheckpointAndResolvePlay(state, cardId, "effect.play");
      return { ok: true };
    }

case "may_play_event_from_heap": {
      const candidates = state.runner.discardPile.filter((id) => {
        const c = state.cards[id];
        return c?.type === "event" && state.runner.credits >= (c.playCost ?? 0);
      });
      if (candidates.length === 0) {
        log(state, `${source.title} — may play event from heap: none affordable.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...candidates.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `play-heap:${id}`,
              label: `Play ${c.title} (${c.playCost ?? 0}¢)`,
              effect: {
                op: "do" as const,
                action: { kind: "play_heap_event_card" as const, cardId: id },
              },
            };
          }),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: { kind: "gain_credits" as const, side: "runner" as const, amount: 0 },
            },
          },
        ],
logLine: `${source.title} — may play an event from the heap.`,
});
      return { ok: true };
    }

case "play_heap_event_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "event" || !state.runner.discardPile.includes(cardId)) {
        log(state, `play_heap_event_card — ${cardId} not in heap.`);
        return { ok: true };
      }
      const cost = card.playCost ?? 0;
      if (state.runner.credits < cost) {
        return {
          ok: false,
          error: "Insufficient credits to play event from heap.",
          cites: [CR.playEvent],
        };
      }
      subtractRunnerCreditPool(state, cost);
      log(state, `Runner plays ${card.title} from heap for ${cost}¢ (CR ${CR.playEvent.number}).`);
      noteCheckpointAndResolvePlay(state, cardId, "effect.play");
      return { ok: true };
    }

case "may_play_transaction_from_archives": {
      const ops = state.corp.discardPile.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" &&
          (c.subtypes ?? []).includes("transaction")
        );
      });
      if (ops.length === 0) {
        log(state, `Plutus — no transaction operations in Archives.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...ops.map((cardId) => ({
            id: cardId,
            label: `Play ${state.cards[cardId]!.title} from Archives`,
            effect: {
              op: "do" as const,
              action: {
                kind: "play_archives_transaction_then_rfg" as const,
                cardId,
              },
            },
          })),
        ],
logLine: `Plutus — may play 1 transaction operation from Archives.`,
});
      return { ok: true };
    }

case "play_archives_transaction_then_rfg": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (
        !card ||
        card.type !== "operation" ||
        !state.corp.discardPile.includes(cardId)
      ) {
        log(state, `play_archives_transaction_then_rfg — not in Archives.`);
        return { ok: true };
      }
      const cost = card.playCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: "Insufficient credits to play operation from Archives.",
          cites: [CR.playOperation],
        };
      }
      state.corp.credits -= cost;
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== cardId);
      enterLingeringPlayArea(state, cardId, "corp");
      state.turn.corpActionTypeCounts.play_operation =
        (state.turn.corpActionTypeCounts.play_operation ?? 0) + 1;
      log(state, `Corp plays ${card.title} from Archives for ${cost}¢ (Plutus).`);
      noteCheckpointAndResolvePlay(state, cardId, "effect.play");
      removeCardFromCurrentZone(state, cardId);
      card.zone = "removed-from-game";
      card.faceup = true;
      if (!state.removedFromGame.includes(cardId)) {
        state.removedFromGame.push(cardId);
      }
      log(state, `${card.title} removed from the game after resolving.`);
      return { ok: true };
    }

case "play_self_from_archives_then_rfg": {
      if (!state.corp.discardPile.includes(sourceId) || source.type !== "operation") {
        log(state, `play_self_from_archives_then_rfg — not in Archives.`);
        return { ok: true };
      }
      if (
        source.playRequiresNoCorpActionFinished &&
        (state.turn.corpActionsCompletedThisTurn ?? 0) > 0
      ) {
        log(state, `play_self_from_archives_then_rfg — Corp already acted.`);
        return { ok: true };
      }
      const cost = source.playCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: "Insufficient credits to play operation from Archives.",
          cites: [CR.playOperation],
        };
      }
      state.corp.credits -= cost;
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== sourceId);
      enterLingeringPlayArea(state, sourceId, "corp");
      state.turn.operationPlayedFromNonHq = true;
      state.turn.corpActionTypeCounts.play_operation =
        (state.turn.corpActionTypeCounts.play_operation ?? 0) + 1;
      log(
        state,
        `Corp plays ${source.title} from Archives for ${cost}¢.`,
      );
      noteCheckpointAndResolvePlay(state, sourceId, "effect.play");
      state.turn.operationPlayedFromNonHq = false;
      log(
        state,
        `${source.title} is not trashed; it remains in the play area until it is removed from the game (CR ${CR.playNoTrashIfPlayEffectWillRfg.number}).`,
      );
      removeCardFromCurrentZone(state, sourceId);
      source.zone = "removed-from-game";
      source.faceup = true;
      source.rezzed = false;
      if (!state.removedFromGame) state.removedFromGame = [];
      if (!state.removedFromGame.includes(sourceId)) {
        state.removedFromGame.push(sourceId);
      }
      log(state, `${source.title} is removed from the game.`);
      fireCorpIdentityFlippedFirstOperationPlay(state);
      fireOnAfterOperationOrExpendable(state);
      return { ok: true };
    }

case "may_play_operation_from_hq": {
      const ops = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `May play operation from HQ — none in HQ.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...ops.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `play:${id}`,
              label: `Play ${c.title}`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "play_hq_operation_card" as const,
                  cardId: id,
                },
              },
            };
          }),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `${source.title} — may play an operation from HQ.`,
});
      return { ok: true };
    }

case "may_play_nonterminal_operation_from_hq": {
      const ops = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "operation" &&
          !(c.subtypes ?? []).includes("terminal") &&
          !c.endsActionPhase
        );
      });
      if (ops.length === 0) {
        log(state, `May play non-terminal operation — none in HQ.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...ops.map((id) => {
            const c = state.cards[id]!;
            return {
              id: `play:${id}`,
              label: `Play ${c.title}`,
              effect: {
                op: "do" as const,
                action: {
                  kind: "play_hq_operation_card" as const,
                  cardId: id,
                },
              },
            };
          }),
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
logLine: `${source.title} — may play a non-terminal operation from HQ.`,
});
      return { ok: true };
    }

case "play_hq_operation_card": {
      // Minimal play: pay playCost from Corp credits and eval onPlay (no click).
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const idx = state.corp.hand.indexOf(cardId);
      if (!card || idx < 0 || card.type !== "operation") {
        log(state, `play_hq_operation_card — invalid target.`);
        return { ok: true };
      }
      const cost = card.playCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: "Insufficient credits to play operation.",
          cites: [CR.playOperation],
        };
      }
      state.corp.credits -= cost;
      state.corp.hand.splice(idx, 1);
      state.corp.discardPile.push(cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      if ((card.subtypes ?? []).includes("mandate")) {
        state.turn.mandatesPlayedThisTurn =
          (state.turn.mandatesPlayedThisTurn ?? 0) + 1;
      }
      log(
        state,
        `Corp plays ${card.title} for ${cost}¢ (from ${source.title}).`,
      );
      noteCheckpointAndResolvePlay(state, cardId, "effect.play");
      return { ok: true };
    }
    default:
      return null;
  }
}
