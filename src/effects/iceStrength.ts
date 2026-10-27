/**
 * Breaker and ice strength. Ice strength is the shared CR 9.12.1a path in
 * `effectiveIceStrength` (stubs); this module keeps breaker strength and
 * re-exports ice strength for eval / trash callers.
 */
import { syncHostDurationReplacements } from "../state/hostDuration.js";
import { scoredAgendaBreakerPenaltyIfIceDerezzed } from "../state/breakerMods.js";
import { agendaPointsFor } from "../state/scoring.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import type { GameState } from "../state/types.js";
import { effectiveIceStrength } from "../cards/stubs.js";

export function breakerStrength(state: GameState, breakerId: string): number {
  syncHostDurationReplacements(state);
  const card = state.cards[breakerId];
  let base = card.breaker?.strength ?? card.strength ?? 0;
  if (card.strengthBonusPerIcebreaker) {
    const n = state.runner.installed.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    base += card.strengthBonusPerIcebreaker * n;
  }
  if (typeof card.strengthBonusPerInstalledProgram === "number") {
    const n = state.runner.installed.filter(
      (id) => state.cards[id]?.type === "program",
    ).length;
    base += card.strengthBonusPerInstalledProgram * n;
  }
  if (
    typeof card.strengthBonusPerIceProtectingAttackedServerDuringRun ===
      "number" &&
    state.run?.attackedServerId
  ) {
    const iceCount =
      state.servers[state.run.attackedServerId]?.ice.length ?? 0;
    base +=
      card.strengthBonusPerIceProtectingAttackedServerDuringRun * iceCount;
  }
  if (card.strengthBonusPerHeapSubtype) {
    const sub = card.strengthBonusPerHeapSubtype.subtype.toLowerCase();
    const n = state.runner.discardPile.filter((id) =>
      (state.cards[id]?.subtypes ?? []).some((s) => s.toLowerCase() === sub),
    ).length;
    base += card.strengthBonusPerHeapSubtype.bonus * n;
  }
  if (card.strengthBonusPerCoreDamageThisGame) {
    base += card.strengthBonusPerCoreDamageThisGame * state.runner.coreDamage;
  }
  if (typeof card.strengthPenaltyPerGripCard === "number") {
    base -= card.strengthPenaltyPerGripCard * state.runner.hand.length;
  }
  if (card.strengthPerPowerCounter) {
    base += card.powerCounters ?? 0;
  }
  if (typeof card.strengthBonusPerUnusedMu === "number") {
    base +=
      card.strengthBonusPerUnusedMu *
      Math.max(0, memoryLimit(state) - usedMemory(state));
  }
  if (card.threatStrengthBonus) {
    const corpPts = agendaPointsFor(state, "corp");
    const runnerPts = agendaPointsFor(state, "runner");
    if (Math.max(corpPts, runnerPts) >= card.threatStrengthBonus.level) {
      base += card.threatStrengthBonus.amount;
    }
  }
  base += state.turn.breakerStrengthBoostsThisTurn[breakerId] ?? 0;
  base += state.turn.checkpointBreakerBoosts?.[breakerId] ?? 0;
  // Dinosaurus-class: host grants strength to the hosted icebreaker.
  if (card.hostId) {
    const host = state.cards[card.hostId];
    if (host?.hostNonAiIcebreaker && host.hostIcebreakerStrengthBonus) {
      base += host.hostIcebreakerStrengthBonus;
    }
  }
  // GAMEDRAGON-class: hardware hosted on the breaker grants strength.
  for (const id of state.runner.installed) {
    const mod = state.cards[id];
    if (mod?.hostId === breakerId && mod.hostIcebreakerStrengthBonus) {
      base += mod.hostIcebreakerStrengthBonus;
    }
  }
  const runBoost = state.run?.strengthBoosts[breakerId] ?? 0;
  const encBoost = state.run?.encounterStrengthBoosts[breakerId] ?? 0;
  const stegodon = scoredAgendaBreakerPenaltyIfIceDerezzed(state);
  return base + runBoost + encBoost - stegodon;
}

/** Shared ice strength (CR 9.12.1a). */
export function iceStrength(state: GameState, iceId: string): number {
  return effectiveIceStrength(state, iceId);
}
