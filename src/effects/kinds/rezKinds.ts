/**
 * Primitive kinds whose procedure is rez.
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
import { syncEtrPerPowerCounterSubs } from "../../state/powerCounters.js";
import { CR } from "../../timing/labels.js";
import {
  fireIceRezDuringRunHooks,
  applyPrimitive,
} from "../eval.js";

import {
  fireHostRezStateTriggers,
  fireOnRez,
  fireOnAnyIceRez,
} from "../eval.js";

export function applyRezKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "rez_and_host": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c && !c.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no unrezzed ice to rez.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `oa:${id}`,
          label: `Rez ${state.cards[id]!.title} (ignore costs); host Oversight AI`,
          effect: {
            op: "do" as const,
            action: {
              kind: "oversight_ai_host_on_ice" as const,
              iceId: id,
            },
          },
        })),
logLine: `${source.title} — choose ice to rez ignoring costs.`,
});
      return { ok: true };
    }

case "rez_bioroid_and_host": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (
            c &&
            !c.rezzed &&
            c.type === "ice" &&
            (c.subtypes ?? []).includes("bioroid")
          ) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no unrezzed bioroid ice to rez.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `ber:${id}`,
          label: `Rez ${state.cards[id]!.title} (ignore costs); host Bioroid Efficiency Research`,
          effect: {
            op: "do" as const,
            action: {
              kind: "host_on_ice" as const,
              iceId: id,
            },
          },
        })),
logLine: `${source.title} — choose bioroid ice to rez ignoring costs.`,
});
      return { ok: true };
    }

case "rez_ice_by_id": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice" || ice.rezzed) return { ok: true };
      const cost = ice.rezCost ?? 0;
      const agendaId = ice.rezAdditionalCostForfeitAgenda
        ? state.corp.scoreArea.find((id) => !state.cards[id]?.cannotForfeit)
        : undefined;
      if (state.corp.credits < cost || (ice.rezAdditionalCostForfeitAgenda && !agendaId)) {
        log(
          state,
          `${ice.title} cannot be rezzed without its additional cost (CR ${CR.mustNotForceAdditionalCost.number}).`,
        );
        return applyPrimitive(ctx, {
          kind: "move_unrezzed_ice_to_hq",
          iceId: action.iceId,
        });
      }
      state.corp.credits -= cost;
      if (agendaId) {
        const agenda = state.cards[agendaId]!;
        state.corp.scoreArea = state.corp.scoreArea.filter((id) => id !== agendaId);
        state.corp.discardPile.push(agendaId);
        agenda.zone = "corp:archives";
        agenda.faceup = true;
        log(
          state,
          `Forfeit ${agenda.title} and pay ${cost}¢ to rez ${ice.title} (CR ${CR.mustNotForceAdditionalCost.number}).`,
        );
      }
      ice.rezzed = true;
      ice.faceup = true;
      if (!agendaId) log(state, `Corp rezzes ${ice.title}.`);
      return { ok: true };
    }

case "rez_may_resolve_sub": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const c = state.cards[id];
          if (c?.type === "ice" && !c.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Unleash — no unrezzed installed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `unleash-rez:${id}`,
          label: `Rez ${state.cards[id]!.title} ignoring costs`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rez_ice_then_may_resolve_sub" as const,
              cardId: id,
            },
          },
        })),
logLine: `${source.title} — choose an installed ice to rez ignoring costs.`,
});
      return { ok: true };
    }

case "rez_ice_then_may_resolve_sub": {
      const rez = applyPrimitive(ctx, {
        kind: "rez_ice_ignore_costs",
        cardId: action.cardId,
      });
      if (!rez.ok) return rez;
      const ice = state.cards[action.cardId];
      const subs = ice?.subroutines ?? [];
      if (!ice?.rezzed || subs.length === 0) {
        log(state, `Unleash — no subroutines to resolve on ${ice?.title ?? action.cardId}.`);
        return { ok: true };
      }
      const options: import("../ir.js").ChoiceOption[] = subs.map((sub, i) => ({
        id: `unleash-sub:${action.cardId}:${i}`,
        label: `Resolve "${sub.text}" on ${ice.title}`,
        effect: sub.effect,
      }));
      options.push({
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
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may resolve 1 subroutine on ${ice.title}.`,
});
      return { ok: true };
    }

case "rez_installed_paying": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const cost = card.rezCost ?? 0;
      if (state.corp.credits < cost) {
        return {
          ok: false,
          error: `Cannot pay ${cost}¢ to rez ${card.title}.`,
          cites: [CR.revealForAbilityLimitations],
        };
      }
      state.corp.credits -= cost;
      card.rezzed = true;
      card.faceup = true;
      log(state, `${source.title} — pay ${cost}¢ and rez ${card.title}.`);
      fireOnRez(state, card.id);
      return { ok: true };
    }

case "rez_hosted": {
      const ice = state.cards[action.cardId];
      if (
        !ice ||
        ice.type !== "ice" ||
        ice.hostId !== sourceId ||
        !(source.hostedCardIds ?? []).includes(action.cardId)
      ) {
        log(state, `${source.title} — invalid hosted ice.`);
        return { ok: true };
      }
      if (ice.rezzed) {
        log(state, `${ice.title} already rezzed.`);
        return { ok: true };
      }
      if (!state.run) {
        log(state, `${source.title} — no run.`);
        return { ok: true };
      }
      const discount = 7;
      const pay = Math.max(0, (ice.rezCost ?? 0) - discount);
      if (state.corp.credits < pay) {
        log(state, `${source.title} — cannot afford to rez ${ice.title}.`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      ice.rezzed = true;
      ice.faceup = true;
      log(
        state,
        `Rez ${ice.title} for ${pay}¢ (${source.title}, −${discount}¢).`,
      );
      fireOnRez(state, action.cardId);
      fireHostRezStateTriggers(state, action.cardId, "rez");
      fireIceRezDuringRunHooks(state, action.cardId);
      state.run.awakeningCenterHostedIceIds = [
        ...(state.run.awakeningCenterHostedIceIds ?? []),
        action.cardId,
      ];
      // Force the Runner to encounter this ice (Konjin-class nested divert;
      // consumed by chooseOption's "Konjin-class" block in apply.ts).
      state.run.forceEncounterIceId = action.cardId;
      state.run.reencounterIceId = action.cardId;
      state.run.resumeEncounterIceId = sourceId;
      log(
        state,
        `Runner will encounter ${ice.title} (${source.title}); trashed when this run ends.`,
      );
      return { ok: true };
    }

case "rez_ice_ignoring_costs": {
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (!state.cards[id].rezzed) unrezzed.push(id);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Rez ice ignoring costs — no unrezzed ice.`);
        return { ok: true };
      }
      const options = [
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
        ...unrezzed.map((id) => ({
          id,
          label: `Rez ${state.cards[id].title} (ignore costs)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        })),
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: source.side === "runner" ? "corp" : "corp",
        options,
logLine: `Send a Message — may rez ice ignoring all costs.`,
});
      return { ok: true };
    }

case "rez_spend_credits_for_power_counters": {
      const amount = Math.max(0, action.amount);
      if (amount > 0) {
        if (state.corp.credits < amount) {
          log(state, `Rez spend for power — insufficient credits.`);
          return { ok: true };
        }
        state.corp.credits -= amount;
        source.powerCounters = (source.powerCounters ?? 0) + amount;
        log(
          state,
          `${source.title} — pay ${amount}¢ → ${amount} power counter(s) (now ${source.powerCounters}).`,
        );
        syncEtrPerPowerCounterSubs(source, state);
      } else {
        log(state, `${source.title} — place 0 power counters.`);
      }
      return { ok: true };
    }

case "rez_for_expose_interrupt": {
      const card = state.cards[action.cardId];
      if (!card || card.rezzed) {
        return applyPrimitive(ctx, { kind: "may_expose_after_rez_continue" });
      }
      const cost = card.rezCost ?? 0;
      if (state.corp.credits < cost) {
        log(
          state,
          `Cannot rez ${card.title} for expose interrupt — need ${cost}¢.`,
        );
        return applyPrimitive(ctx, { kind: "may_expose_after_rez_continue" });
      }
      state.corp.credits -= cost;
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} for ${cost}¢ (expose interrupt).`);
      return applyPrimitive(ctx, { kind: "may_expose_after_rez_continue" });
    }

case "may_rez_installed_ice_discount": {
      const discount = Math.max(0, action.discount);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const ice = state.cards[id];
          if (ice && !ice.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `May rez ice — no unrezzed installed ice.`);
        return { ok: true };
      }
      const options: import("../ir.js").ChoiceOption[] = targets.map((id) => {
        const ice = state.cards[id]!;
        const base = ice.rezCost ?? 0;
        const pay = Math.max(0, base - discount);
        return {
          id: `rez:${id}`,
          label: `Rez ${ice.title} for ${pay}¢ (−${discount})`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rez_ice_with_discount" as const,
              cardId: id,
              discount,
            },
          },
        };
      });
      options.push({
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
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may rez installed ice (−${discount}¢).`,
});
      return { ok: true };
    }

case "rez_ice_with_discount": {
      const ice = state.cards[action.cardId];
      if (!ice || ice.type !== "ice" || ice.rezzed) {
        log(state, `Rez with discount — invalid or already rezzed.`);
        return { ok: true };
      }
      const pay = Math.max(0, (ice.rezCost ?? 0) - action.discount);
      if (state.corp.credits < pay) {
        log(state, `Rez ${ice.title} — insufficient credits (${pay}¢).`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      ice.rezzed = true;
      ice.faceup = true;
      state.turn.iceRezzedThisTurn += 1;
      log(state, `Rez ${ice.title} for ${pay}¢ (−${action.discount}¢ discount).`);
      fireOnRez(state, action.cardId);
      fireIceRezDuringRunHooks(state, action.cardId);
      fireOnAnyIceRez(state, action.cardId);
      return { ok: true };
    }

case "rez_move_innermost": {
      // Formicary-class (CR 6.8.2c.ex1): rez (discount), move innermost;
      // encounter only when new timing structures are still allowed.
      if (!state.run || source.type !== "ice") {
        log(state, `Formicary response — no run or source is not ice.`);
        return { ok: true };
      }
      const discount = action.rezDiscount ?? 2;
      if (!source.rezzed) {
        const pay = Math.max(0, (source.rezCost ?? 0) - discount);
        if (state.corp.credits < pay) {
          log(
            state,
            `Formicary response — insufficient credits to rez ${source.title} (${pay}¢).`,
          );
          return { ok: true };
        }
        state.corp.credits -= pay;
        source.rezzed = true;
        source.faceup = true;
        state.turn.iceRezzedThisTurn += 1;
        if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
        if (!state.turn.rezzedThisTurnIds.includes(sourceId)) {
          state.turn.rezzedThisTurnIds.push(sourceId);
        }
        log(
          state,
          `Rez ${source.title} for ${pay}¢ (−${discount}¢ Formicary discount).`,
        );
        fireOnRez(state, sourceId);
      }
      const attacked = state.run.attackedServerId;
      let fromServer: import("../../state/types.js").Server | null = null;
      for (const server of Object.values(state.servers)) {
        if (server.ice.includes(sourceId)) {
          fromServer = server;
          break;
        }
      }
      if (!fromServer) {
        log(state, `Formicary response — source not installed as ice.`);
        return { ok: true };
      }
      const toServer = state.servers[attacked];
      if (!toServer) return { ok: true };
      fromServer.ice = fromServer.ice.filter((id) => id !== sourceId);
      toServer.ice.push(sourceId);
      source.zone = `server:${attacked}:ice`;
      const innermostIdx = toServer.ice.length - 1;
      log(
        state,
        `Move ${source.title} to innermost protecting ${attacked}.`,
      );
      if (state.run.forbidNewTimingStructures || state.run.endedTheRun) {
        log(
          state,
          `Cannot move Runner position or initiate encounter after end the run (CR ${CR.runEndsOtherPriorityWindows.number}).`,
        );
        return { ok: true };
      }
      state.run.position = innermostIdx;
      state.run.reencounterIceId = sourceId;
      log(
        state,
        `Runner will encounter ${source.title} after Formicary response.`,
      );
      return { ok: true };
    }

case "may_rez_event_derezzed_ice_ignore_costs": {
      const iceId = state.run?.eventDerezzedIceId;
      if (!iceId || !state.cards[iceId]) {
        log(state, `May rez event-derezzed ice — none recorded.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-window-rez",
            label: "Decline to rez",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          {
            id: `window-rez:${iceId}`,
            label: `Rez ${state.cards[iceId]!.title} ignoring costs`,
            effect: {
              op: "do",
              action: { kind: "rez_ice_ignore_costs", cardId: iceId },
            },
          },
        ],
logLine: `Window — Corp may rez the derezzed ice ignoring costs.`,
});
      return { ok: true };
    }

case "rez_ice_ignore_costs": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Rez ice ignore costs — not ice.`);
        return { ok: true };
      }
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} ignoring all costs.`);
      fireOnRez(state, action.cardId);
      fireHostRezStateTriggers(state, action.cardId, "rez");
      fireIceRezDuringRunHooks(state, action.cardId);
      return { ok: true };
    }

case "rez_up_to_ice_protecting_attacked_ignore_costs": {
      if (!state.run) {
        log(state, `Rez protecting ice — no run.`);
        return { ok: true };
      }
      const maxIce = Math.max(0, action.maxIce);
      if (maxIce <= 0) return { ok: true };
      const server = state.servers[state.run.attackedServerId];
      const unrezzed = (server?.ice ?? []).filter(
        (id) => state.cards[id]?.type === "ice" && !state.cards[id]!.rezzed,
      );
      if (unrezzed.length === 0) {
        log(state, `Rez protecting ice — none unrezzed.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-rez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...unrezzed.map((id) => ({
            id: `rez-protecting:${id}`,
            label: `Rez ${state.cards[id]!.title} ignoring costs`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_one_protecting_attacked_ignore_costs" as const,
                cardId: id,
                remaining: maxIce - 1,
              },
            },
          })),
        ],
logLine: `Rez up to ${maxIce} ice protecting the attacked server ignoring costs.`,
});
      return { ok: true };
    }

case "rez_one_protecting_attacked_ignore_costs": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Rez protecting ice — not ice.`);
        return { ok: true };
      }
      card.rezzed = true;
      card.faceup = true;
      log(state, `Rez ${card.title} ignoring all costs.`);
      fireOnRez(state, action.cardId);
      fireHostRezStateTriggers(state, action.cardId, "rez");
      // Brasília / Thunderbolt hooks (same as paid rez during run).
      fireIceRezDuringRunHooks(state, action.cardId);
      if (state.pendingChoice) return { ok: true };
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0 || !state.run) return { ok: true };
      const server = state.servers[state.run.attackedServerId];
      const unrezzed = (server?.ice ?? []).filter(
        (id) =>
          id !== action.cardId &&
          state.cards[id]?.type === "ice" &&
          !state.cards[id]!.rezzed,
      );
      if (unrezzed.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-rez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...unrezzed.map((id) => ({
            id: `rez-protecting:${id}`,
            label: `Rez ${state.cards[id]!.title} ignoring costs`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_one_protecting_attacked_ignore_costs" as const,
                cardId: id,
                remaining: remaining - 1,
              },
            },
          })),
        ],
      });
      return { ok: true };
    }

case "may_rez_card_with_discount": {
      const discount = Math.max(0, action.discount);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          if (c.type !== "ice" && c.type !== "asset" && c.type !== "upgrade") {
            continue;
          }
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `May rez with discount — no unrezzed installed cards.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-rez-discount",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...targets.map((id) => {
          const c = state.cards[id]!;
          const pay = Math.max(0, (c.rezCost ?? 0) - discount);
          return {
            id: `rez-discount:${id}`,
            label: `Rez ${c.title} for ${pay}¢ (−${discount})`,
            effect: {
              op: "do" as const,
              action: {
                kind: "rez_card_with_discount" as const,
                cardId: id,
                discount,
              },
            },
          };
        }),
      ];
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `May rez 1 card (−${discount}¢).`,
});
      return { ok: true };
    }

case "rez_card_with_discount": {
      const card = state.cards[action.cardId];
      if (
        !card ||
        card.rezzed ||
        (card.type !== "ice" &&
          card.type !== "asset" &&
          card.type !== "upgrade")
      ) {
        log(state, `Rez with discount — invalid or already rezzed.`);
        return { ok: true };
      }
      const pay = Math.max(0, (card.rezCost ?? 0) - action.discount);
      if (state.corp.credits < pay) {
        log(state, `Rez ${card.title} — insufficient credits (${pay}¢).`);
        return { ok: true };
      }
      state.corp.credits -= pay;
      card.rezzed = true;
      card.faceup = true;
      if (card.type === "ice") {
        state.turn.iceRezzedThisTurn += 1;
      }
      if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
      if (!state.turn.rezzedThisTurnIds.includes(action.cardId)) {
        state.turn.rezzedThisTurnIds.push(action.cardId);
      }
      log(
        state,
        `Rez ${card.title} for ${pay}¢ (−${action.discount}¢ discount).`,
      );
      fireHostRezStateTriggers(state, action.cardId, "rez");
      if (card.type === "ice") {
        fireIceRezDuringRunHooks(state, action.cardId);
        fireOnAnyIceRez(state, action.cardId);
      }
      fireOnRez(state, action.cardId);
      return { ok: true };
    }
    default:
      return null;
  }
}
