import { effectiveCorpMaxHandSize } from "../../state/continuous/handSize.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { autoResolveTrace } from "../../state/turnAndActions/trace.js";
import { memoryLimit, usedMemory } from "../../state/turnAndActions/turn.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import { evalEffect, grantAbilityCredits, type EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { noteCorpSpentAgendaCounters } from "../../state/keywordsAndCredits/costs.js";
import { dealDamage } from "../../state/damageAndPrevention/damage.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function serverIdForCard(
  state: EffectCtx["state"],
  cardId: string,
): ServerId | null {
  const zone = state.cards[cardId]?.zone ?? "";
  if (!zone.startsWith("server:")) return null;
  const parts = zone.split(":");
  return (parts[1] as ServerId) ?? null;
}

function installedIceIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) out.push(id);
  }
  return out;
}

function advanceableInstalled(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (c?.side === "corp" && c.canAdvance) out.push(id);
    }
  }
  return out;
}

export function applyOacPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "firmware_place_advancement_on_advanceable_ice": {
      const cands = installedIceIds(state).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (cands.length === 0) {
        log(state, `Firmware Updates — no advanceable ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `fw:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "gain_credits_equal_to_runner_credits": {
      const n = state.runner.credits;
      return grantAbilityCredits(ctx, "corp", n);
    }

    case "move_constellation_advancement_between_ice": {
      const from = installedIceIds(state).filter(
        (id) => (state.cards[id]?.advancementCounters ?? 0) > 0,
      );
      const to = installedIceIds(state).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (from.length === 0 || to.length === 0) {
        log(state, `Constellation Protocol — no valid ice.`);
        return { ok: true };
      }
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const a of from) {
        for (const b of to) {
          if (a === b) continue;
          opts.push({
            id: `const:${a}:${b}`,
            label: `Move advancement ${state.cards[a]!.title} → ${state.cards[b]!.title}`,
            effect: fx.do({
              kind: "move_constellation_apply",
              fromId: a,
              toId: b,
            }),
          });
        }
      }
      if (opts.length === 0) {
        log(state, `Constellation Protocol — no distinct targets.`);
        return { ok: true };
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options: opts });
      return { ok: true };
    }

    case "move_constellation_apply": {
      const fromId = (action as { fromId: string }).fromId;
      const toId = (action as { toId: string }).toId;
      const from = state.cards[fromId];
      const to = state.cards[toId];
      if (!from || !to || (from.advancementCounters ?? 0) < 1) {
        return { ok: false, error: "Constellation move invalid.", cites: [] };
      }
      from.advancementCounters = (from.advancementCounters ?? 0) - 1;
      to.advancementCounters = (to.advancementCounters ?? 0) + 1;
      log(
        state,
        `Constellation Protocol — move advancement ${from.title} → ${to.title}.`,
      );
      return { ok: true };
    }

    case "mark_yale_spend_any_agenda_counter_gain_2": {
      const cands = [
        ...state.corp.scoreArea,
        ...Object.values(state.cards)
          .filter(
            (c) =>
              c.side === "corp" &&
              (c.agendaCounters ?? 0) > 0 &&
              c.zone.startsWith("server:"),
          )
          .map((c) => c.id),
      ].filter((id) => (state.cards[id]?.agendaCounters ?? 0) > 0);
      if (cands.length === 0) {
        log(state, `Mark Yale — no agenda counters.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `yale:${id}`,
          label: `Spend agenda counter on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "mark_yale_spend_counter_on", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "mark_yale_spend_counter_on": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || (card.agendaCounters ?? 0) < 1) {
        return { ok: false, error: "No agenda counter to spend.", cites: [] };
      }
      card.agendaCounters = (card.agendaCounters ?? 0) - 1;
      state.corp.credits += 2;
      noteCorpSpentAgendaCounters(state, 1);
      log(state, `Mark Yale — spend agenda counter on ${card.title}; gain 2¢.`);
      return { ok: true };
    }

    case "place_advancement_on_advanceable_installed": {
      const cands = advanceableInstalled(state);
      if (cands.length === 0) {
        log(state, `Space Camp — no advanceable installed card.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `sc:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_advancement_on_advanceable_ice_protecting_this_server": {
      const sid = serverIdForCard(state, sourceId);
      if (!sid) return { ok: true };
      const cands = (state.servers[sid]?.ice ?? []).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (cands.length === 0) {
        log(state, `Builder — no advanceable ice on this server.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `badv:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "trace_strength_equal_source_advancements": {
      const strength = source?.advancementCounters ?? 0;
      const onSuccess =
        (action as { onSuccess?: Effect }).onSuccess ??
        fx.gainCredits("corp", 0);
      const r = autoResolveTrace(state, sourceId, strength, onSuccess);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }

    case "twins_apply_reencounter": {
      const trashId = (action as { trashId: string }).trashId;
      const iceId = (action as { iceId: string }).iceId;
      // Trash HQ copy to Archives (reveal implied).
      const card = state.cards[trashId];
      if (card) {
        // "Reveal and trash": revealed, so faceup (CR 1.21.6, 4.4.6b).
        trashCard(state, trashId, { by: "corp", faceup: true });
        log(state, `The Twins — trash ${card.title} from HQ.`);
      }
      if (state.run) {
        state.run.reencounterIceId = iceId;
        log(
          state,
          `The Twins — force re-encounter of ${state.cards[iceId]?.title} (CR ${CR.forcedEncounterDuringRun.number}).`,
        );
      }
      return { ok: true };
    }

    case "draw_if_hq_full": {
      const max = effectiveCorpMaxHandSize(state);
      if (state.corp.hand.length === max) {
        // Vigil: a draw, through the draw procedure (CR 8.4.5).
        log(state, `Vigil — HQ is at the Corp's maximum hand size; draw 1.`);
        return evalEffect(ctx, fx.draw("runner", 1));
      }
      return { ok: true };
    }

    case "gain_credits_equal_to_agenda_points_of_trigger": {
      const agendaId = (state.turn as { lastScoredOrStolenAgendaId?: string })
        .lastScoredOrStolenAgendaId;
      const pts = agendaId ? (state.cards[agendaId]?.agendaPoints ?? 0) : 0;
      return grantAbilityCredits(ctx, "runner", pts);
    }

    case "stim_dealer_turn_begin": {
      const power = source?.powerCounters ?? 0;
      if (power >= 2) {
        source!.powerCounters = 0;
        dealDamage(state, "core", 1, sourceId, { cannotPrevent: true });
        log(state, `Stim Dealer — remove power; suffer 1 unpreventable core.`);
      } else {
        source!.powerCounters = power + 1;
        state.runner.clicks += 1;
        log(state, `Stim Dealer — place power; gain [click].`);
      }
      return { ok: true };
    }

    case "move_counter": {
      if ((source?.virusCounters ?? 0) < 1) {
        log(state, `Virus Breeding Ground — no virus counters.`);
        return { ok: true };
      }
      const cands = state.runner.installed.filter(
        (id) => id !== sourceId && (state.cards[id]?.virusCounters ?? 0) >= 1,
      );
      if (cands.length === 0) {
        log(state, `Virus Breeding Ground — no other card with virus.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `vbg:${id}`,
          label: `Move virus to ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "move_vbg_apply", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "move_vbg_apply": {
      const cardId = (action as { cardId: string }).cardId;
      if ((source?.virusCounters ?? 0) < 1) {
        return { ok: false, error: "No virus to move.", cites: [] };
      }
      source!.virusCounters = (source!.virusCounters ?? 0) - 1;
      const t = state.cards[cardId]!;
      t.virusCounters = (t.virusCounters ?? 0) + 1;
      log(state, `Virus Breeding Ground — move virus to ${t.title}.`);
      return { ok: true };
    }

    case "lose_qianju_click_prevent_tag_until_next_turn": {
      if (state.runner.clicks < 1) {
        log(state, `Qianju PT — no click to lose.`);
        return { ok: true };
      }
      state.runner.clicks -= 1;
      (
        state.runner as { qianjuPreventTagUntilNextTurn?: boolean }
      ).qianjuPreventTagUntilNextTurn = true;
      log(state, `Qianju PT — lose [click]; prevent 1 tag until next turn.`);
      return { ok: true };
    }

    case "gain_if_unused_mu_gte": {
      const threshold = (action as { threshold: number }).threshold;
      const amount = (action as { amount: number }).amount;
      const unused = memoryLimit(state) - usedMemory(state);
      if (unused >= threshold) {
        state.runner.credits += amount;
        log(state, `Data Folding — gain ${amount}¢ (${unused} unused MU).`);
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
