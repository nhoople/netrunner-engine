/**
 * Power, virus, and agenda counters. Formulas that derive a count
 * from another number stay in eval.ts.
 */
import { log } from "../state/createGame.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import {
  maybeFirePowerCountersGte,
  syncEtrPerPowerCounterSubs,
} from "../state/powerCounters.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { purgeVirusCounters } from "../state/trashHooks.js";
import { CR } from "../timing/labels.js";
import { maybeTrashHostsAtStrengthLte } from "./corpTrash.js";
import { evalEffect, type EffectCtx, type EvalResult } from "./eval.js";
import type { Primitive } from "./ir.js";

export function applyCounterPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "add_virus_counter": {
      source.virusCounters = (source.virusCounters ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount} virus counter(s) on ${source.title} → ${source.virusCounters}.`,
      );
      if (source.type === "program") {
        if (!state.turn.programsWithVirusPlacedThisTurn.includes(sourceId)) {
          state.turn.programsWithVirusPlacedThisTurn.push(sourceId);
        }
      }
      if (source.recurringCreditsMaxEqualsVirusCounters) {
        source.recurringCreditsMax = source.virusCounters ?? 0;
      }
      // Tranquilizer: at threshold, derez host ice.
      const threshold = source.derezHostAtVirus;
      if (
        threshold !== undefined &&
        (source.virusCounters ?? 0) >= threshold &&
        source.hostId
      ) {
        const host = state.cards[source.hostId];
        if (host?.type === "ice" && host.rezzed) {
          host.rezzed = false;
          log(
            state,
            `${source.title} derezzes host ${host.title} (${source.virusCounters} virus).`,
          );
        }
      }
      // Trypano: at threshold, trash host ice.
      const trashAt = source.trashHostAtVirus;
      if (
        trashAt !== undefined &&
        (source.virusCounters ?? 0) >= trashAt &&
        source.hostId
      ) {
        const hostId = source.hostId;
        const host = state.cards[hostId];
        if (host?.type === "ice") {
          log(
            state,
            `${source.title} trashes host ${host.title} (${source.virusCounters} virus).`,
          );
          // Move ice to Archives (faceup).
          for (const server of Object.values(state.servers)) {
            const i = server.ice.indexOf(hostId);
            if (i >= 0) server.ice.splice(i, 1);
          }
          host.zone = "corp:archives";
          host.faceup = true;
          host.rezzed = false;
          state.corp.discard.push(hostId);
          // Hosted programs go to heap with ice trash — leave to trash hooks if present.
        }
      }
      maybeTrashHostsAtStrengthLte(state);
      return { ok: true };
    }
    case "purge_virus_counters": {
      purgeVirusCounters(state, sourceId);
      return { ok: true };
    }
    case "add_agenda_counter": {
      source.agendaCounters = (source.agendaCounters ?? 0) + action.amount;
      log(
        state,
        `Add ${action.amount} agenda counter(s) to ${source.title} → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "remove_agenda_counters": {
      const have = source.agendaCounters ?? 0;
      const removed = Math.min(action.amount, have);
      source.agendaCounters = have - removed;
      log(
        state,
        `Remove ${removed} agenda counter(s) from ${source.title} → ${source.agendaCounters}.`,
      );
      return { ok: true };
    }
    case "remove_power_counter": {
      const have = source.powerCounters ?? 0;
      const rem = Math.min(action.amount, have);
      source.powerCounters = have - rem;
      log(
        state,
        `Remove ${rem} power counter(s) from ${source.title} → ${source.powerCounters}.`,
      );
      syncEtrPerPowerCounterSubs(source);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      if (
        source.trashWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        if (source.onPowerCountersEmpty) {
          const r = evalEffect(
            { state, sourceId },
            source.onPowerCountersEmpty,
          );
          if (!r.ok) {
            log(
              state,
              `onPowerCountersEmpty failed on ${source.title}: ${r.error}`,
            );
          }
        }
        removeCardFromCurrentZone(state, sourceId);
        if (source.side === "runner") {
          state.runner.discard.push(sourceId);
          source.zone = "runner:heap";
        } else {
          state.corp.discard.push(sourceId);
          source.zone = "corp:archives";
        }
        source.faceup = true;
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
        recomputeRunnerMaxHandSize(state);
      } else if (
        source.rfgWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        removeCardFromCurrentZone(state, sourceId);
        source.zone = "removed-from-game";
        source.faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(sourceId)) {
          state.removedFromGame.push(sourceId);
        }
        log(
          state,
          `${source.title} removed from the game — power counters empty.`,
        );
        recomputeRunnerMaxHandSize(state);
      } else if (
        source.scoreWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        const pts = source.scoreWhenPowerEmpty.agendaPoints;
        return evalEffect(ctx, {
          op: "do",
          action: {
            kind: "add_to_corp_score_as_agenda",
            agendaPoints: pts,
          },
        });
      }
      return { ok: true };
    }
    case "remove_all_power_counters": {
      const have = source.powerCounters ?? 0;
      source.powerCounters = 0;
      log(
        state,
        `Remove all ${have} power counter(s) from ${source.title}.`,
      );
      syncEtrPerPowerCounterSubs(source);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      if (source.trashWhenPowerEmpty && have > 0) {
        removeCardFromCurrentZone(state, sourceId);
        if (source.side === "runner") {
          state.runner.discard.push(sourceId);
          source.zone = "runner:heap";
        } else {
          state.corp.discard.push(sourceId);
          source.zone = "corp:archives";
        }
        source.faceup = true;
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
        recomputeRunnerMaxHandSize(state);
      } else if (source.rfgWhenPowerEmpty && have > 0) {
        removeCardFromCurrentZone(state, sourceId);
        source.zone = "removed-from-game";
        source.faceup = true;
        if (!state.removedFromGame) state.removedFromGame = [];
        if (!state.removedFromGame.includes(sourceId)) {
          state.removedFromGame.push(sourceId);
        }
        log(
          state,
          `${source.title} removed from the game — power counters empty.`,
        );
        recomputeRunnerMaxHandSize(state);
      }
      return { ok: true };
    }
case "add_power_counter": {
      source.powerCounters = (source.powerCounters ?? 0) + action.amount;
      log(
        state,
        `Place ${action.amount} power counter(s) on ${source.title} → ${source.powerCounters}.`,
      );
      syncEtrPerPowerCounterSubs(source);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      maybeFirePowerCountersGte(state, sourceId);
      return { ok: true };
    }
    default:
      return null;
  }
}
