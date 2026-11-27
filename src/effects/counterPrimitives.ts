/**
 * Power, virus, and agenda counters. Formulas that derive a count
 * from another number stay in eval.ts.
 */
import { abilitiesSuppressed } from "../state/continuous/abilities.js";
import { log } from "../state/createGame.js";
import { recomputeRunnerMaxHandSize } from "../state/continuous/handSize.js";
import {
  maybeFirePowerCountersGte,
  syncEtrPerPowerCounterSubs,
} from "../state/counters/powerCounters.js";
import { purgeVirusCounters } from "../state/hostingAndTrash/trashHooks.js";
import { CR } from "../timing/labels.js";
import { evalEffect, type EffectCtx, type EvalResult } from "./eval.js";
import type { Primitive } from "./ir.js";
import { fireOnPowerCountersEmpty } from "../state/triggers/miscConditionalHooks.js";
import { trashCard } from "../state/hostingAndTrash/trash.js";
import { removeCardFromGame } from "../state/uninstallAndPosition/uninstall.js";

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
      if (
        source.recurringCreditsMaxEqualsVirusCounters &&
        !abilitiesSuppressed(state, sourceId)
      ) {
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
      // Trypano's and Parasite's static conditions are checked at the next
      // checkpoint (CR 9.6.7a).
      return { ok: true };
    }
    case "purge_virus_counters": {
      purgeVirusCounters(state, sourceId);
      return { ok: true };
    }
    case "add_agenda_counter": {
      // Titan Transnational: "place 1 agenda counter on it", the agenda
      // just scored, not the identity (CR 1.2.1).
      const agendaId = action.onTriggerAgenda
        ? state.turn.lastScoredOrStolenAgendaId
        : sourceId;
      const target = agendaId ? state.cards[agendaId] : undefined;
      if (!target) return { ok: true };
      target.agendaCounters = (target.agendaCounters ?? 0) + action.amount;
      log(
        state,
        `Add ${action.amount} agenda counter(s) to ${target.title} → ${target.agendaCounters}.`,
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
      if (source.strengthPerPowerCounter && rem > 0) {
        log(
          state,
          `${source.title}'s static strength ends with the removed power counter (CR ${CR.staticNoLingering.number}).`,
        );
      }
      syncEtrPerPowerCounterSubs(source, state);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      if (source.trashWhenPowerEmpty && (source.powerCounters ?? 0) <= 0) {
        if (source.onPowerCountersEmpty) {
          fireOnPowerCountersEmpty(state, sourceId);
        }
        // Its own ability trashes it (CR 1.14.5).
        trashCard(state, sourceId, { by: source.side });
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
        recomputeRunnerMaxHandSize(state);
      } else if (source.rfgWhenPowerEmpty && (source.powerCounters ?? 0) <= 0) {
        removeCardFromGame(state, sourceId);
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
      log(state, `Remove all ${have} power counter(s) from ${source.title}.`);
      syncEtrPerPowerCounterSubs(source, state);
      if (
        source.handSizePerPowerCounter ||
        source.runnerHandSizePenaltyPerPowerCounter
      ) {
        recomputeRunnerMaxHandSize(state);
      }
      if (source.trashWhenPowerEmpty && have > 0) {
        // Its own ability trashes it (CR 1.14.5).
        trashCard(state, sourceId, { by: source.side });
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
        recomputeRunnerMaxHandSize(state);
      } else if (source.rfgWhenPowerEmpty && have > 0) {
        removeCardFromGame(state, sourceId);
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
      syncEtrPerPowerCounterSubs(source, state);
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
