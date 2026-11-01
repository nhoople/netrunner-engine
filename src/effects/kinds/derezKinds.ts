/**
 * Primitive kinds whose procedure is derez.
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
import { addIceStrengthBoostThisEncounter } from "../../state/lingeringEffects.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import {
  maybeFireKerosMcintyreOnDerez,
  applyPrimitive,
} from "../eval.js";
import { fx } from "../ir.js";
import { syncMauiRecurringCredits } from "../primitives/chooseGainShuffle.js";

import {
  fireHostRezStateTriggers,
} from "../eval.js";

export function applyDerezKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "derez_encounter_ice": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) {
        log(state, `Derez encounter ice — not encountering.`);
        return { ok: true };
      }
      const ice = state.cards[iceId];
      if (!ice?.rezzed) {
        log(state, `Derez encounter ice — already unrezzed.`);
        return { ok: true };
      }
      ice.rezzed = false;
      ice.faceup = false;
      if (state.run) state.run.iceDerezzedThisRun = true;
      log(state, `Derez ${ice.title} (encounter).`);
      fireHostRezStateTriggers(state, iceId, "derez");
      return { ok: true };
    }

case "derez_ice": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id].rezzed) iceIds.push(id);
        }
      }
      if (iceIds.length === 0) {
        log(state, `Derez ice — no rezzed ice.`);
        return { ok: true };
      }
      if (action.pick === "choose" && iceIds.length > 1) {
        // Printed: "Derez 1 installed piece of ice" — the Runner chooses.
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: iceIds.map((id) => ({
            id: `derez:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: fx.do({ kind: "derez_card", cardId: id }),
          })),
        });
        return { ok: true };
      }
      const target = iceIds[0]!;
      state.cards[target].rezzed = false;
      state.cards[target].faceup = false;
      log(state, `Derez ${state.cards[target].title}.`);
      fireHostRezStateTriggers(state, target, "derez");
      return { ok: true };
    }

case "derez_card": {
      const card = state.cards[action.cardId];
      if (!card || !card.rezzed) {
        log(
          state,
          `Derez card — ${card?.title ?? action.cardId} not rezzed (CR ${CR.derez.number}).`,
        );
        return { ok: true };
      }
      card.rezzed = false;
      card.faceup = false;
      log(
        state,
        `Derez ${card.title} (CR ${CR.derez.number}, ${CR.derezByAbility.number}).`,
      );
      if (card.type === "ice") {
        if (state.run) state.run.iceDerezzedThisRun = true;
        fireHostRezStateTriggers(state, action.cardId, "derez");
        maybeFireKerosMcintyreOnDerez(state);
        syncMauiRecurringCredits(state);
      }
      return { ok: true };
    }

case "derez_source": {
      if (!source.rezzed) {
        log(
          state,
          `Derez source — ${source.title} not rezzed (CR ${CR.derez.number}).`,
        );
        return { ok: true };
      }
      source.rezzed = false;
      source.faceup = false;
      log(
        state,
        `Derez ${source.title} (CR ${CR.derez.number}, ${CR.derezByAbility.number}).`,
      );
      if (source.type === "ice") {
        if (state.run) state.run.iceDerezzedThisRun = true;
        fireHostRezStateTriggers(state, sourceId, "derez");
      }
      return { ok: true };
    }

case "may_derez_installed": {
      const excludeSelf = action.excludeSelf !== false;
      const onlyIce = Boolean(action.onlyIce);
      const excludeAttacked = Boolean(action.excludeProtectingAttackedServer);
      const attacked = state.run?.attackedServerId;
      const targets: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (excludeAttacked && attacked && sid === attacked) continue;
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (!c?.rezzed) continue;
          if (onlyIce && c.type !== "ice") continue;
          if (excludeSelf && id === sourceId) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(
          state,
          `May derez installed — no other rezzed installed cards (CR ${CR.derez.number}).`,
        );
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => {
          const title = state.cards[id]!.title;
          const effects: Effect[] = [
            { op: "do", action: { kind: "derez_card", cardId: id } },
          ];
          if (action.then) {
            effects.push(structuredClone(action.then));
          }
          return {
            id: `derez:${id}`,
            label: `Derez ${title}`,
            effect:
              effects.length === 1
                ? effects[0]!
                : { op: "seq" as const, effects },
          };
        });
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
logLine: `${source.title} — may derez another installed card (CR ${CR.derez.number}).`,
});
      return { ok: true };
    }

case "may_derez_protecting_attacked_ice": {
      if (!state.run) {
        log(state, `Derez protecting ice — no run.`);
        return { ok: true };
      }
      const server = state.servers[state.run.attackedServerId];
      const iceIds = server?.ice ?? [];
      if (iceIds.length === 0) {
        log(state, `Derez protecting ice — none protecting attacked server.`);
        return { ok: true };
      }
      // Prefer rezzed; allow any protecting ice (Window text: "derez 1 piece").
      const targets = iceIds.filter((id) => state.cards[id]?.rezzed);
      const pool = targets.length > 0 ? targets : iceIds;
      if (pool.length === 1) {
        return applyPrimitive(ctx, {
          kind: "derez_ice_protecting_attacked",
          cardId: pool[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: pool.map((id) => ({
          id: `window-derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "derez_ice_protecting_attacked" as const,
              cardId: id,
            },
          },
        })),
logLine: `Window — derez 1 ice protecting the attacked server.`,
});
      return { ok: true };
    }

case "derez_unless_protecting_attacked": {
      if (!state.run) {
        log(state, `BP unless derez — no run.`);
        return { ok: true };
      }
      const server = state.servers[state.run.attackedServerId];
      const rezzed = (server?.ice ?? []).filter(
        (id) => state.cards[id]?.rezzed,
      );
      const takeBp = {
        id: "take-bp",
        label: "Take 1 bad publicity",
        effect: {
          op: "do" as const,
          action: { kind: "give_bad_publicity" as const, amount: 1 },
        },
      };
      if (rezzed.length === 0) {
        return applyPrimitive(ctx, {
          kind: "give_bad_publicity",
          amount: 1,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          ...rezzed.map((id) => ({
            id: `kompromat-derez:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "derez_ice_protecting_attacked" as const,
                cardId: id,
              },
            },
          })),
          takeBp,
        ],
logLine: `${source.title} — Corp may derez protecting ice or take 1 bad publicity.`,
});
      return { ok: true };
    }

case "derez_ice_protecting_attacked": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Derez protecting ice — not ice.`);
        return { ok: true };
      }
      if (card.rezzed) {
        card.rezzed = false;
        card.faceup = false;
        if (state.run) state.run.iceDerezzedThisRun = true;
        fireHostRezStateTriggers(state, action.cardId, "derez");
      }
      if (state.run) {
        state.run.eventDerezzedIceId = action.cardId;
      }
      log(state, `Derez ${card.title} (Window of Opportunity).`);
      return { ok: true };
    }

case "derez_up_to_ice_protecting_server": {
      const maxIce = Math.max(0, action.maxIce);
      if (maxIce <= 0) return { ok: true };
      const serverId = action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[serverId];
      const rezzed = (server?.ice ?? []).filter(
        (id) => state.cards[id]?.type === "ice" && state.cards[id]!.rezzed,
      );
      if (rezzed.length === 0) {
        log(state, `Derez ice protecting ${serverId} — none rezzed.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-derez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...rezzed.map((id) => ({
            id: `derez-protecting:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "derez_one_protecting_server" as const,
                cardId: id,
                serverId,
                remaining: maxIce - 1,
              },
            },
          })),
        ],
logLine: `Derez up to ${maxIce} ice protecting ${serverId}.`,
});
      return { ok: true };
    }

case "derez_one_protecting_server": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "ice") {
        log(state, `Derez protecting ice — not ice.`);
        return { ok: true };
      }
      if (card.rezzed) {
        card.rezzed = false;
        card.faceup = false;
        if (state.run) state.run.iceDerezzedThisRun = true;
        fireHostRezStateTriggers(state, action.cardId, "derez");
      }
      log(state, `Derez ${card.title}.`);
      const remaining = Math.max(0, action.remaining ?? 0);
      if (remaining <= 0) return { ok: true };
      const serverId = action.serverId as import("../../state/types.js").ServerId;
      const server = state.servers[serverId];
      const rezzed = (server?.ice ?? []).filter(
        (id) =>
          id !== action.cardId &&
          state.cards[id]?.type === "ice" &&
          state.cards[id]!.rezzed,
      );
      if (rezzed.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "done-derez-protecting",
            label: "Done",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...rezzed.map((id) => ({
            id: `derez-protecting:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "derez_one_protecting_server" as const,
                cardId: id,
                serverId,
                remaining: remaining - 1,
              },
            },
          })),
        ],
      });
      return { ok: true };
    }

case "derez_brasilia_other_ice_for_strength": {
      const other = state.cards[action.otherIceId];
      if (!other || other.type !== "ice" || !other.rezzed) {
        log(state, `Brasília — other ice not rezzed.`);
        return { ok: true };
      }
      other.rezzed = false;
      other.faceup = false;
      if (state.run) state.run.iceDerezzedThisRun = true;
      fireHostRezStateTriggers(state, action.otherIceId, "derez");
      if (state.run) {
        addIceStrengthBoostThisEncounter(state, {
          createdBy: sourceId,
          iceId: action.rezzedIceId,
          amount: action.bonus,
        });
      }
      log(
        state,
        `Brasília — derez ${other.title}; ${state.cards[action.rezzedIceId]?.title ?? action.rezzedIceId} gets +${action.bonus} strength this run.`,
      );
      return { ok: true };
    }

case "derez_any_number_then_may_rez_discount_per": {
      return applyPrimitive(ctx, {
        kind: "derez_any_number_continue",
        creditsPerDerezzed: action.creditsPerDerezzed,
        derezzed: 0,
      });
    }

case "derez_any_number_continue": {
      const per = Math.max(0, action.creditsPerDerezzed);
      let derezzed = Math.max(0, action.derezzed);
      if (action.justDerezzedId) {
        const just = state.cards[action.justDerezzedId];
        if (just?.rezzed) {
          just.rezzed = false;
          just.faceup = false;
          if (just.type === "ice") {
            if (state.run) state.run.iceDerezzedThisRun = true;
            fireHostRezStateTriggers(state, action.justDerezzedId, "derez");
          }
          derezzed += 1;
          log(state, `Derez ${just.title} (${derezzed} total).`);
        }
      }
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed) targets.push(id);
        }
      }
      const doneFx: Effect = {
        op: "do",
        action: {
          kind: "may_rez_card_with_discount",
          discount: per * derezzed,
        },
      };
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "done-derez-any",
          label: `Done derezzing (${derezzed}; −${per * derezzed}¢ next rez)`,
          effect: doneFx,
        },
        ...targets.map((id) => ({
          id: `derez-any:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "derez_any_number_continue" as const,
              creditsPerDerezzed: per,
              derezzed,
              justDerezzedId: id,
            },
          },
        })),
      ];
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Divert Power — derez any number (current ${derezzed}), then may rez (−${per}¢ each).`,
});
      return { ok: true };
    }
    default:
      return null;
  }
}
