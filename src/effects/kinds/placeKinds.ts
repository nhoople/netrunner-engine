/**
 * Primitive kinds whose procedure is place.
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
import { abilitiesSuppressed } from "../../state/abilities.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import {
  finishPlaceAdvancementsOnTarget,
  evalEffect,
  applyPrimitive,
} from "../eval.js";
import { fx } from "../ir.js";

export function applyPlaceKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "place_virus_on_program_that_received_virus_this_turn": {
      const ids = (state.turn.programsWithVirusPlacedThisTurn ?? []).filter(
        (id) => {
          const c = state.cards[id];
          return c && c.type === "program" && state.runner.installed.includes(id);
        },
      );
      if (ids.length === 0) {
        log(state, `${source.title} — no program received virus this turn.`);
        return { ok: true };
      }
      if (ids.length === 1) {
        return applyPrimitive(ctx, {
          kind: "place_virus_on_program",
          cardId: ids[0]!,
          amount: action.amount,
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: ids.map((id) => ({
          id: `surge-virus:${id}`,
          label: `Place ${action.amount} virus on ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "place_virus_on_program" as const,
              cardId: id,
              amount: action.amount,
            },
          },
        })),
logLine: `${source.title} — choose a program that received virus this turn.`,
});
      return { ok: true };
    }

case "place_virus_on_program": {
      const card = state.cards[action.cardId];
      if (!card || card.type !== "program") {
        log(state, `Place virus — invalid program.`);
        return { ok: true };
      }
      card.virusCounters = (card.virusCounters ?? 0) + action.amount;
      if (!state.turn.programsWithVirusPlacedThisTurn.includes(action.cardId)) {
        state.turn.programsWithVirusPlacedThisTurn.push(action.cardId);
      }
      if (
        card.recurringCreditsMaxEqualsVirusCounters &&
        !abilitiesSuppressed(state, action.cardId)
      ) {
        card.recurringCreditsMax = card.virusCounters ?? 0;
      }
      log(
        state,
        `Place ${action.amount} virus counter(s) on ${card.title} → ${card.virusCounters}.`,
      );
      return { ok: true };
    }

case "place_advancements": {
      const installed: string[] = [];
      if (action.anyInstalledIce) {
        for (const server of Object.values(state.servers)) {
          for (const id of server.ice) {
            if (action.excludeSelf && id === sourceId) continue;
            if (state.cards[id]?.type === "ice") installed.push(id);
          }
        }
      } else if (action.onlyRemoteRoot) {
        for (const server of Object.values(state.servers)) {
          if (server.kind !== "remote") continue;
          for (const id of server.root) {
            if (action.excludeSelf && id === sourceId) continue;
            if (state.cards[id]) installed.push(id);
          }
        }
      } else if (action.onlyIceProtectingSourceServerWithNoAdvancements) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of server.ice) {
              const c = state.cards[id];
              if (c?.type === "ice" && (c.advancementCounters ?? 0) === 0) {
                installed.push(id);
              }
            }
          }
        }
      } else if (action.onlyIceProtectingSourceServer) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of server.ice) {
              if (state.cards[id]?.type === "ice") installed.push(id);
            }
          }
        }
      } else if (action.sameServerRootOrIceAsSource) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of [...server.root, ...server.ice]) {
              if (action.excludeSelf && id === sourceId) continue;
              const c = state.cards[id];
              if (c && (c.type === "agenda" || c.canAdvance)) {
                installed.push(id);
              }
            }
          }
        }
      } else if (action.sameServerRootAsSource) {
        const zone = source.zone;
        if (zone.startsWith("server:") && zone.endsWith(":root")) {
          const serverId = zone
            .replace(/^server:/, "")
            .replace(/:root$/, "") as import("../../state/types.js").ServerId;
          const server = state.servers[serverId];
          if (server) {
            for (const id of server.root) {
              if (action.excludeSelf && id === sourceId) continue;
              const c = state.cards[id];
              if (c && (c.type === "agenda" || c.canAdvance)) {
                installed.push(id);
              }
            }
          }
        }
      } else {
        for (const server of Object.values(state.servers)) {
          for (const id of [...server.root, ...server.ice]) {
            if (action.excludeSelf && id === sourceId) continue;
            const c = state.cards[id];
            // Advanceable only: agendas always; other cards need canAdvance
            // (CR §1.9.5f / Vasilisa; Seamless Launch).
            if (c.type === "agenda" || c.canAdvance) {
              installed.push(id);
            }
          }
        }
      }
      let candidates = installed;
      if (action.preferNotInstalledThisTurn) {
        const filtered = installed.filter(
          (id) => !state.turn.installedThisTurn.includes(id),
        );
        if (filtered.length > 0) candidates = filtered;
      }
      if (action.unrezzedOnly) {
        candidates = candidates.filter((id) => !state.cards[id]?.rezzed);
      }
      if (action.faceupOnly) {
        candidates = candidates.filter((id) => {
          const c = state.cards[id];
          return Boolean(c?.faceup || c?.rezzed);
        });
      }
      if (candidates.length === 0) {
        log(state, `Place advancements — no eligible card.`);
        if (action.then) return evalEffect(ctx, action.then);
        return { ok: true };
      }
      const pickMode = action.pick ?? "first";
      if (pickMode === "choose" && candidates.length > 1) {
        const options: Array<{ id: string; label: string; effect: Effect }> =
          candidates.map((id) => ({
            id: `adv:${id}`,
            label: `Place on ${state.cards[id]!.title}`,
            effect: {
              op: "do",
              action: {
                kind: "place_advancements_on",
                cardId: id,
                amount: action.amount,
                ...(action.cannotScoreTargetThisTurn
                  ? { cannotScoreTargetThisTurn: true }
                  : {}),
                ...(action.then !== undefined
                  ? { then: structuredClone(action.then) }
                  : {}),
              },
            },
          }));
        options.push({
          id: "decline",
          label: "Decline",
          effect: action.then
            ? structuredClone(action.then)
            : {
                op: "do",
                action: { kind: "gain_credits", side: "corp", amount: 0 },
              },
        });
        openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — choose card for advancements.`,
});
        return { ok: true };
      }
      return finishPlaceAdvancementsOnTarget(
        ctx,
        action,
        sourceId,
        source,
        candidates[0]!,
      );
    }

case "place_advancements_on_self_per_faceup_archive_types": {
      const types = new Set<string>();
      for (const id of state.corp.discardPile) {
        const c = state.cards[id];
        if (c?.faceup) types.add(c.type);
      }
      const n = (action.base ?? 0) + types.size;
      source.advancementCounters = (source.advancementCounters ?? 0) + n;
      log(
        state,
        `Place ${n} advancement(s) on ${source.title} (base ${action.base ?? 0} + ${types.size} faceup Archives types) → ${source.advancementCounters}.`,
      );
      return { ok: true };
    }

case "place_up_to": {
      const max = Math.max(0, action.max ?? 0);
      const creditsPer = Math.max(0, action.creditsPer ?? 0);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        for (const id of server.root) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          targets.push(id);
        }
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline",
          label: "Decline (place 0)",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (const cardId of targets) {
        const title = state.cards[cardId]!.title;
        for (let n = 1; n <= max; n++) {
          options.push({
            id: `qg:${cardId}:${n}`,
            label: `Place ${n} on ${title} (gain ${n * creditsPer}¢)`,
            effect: {
              op: "do",
              action: {
                kind: "place_on",
                cardId,
                amount: n,
                creditsPer,
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `${source.title} — place up to ${max} advancements on an unrezzed remote-root card.`,
});
      return { ok: true };
    }

case "place_on": {
      const target = state.cards[action.cardId];
      if (!target) {
        log(state, `Queen's Gambit — unknown card ${action.cardId}.`);
        return { ok: true };
      }
      const amount = Math.max(0, action.amount ?? 0);
      target.advancementCounters = (target.advancementCounters ?? 0) + amount;
      const gain = amount * Math.max(0, action.creditsPer ?? 0);
      if (gain > 0) {
        state.runner.credits += gain;
      }
      if (!state.turn.cannotAccessCardIdsThisTurn.includes(action.cardId)) {
        state.turn.cannotAccessCardIdsThisTurn.push(action.cardId);
      }
      log(
        state,
        `Place ${amount} advancement(s) on ${target.title}; Runner gains ${gain}¢; cannot access ${target.title} this turn.`,
      );
      return { ok: true };
    }

case "place_agenda_counters_past": {
      const past = action.past;
      const per = action.per ?? 1;
      const adv =
        source.scoreBeginAdvancementCounters ??
        source.advancementCounters ??
        0;
      const over = Math.max(0, adv - past);
      const n = Math.floor(over / per);
      source.agendaCounters = (source.agendaCounters ?? 0) + n;
      log(
        state,
        `Place ${n} agenda counter(s) past ${past} (${adv}−${past})/${per} → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }

case "place_agenda_hq_or_rd_bottom": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || card.type !== "agenda") {
        log(state, `Place agenda — not an agenda.`);
        return { ok: true };
      }
      // remove from wherever
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      state.corp.deck = state.corp.deck.filter((x) => x !== id);
      state.corp.discardPile = state.corp.discardPile.filter((x) => x !== id);
      for (const server of Object.values(state.servers)) {
        server.root = server.root.filter((x) => x !== id);
      }
      if (action.destination === "hq") {
        state.corp.hand.push(id);
        card.zone = "corp:hq";
        card.faceup = false;
        log(state, `Reveal ${card.title} — add to HQ.`);
      } else {
        state.corp.deck.push(id);
        card.zone = "corp:rd";
        card.faceup = false;
        log(state, `Reveal ${card.title} — bottom of R&D.`);
      }
      // shuffle R&D after searching it (always safe)
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      return { ok: true };
    }

case "place_advancements_per_iced_rooted_remote": {
      let amount = 0;
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        if (server.root.length > 0 && server.ice.length > 0) amount += 1;
      }
      const advanceable: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) {
            advanceable.push(id);
          }
        }
      }
      if (advanceable.length === 0) {
        log(
          state,
          `${source.title} — no advanceable installed card (0 iced rooted remotes counted: ${amount}).`,
        );
        return { ok: true };
      }
      if (advanceable.length === 1) {
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "place_advancements_on",
            cardId: advanceable[0]!,
            amount,
          },
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: advanceable.map((id) => ({
          id: `adv-iced-remote:${id}`,
          label: `Place ${amount} advancement(s) on ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "place_advancements_on" as const,
              cardId: id,
              amount,
            },
          },
        })),
logLine: `${source.title} — choose advanceable card (${amount} iced rooted remote(s)).`,
});
      return { ok: true };
    }

case "place_advancements_x_from_tags": {
      // Printed: "X must be equal to or less than the number of tags the
      // Runner has. Place X advancement counters on 1 installed card you
      // can advance." The Corp chooses both X and the target.
      const maxX = Math.min(state.corp.credits, state.runner.tags);
      if (maxX <= 0) {
        log(state, `Psychographics — X=0 (no tags or credits).`);
        return { ok: true };
      }
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Psychographics — no advanceable target.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const id of targets) {
        for (let x = 1; x <= maxX; x++) {
          options.push({
            id: `psycho:${id}:${x}`,
            label: `Pay ${x}¢: place ${x} advancement(s) on ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "place_advancements_x_from_tags_resolve",
              cardId: id,
              amount: x,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

case "place_advancements_x_from_tags_resolve": {
      const cardId = action.cardId;
      const x = action.amount;
      const t = cardId ? state.cards[cardId] : undefined;
      if (!t || state.corp.credits < x) return { ok: true };
      state.corp.credits -= x;
      t.advancementCounters = (t.advancementCounters ?? 0) + x;
      log(
        state,
        `Psychographics — spend ${x}¢, place ${x} advancement(s) on ${t.title}.`,
      );
      return { ok: true };
    }

case "place_event_credits": {
      if (!state.run) {
        log(state, `place_event_credits — no active run.`);
        return { ok: true };
      }
      state.run.eventCredits = (state.run.eventCredits ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount}¢ on the run (event credits → ${state.run.eventCredits}).`,
      );
      return { ok: true };
    }

case "place_advancements_on": {
      const target = state.cards[action.cardId];
      if (!target) {
        log(state, `Place advancements — unknown card ${action.cardId}.`);
        if (action.then) return evalEffect(ctx, action.then);
        return { ok: true };
      }
      const prior = target.advancementCounters ?? 0;
      target.advancementCounters = prior + action.amount;
      state.turn.lastAdvancementTargetId = action.cardId;
      if (action.cannotScoreTargetThisTurn) {
        if (!state.turn.cannotScoreOrRezCardIds.includes(action.cardId)) {
          state.turn.cannotScoreOrRezCardIds.push(action.cardId);
        }
      }
      log(
        state,
        `Place ${action.amount} advancement(s) on ${target.title} → ${target.advancementCounters}.`,
      );
      if (action.then) return evalEffect(ctx, action.then);
      return { ok: true };
    }

case "place_adv_on_ice": {
      const target = state.cards[action.cardId];
      if (target?.type === "ice") {
        target.advancementCounters = (target.advancementCounters ?? 0) + 1;
        state.turn.lastAdvancementTargetId = action.cardId;
        log(
          state,
          `Place 1 advancement on ${target.title} → ${target.advancementCounters}.`,
        );
      }
      if (action.remaining <= 0) return { ok: true };
      return applyPrimitive(ctx, {
        kind: "turn_begin_continue",
        remaining: action.remaining,
        used: action.used,
        mustPick: action.mustPick,
      });
    }

case "place_advancements_on_up_to": {
      const amountEach = Math.max(0, action.amountEach);
      const maxCards = Math.max(0, action.maxCards);
      if (amountEach <= 0 || maxCards <= 0) {
        log(state, `Place advancements on up to — nothing to place.`);
        return { ok: true };
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) {
            candidates.push(id);
          }
        }
      }
      if (candidates.length === 0) {
        log(state, `Place advancements on up to ${maxCards} — no eligible cards.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "adv-up-to-done",
            label: "Done placing advancements",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...candidates.map((id) => ({
            id: `adv-up-to:${id}`,
            label: `Place ${amountEach} advancement(s) on ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "place_advancements_on_up_to_continue" as const,
                cardId: id,
                amountEach,
                remainingAfter: maxCards - 1,
                exclude: [id],
              },
            },
          })),
        ],
logLine: `Place ${amountEach} advancement(s) on each of up to ${maxCards} card(s).`,
});
      return { ok: true };
    }

case "place_advancements_on_up_to_continue": {
      // Internal follow-up for place_advancements_on_up_to (not in card IR).
      const target = state.cards[action.cardId];
      if (target) {
        target.advancementCounters =
          (target.advancementCounters ?? 0) + action.amountEach;
        state.turn.lastAdvancementTargetId = action.cardId;
        log(
          state,
          `Place ${action.amountEach} advancement(s) on ${target.title} → ${target.advancementCounters}.`,
        );
      }
      if (action.remainingAfter <= 0) return { ok: true };
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (action.exclude.includes(id)) continue;
          const c = state.cards[id];
          if (c && (c.type === "agenda" || c.canAdvance)) candidates.push(id);
        }
      }
      if (candidates.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "adv-up-to-done",
            label: "Done placing advancements",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
          ...candidates.map((id) => ({
            id: `adv-up-to:${id}`,
            label: `Place ${action.amountEach} advancement(s) on ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "place_advancements_on_up_to_continue" as const,
                cardId: id,
                amountEach: action.amountEach,
                remainingAfter: action.remainingAfter - 1,
                exclude: [...action.exclude, id],
              },
            },
          })),
        ],
      });
      return { ok: true };
    }

case "may_place_up_to_advancements_on_remote_root_then_access_unless_pay": {
      const maxAdv = Math.max(0, action.maxAdvancements);
      const credits = Math.max(0, action.credits);
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        for (const id of server.root) targets.push(id);
      }
      if (targets.length === 0 || maxAdv <= 0) {
        log(state, `${source.title} — no remote-root card to advance.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "decline-otoroshi",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ];
      for (const cardId of targets) {
        const title = state.cards[cardId]!.title;
        for (let n = 1; n <= maxAdv; n++) {
          options.push({
            id: `otoroshi:${cardId}:${n}`,
            label: `Place ${n} advancement(s) on ${title}`,
            effect: {
              op: "do",
              action: {
                kind: "place_advancements_then_access_unless_pay",
                cardId,
                amount: n,
                credits,
              },
            },
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options,
logLine: `${source.title} — may place up to ${maxAdv} advancements, then Runner accesses unless pays ${credits}¢.`,
});
      return { ok: true };
    }

case "place_advancements_then_access_unless_pay": {
      const placeR = applyPrimitive(ctx, {
        kind: "place_advancements_on",
        cardId: action.cardId,
        amount: action.amount,
      });
      if (!placeR.ok) return placeR;
      const credits = Math.max(0, action.credits);
      const title = state.cards[action.cardId]?.title ?? action.cardId;
      if (credits > 0 && state.runner.credits >= credits) {
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: "pay-avoid-access",
              label: `Pay ${credits}¢ (avoid access)`,
              effect: {
                op: "do",
                action: {
                  kind: "lose_credits",
                  side: "runner",
                  amount: credits,
                },
              },
            },
            {
              id: "access-card",
              label: `Access ${title}`,
              effect: {
                op: "do",
                action: {
                  kind: "access_installed_card",
                  cardId: action.cardId,
                },
              },
            },
          ],
logLine: `Runner accesses ${title} unless they pay ${credits}¢.`,
});
        return { ok: true };
      }
      return applyPrimitive(ctx, {
        kind: "access_installed_card",
        cardId: action.cardId,
      });
    }
    default:
      return null;
  }
}
