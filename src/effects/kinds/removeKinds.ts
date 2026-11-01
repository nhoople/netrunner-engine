/**
 * Primitive kinds whose procedure is remove.
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
import { CR } from "../../timing/labels.js";
import {
  evalEffect,
  applyPrimitive,
} from "../eval.js";

export function applyRemoveKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "remove_virus_counters": {
      const have = source.virusCounters ?? 0;
      const removed = Math.min(action.amount, have);
      source.virusCounters = have - removed;
      log(
        state,
        `Remove ${removed} virus counter(s) from ${source.title} → ${source.virusCounters}.`,
      );
      return { ok: true };
    }

case "remove_advancements": {
      const have = source.advancementCounters ?? 0;
      const removed = Math.min(action.amount, have);
      if (removed <= 0) {
        log(
          state,
          `Remove advancements — ${source.title} has none (CR ${CR.advancing.number}).`,
        );
        return { ok: true };
      }
      source.advancementCounters = have - removed;
      log(
        state,
        `Remove ${removed} advancement(s) from ${source.title} → ${source.advancementCounters} (CR ${CR.advancing.number}).`,
      );
      if (action.then) {
        return evalEffect(ctx, action.then);
      }
      return { ok: true };
    }

case "remove_bigger_picture_tags": {
      const max = state.runner.tags;
      if (max <= 0) {
        log(state, `Bigger Picture — Runner has no tags to remove.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= max; n++) {
        options.push({
          id: `remove-${n}`,
          label:
            n === 0
              ? "Remove 0 tags"
              : `Remove ${n} tag(s) (Runner loses ${n * 5}¢)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: { kind: "remove_tags", amount: n },
              },
              {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: n * 5,
                  gainPerCreditLost: { side: "corp", per: 1 },
                },
              },
            ],
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `Bigger Picture — choose how many tags to remove.`,
});
      return { ok: true };
    }

case "remove_enforcement_tags": {
      const max = state.runner.tags;
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let n = 0; n <= max; n++) {
        options.push({
          id: `remove-${n}`,
          label: n === 0 ? "Remove 0 tags" : `Remove ${n} tag(s)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: { kind: "remove_tags", amount: n },
              },
              {
                op: "do",
                action: {
                  kind: "store_ip_enforcement_tags_removed",
                  amount: n,
                },
              },
            ],
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `IP Enforcement — choose how many tags to remove.`,
});
      return { ok: true };
    }

case "remove_up_to": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const remove = Math.min(action.amount, card.advancementCounters ?? 0);
      card.advancementCounters = Math.max(0, (card.advancementCounters ?? 0) - remove);
      log(
        state,
        `Exploratory Romp — remove ${remove} advancement counter(s) from ${card.title}.`,
      );
      return { ok: true };
    }

case "remove_co_2_look_rd": {
      if ((source.powerCounters ?? 0) < 2) {
        log(state, `${source.title} — need 2 power counters.`);
        return { ok: true };
      }
      source.powerCounters = (source.powerCounters ?? 0) - 2;
      const top = state.corp.deck.slice(0, 3);
      if (top.length === 0) {
        log(state, `${source.title} — R&D empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: top.map((cardId) => ({
          id: cardId,
          label: `Trash ${state.cards[cardId]!.title}; rest to HQ`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_co_looked_rd_card" as const, cardId },
          },
        })),
logLine: `${source.title} — look at top ${top.length} of R&D; trash 1, rest to HQ.`,
});
      return { ok: true };
    }

case "remove_nihilist_virus_from": {
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Nihilist remove virus — unknown card.`);
        return { ok: true };
      }
      const have = card.virusCounters ?? 0;
      const removed = Math.min(action.amount, have);
      card.virusCounters = have - removed;
      log(
        state,
        `${source.title} — remove ${removed} virus from ${card.title} → ${card.virusCounters}.`,
      );
      if (action.remaining <= 0) {
        return applyPrimitive(ctx, {
          kind: "nihilist_corp_trash_top_rd_or_runner_draws_2",
        });
      }
      const withVirus = state.runner.installed.filter(
        (id) => (state.cards[id]?.virusCounters ?? 0) > 0,
      );
      if (withVirus.length === 0) {
        log(state, `${source.title} — no more virus to remove.`);
        return { ok: true };
      }
      const contOptions: Array<{
        id: string;
        label: string;
        effect: Effect;
      }> = [];
      for (const id of withVirus) {
        const c = state.cards[id]!;
        const have = c.virusCounters ?? 0;
        const maxTake = Math.min(action.remaining, have);
        for (let take = 1; take <= maxTake; take++) {
          contOptions.push({
            id: `nihilist-rm:${id}:${take}`,
            label: `Remove ${take} virus from ${c.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "remove_nihilist_virus_from" as const,
                cardId: id,
                amount: take,
                remaining: action.remaining - take,
              },
            },
          });
        }
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: contOptions,
logLine: `${source.title} — remove ${action.remaining} more virus counter(s).`,
});
      return { ok: true };
    }

case "remove_all_virus_from_one_installed": {
      const withVirus: string[] = [];
      for (const id of state.runner.installed) {
        if ((state.cards[id]?.virusCounters ?? 0) > 0) withVirus.push(id);
      }
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if ((state.cards[id]?.virusCounters ?? 0) > 0) withVirus.push(id);
        }
      }
      if (withVirus.length === 0) {
        log(state, `Remove all virus — no installed card with virus counters.`);
        return { ok: true };
      }
      if (withVirus.length === 1) {
        return applyPrimitive(ctx, {
          kind: "remove_all_virus_from",
          cardId: withVirus[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: withVirus.map((id) => ({
          id: `rm-virus:${id}`,
          label: `Remove all virus from ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "remove_all_virus_from" as const, cardId: id },
          },
        })),
logLine: `Remove all virus counters from 1 installed card.`,
});
      return { ok: true };
    }

case "remove_all_virus_from": {
      const card = state.cards[action.cardId];
      if (!card) {
        log(state, `Remove all virus — unknown card.`);
        return { ok: true };
      }
      const had = card.virusCounters ?? 0;
      card.virusCounters = 0;
      log(
        state,
        `Remove all virus counters from ${card.title} (had ${had}).`,
      );
      return { ok: true };
    }

case "may_remove_advancement_from_installed_gain_credits": {
      const credits = action.credits ?? 0;
      const advanced: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          if ((state.cards[id]?.advancementCounters ?? 0) > 0) advanced.push(id);
        }
      }
      if (advanced.length === 0) {
        log(state, `${source.title} — no advanced installed cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-remove-adv",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...advanced.map((id) => ({
            id: `remove-adv:${id}`,
            label: `Remove 1 advancement from ${state.cards[id]!.title}; gain ${credits}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "remove_advancement_from_installed_gain_credits" as const,
                cardId: id,
                credits,
              },
            },
          })),
        ],
logLine: `${source.title} — may remove 1 advancement from an installed card to gain ${credits}¢.`,
});
      return { ok: true };
    }

case "remove_advancement_from_installed_gain_credits": {
      const card = state.cards[action.cardId];
      if (!card || (card.advancementCounters ?? 0) <= 0) {
        log(state, `Remove advancement — card has none.`);
        return { ok: true };
      }
      card.advancementCounters = (card.advancementCounters ?? 0) - 1;
      state.corp.credits += action.credits;
      log(
        state,
        `Remove 1 advancement from ${card.title}; gain ${action.credits}¢ → ${state.corp.credits}¢.`,
      );
      return { ok: true };
    }

case "remove_power_from_hosted_card_install_at_zero_ignore_costs": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => (state.cards[id]?.powerCounters ?? 0) > 0,
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted card with power counters.`);
        return { ok: true };
      }
      if (hosted.length === 1) {
        return applyPrimitive(ctx, {
          kind: "remove_power_from_hosted_card_id_install_at_zero",
          cardId: hosted[0]!,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: hosted.map((cardId) => ({
          id: `pw-remove:${cardId}`,
          label: `Remove 1 power from ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "remove_power_from_hosted_card_id_install_at_zero" as const,
              cardId,
            },
          },
        })),
logLine: `${source.title} — choose a hosted card to remove 1 power.`,
});
      return { ok: true };
    }

case "remove_power_from_hosted_card_id_install_at_zero": {
      const card = state.cards[action.cardId];
      if (
        !card ||
        !(source.hostedCardIds ?? []).includes(action.cardId) ||
        (card.powerCounters ?? 0) < 1
      ) {
        log(state, `${source.title} — cannot remove power from that card.`);
        return { ok: true };
      }
      card.powerCounters = (card.powerCounters ?? 0) - 1;
      log(
        state,
        `Remove 1 power from ${card.title} → ${card.powerCounters}.`,
      );
      if ((card.powerCounters ?? 0) <= 0) {
        return applyPrimitive(ctx, {
          kind: "install_hosted_card_ignore_costs",
          cardId: action.cardId,
        });
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
