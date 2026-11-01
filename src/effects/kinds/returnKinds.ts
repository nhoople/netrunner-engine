/**
 * Primitive kinds whose procedure is return.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type {
  Effect,
  Primitive,
} from "../ir.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import {
  removeCardFromCurrentZone,
  checkWinConditions,
} from "../../state/scoring.js";
import { returnRdLookedToDeckTop } from "../eval.js";
import { fx } from "../ir.js";

export function applyReturnKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "may_return_rezzed_to_hq_gain_rez_cost": {
      const rezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c?.rezzed && c.side === "corp") rezzed.push(id);
        }
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of rezzed) {
        const card = state.cards[cardId]!;
        const rez = card.rezCost ?? 0;
        options.push({
          id: `blue-sun:${cardId}`,
          label: `Add ${card.title} to HQ (gain ${rez}¢)`,
          effect: {
            op: "do",
            action: {
              kind: "return_rezzed_to_hq_gain_rez_cost",
              cardId,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may add 1 rezzed card to HQ and gain its rez cost.`,
});
      return { ok: true };
    }

case "return_rezzed_to_hq_gain_rez_cost": {
      const card = state.cards[action.cardId];
      if (!card || !card.rezzed) {
        log(state, `Return rezzed to HQ — invalid target.`);
        return { ok: true };
      }
      const rez = card.rezCost ?? 0;
      removeCardFromCurrentZone(state, action.cardId);
      state.corp.hand.push(action.cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      card.rezzed = false;
      card.advancementCounters = undefined;
      if (rez > 0) {
        state.corp.credits += rez;
      }
      log(
        state,
        `Add ${card.title} to HQ; Corp gains ${rez}¢ (rez cost).`,
      );
      return { ok: true };
    }

case "return_rd_looked_to_deck_top": {
      returnRdLookedToDeckTop(state);
      log(state, `Return looked R&D cards to top of deck.`);
      return { ok: true };
    }

case "return_installed_corp_to_hq": {
      const moveToHq = (pick: string): { ok: true } => {
        const card = state.cards[pick];
        if (!card) {
          log(state, `Return to HQ — card missing.`);
          return { ok: true };
        }
        removeCardFromCurrentZone(state, pick);
        state.corp.hand.push(pick);
        card.zone = "corp:hq";
        card.faceup = false;
        card.rezzed = false;
        card.advancementCounters = undefined;
        log(state, `Add ${card.title} to HQ.`);
        return { ok: true };
      };
      if (action.cardId) {
        return moveToHq(action.cardId);
      }
      const installed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (action.unrezzedOnly && state.cards[id]?.rezzed) continue;
          installed.push(id);
        }
      }
      if (installed.length === 0) {
        log(
          state,
          action.unrezzedOnly
            ? `Return installed Corp to HQ — no unrezzed cards.`
            : `Return installed Corp to HQ — none installed.`,
        );
        return { ok: true };
      }
      if (action.pick === "choose" && installed.length > 1) {
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: installed.map((id) => ({
            id: `corp-hq:${id}`,
            label: `Add ${state.cards[id].title} to HQ`,
            effect: {
              op: "do" as const,
              action: {
                kind: "return_installed_corp_to_hq" as const,
                pick: "first" as const,
                cardId: id,
                ...(action.unrezzedOnly ? { unrezzedOnly: true } : {}),
              },
            },
          })),
logLine: action.unrezzedOnly
            ? `Choose an unrezzed installed Corp card to add to HQ.`
            : `Choose an installed Corp card to add to HQ.`,
});
        return { ok: true };
      }
      return moveToHq(installed[0]!);
    }

case "return_tracked_install_to_stack_top_if_installed": {
      const id =
        state.run?.betaBuildTrackedInstallId ??
        (source as { betaBuildPendingTrackId?: string }).betaBuildPendingTrackId;
      if (!id) {
        log(state, `${source.title} — no tracked program to return.`);
        return { ok: true };
      }
      if (!state.runner.installed.includes(id)) {
        log(state, `${source.title} — tracked program already uninstalled.`);
        return { ok: true };
      }
      state.runner.installed = state.runner.installed.filter((x) => x !== id);
      state.runner.deck.unshift(id);
      state.cards[id]!.zone = "runner:stack";
      state.cards[id]!.faceup = false;
      log(state, `Add ${state.cards[id]!.title} to the top of the stack.`);
      return { ok: true };
    }

case "may_return_self_to_grip": {
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      if (state.runner.credits >= action.creditCost) {
        options.push({
          id: "return",
          label: `Pay ${action.creditCost}¢: add to grip`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: action.creditCost,
                },
              },
              { op: "do", action: { kind: "return_source_to_grip" } },
            ],
          },
        });
      }
      options.push({
        id: "decline",
        label: "Leave in heap",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
logLine: `${source.title} — may pay ${action.creditCost}¢ to return to grip.`,
});
      return { ok: true };
    }

case "return_source_to_grip": {
      // Move source from heap to grip.
      state.runner.discardPile = state.runner.discardPile.filter((id) => id !== sourceId);
      if (!state.runner.hand.includes(sourceId)) {
        state.runner.hand.push(sourceId);
      }
      source.zone = "runner:grip";
      source.faceup = true;
      log(state, `Return ${source.title} to grip.`);
      return { ok: true };
    }

case "return_source_to_hq": {
      if (source.side !== "corp") {
        return { ok: false, error: "return_source_to_hq requires Corp source", cites: [] };
      }
      removeCardFromCurrentZone(state, sourceId);
      state.corp.hand.push(sourceId);
      source.zone = "corp:hq";
      source.faceup = false;
      source.rezzed = false;
      log(state, `Add ${source.title} to HQ.`);
      return { ok: true };
    }

case "return_two_hosted_may_access": {
      const hosted = [...(source.hostedCardIds ?? [])];
      if (hosted.length < 2) {
        log(state, `${source.title} — need 2 hosted cards.`);
        return { ok: true };
      }
      const take = hosted.slice(0, 2);
      source.hostedCardIds = hosted.filter((id) => !take.includes(id));
      for (const id of take) {
        const card = state.cards[id]!;
        card.hostId = undefined;
        card.zone = "corp:hq";
        card.faceup = false;
        state.corp.hand.push(id);
        log(state, `${card.title} returned to HQ from ${source.title}.`);
      }
      if (state.corp.hand.length === 0) {
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "access",
            label: "Access 1 card in HQ at random",
            effect: {
              op: "do" as const,
              action: { kind: "access_random_hq" as const },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
logLine: `${source.title} — Runner may access 1 HQ at random.`,
});
      return { ok: true };
    }

case "return_subliminal_from_archives": {
      // Handled at Corp turn begin when conditions met — this primitive
      // returns the source from Archives to HQ if present.
      if (!state.corp.discardPile.includes(sourceId)) {
        return { ok: true };
      }
      state.corp.discardPile = state.corp.discardPile.filter((id) => id !== sourceId);
      state.corp.hand.push(sourceId);
      source.zone = "corp:hq";
      source.faceup = false;
      log(state, `Return ${source.title} from Archives to HQ.`);
      return { ok: true };
    }

case "return_rig_card_to_grip": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || !state.runner.installed.includes(id)) {
        log(state, `${source.title} — return to grip: card not installed.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, id);
      // Clear trojan host link when bouncing.
      card.hostId = undefined;
      state.runner.hand.push(id);
      card.zone = "runner:grip";
      card.faceup = true;
      log(state, `Return ${card.title} to grip.`);
      return { ok: true };
    }

case "may_return_non_virus_trojan_to_grip_place_hosted": {
      const hostedAmount = Math.max(0, action.hostedAmount);
      const candidates = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        if (!c) return false;
        if (!(c.subtypes ?? []).includes("trojan")) return false;
        if ((c.subtypes ?? []).includes("virus")) return false;
        return true;
      });
      if (candidates.length === 0) {
        log(
          state,
          `${source.title} — no installed non-virus trojan to return.`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        candidates.map((id) => {
          const c = state.cards[id]!;
          return {
            id: `return:${id}`,
            label: `Return ${c.title} to grip; place ${hostedAmount}¢`,
            effect: {
              op: "seq" as const,
              effects: [
                {
                  op: "do" as const,
                  action: {
                    kind: "return_rig_card_to_grip" as const,
                    cardId: id,
                  },
                },
                {
                  op: "do" as const,
                  action: {
                    kind: "place_hosted_credits" as const,
                    amount: hostedAmount,
                  },
                },
              ],
            },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do" as const,
          action: { kind: "gain_credits" as const, side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — may return a non-virus trojan to grip.`,
});
      return { ok: true };
    }

case "return_stolen_agenda_to_hq": {
      const cardId = action.cardId;
      if (!state.runner.scoreArea.includes(cardId)) {
        log(state, `Return stolen agenda — not in Runner score.`);
        return { ok: true };
      }
      const card = state.cards[cardId]!;
      const pts =
        card.worthZeroAgendaPointsWhileHasAgendaCounters &&
        (card.agendaCounters ?? 0) >= 1
          ? 0
          : (card.agendaPoints ?? 0) +
            (card.agendaPointsPerAgendaCounter ?? 0) *
              (card.agendaCounters ?? 0);
      state.runner.scoreArea = state.runner.scoreArea.filter((id) => id !== cardId);
      state.turn.agendaPointsStolenThisTurn = Math.max(
        0,
        state.turn.agendaPointsStolenThisTurn - pts,
      );
      card.zone = "corp:hq";
      card.faceup = false;
      card.rezzed = false;
      card.advancementCounters = 0;
      state.corp.hand.push(cardId);
      log(
        state,
        `${card.title} returned to HQ from Runner score (${source.title}).`,
      );
      if (
        state.winner === "runner" &&
        state.winReason === "runner_agenda"
      ) {
        state.winner = null;
        state.winReason = null;
        state.done = false;
      }
      checkWinConditions(state);
      return { ok: true };
    }
    default:
      return null;
  }
}
