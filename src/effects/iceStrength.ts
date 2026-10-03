/**
 * Breaker and ice strength. Encounter math moved out of eval.ts.
 */
import { scoredAgendaBreakerPenaltyIfIceDerezzed } from "../state/breakerMods.js";
import { allIceStrengthBonusFromLockdowns } from "../state/lockdowns.js";
import { agendaPointsFor } from "../state/scoring.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import type { GameState } from "../state/types.js";

export function breakerStrength(state: GameState, breakerId: string): number {
  const card = state.cards[breakerId];
  let base = card.breaker?.strength ?? card.strength ?? 0;
  if (card.strengthBonusPerIcebreaker) {
    const n = state.runner.rig.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    base += card.strengthBonusPerIcebreaker * n;
  }
  if (typeof card.strengthBonusPerInstalledProgram === "number") {
    const n = state.runner.rig.filter(
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
    const n = state.runner.discard.filter((id) =>
      (state.cards[id]?.subtypes ?? []).some((s) => s.toLowerCase() === sub),
    ).length;
    base += card.strengthBonusPerHeapSubtype.bonus * n;
  }
  if (card.strengthBonusPerCoreDamageThisGame) {
    base += card.strengthBonusPerCoreDamageThisGame * state.runner.brainDamage;
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
  // Dinosaurus-class: host grants strength to the hosted icebreaker.
  if (card.hostId) {
    const host = state.cards[card.hostId];
    if (host?.hostNonAiIcebreaker && host.hostIcebreakerStrengthBonus) {
      base += host.hostIcebreakerStrengthBonus;
    }
  }
  // GAMEDRAGON-class: hardware hosted on the breaker grants strength.
  for (const id of state.runner.rig) {
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

/** Trojan host / same-server strength mods (Monkeywrench / Chisel). */
function trojanIceStrengthModifier(state: GameState, iceId: string): number {
  let mod = 0;
  let serverIce: string[] | null = null;
  for (const server of Object.values(state.servers)) {
    if (server.ice.includes(iceId)) {
      serverIce = server.ice;
      break;
    }
  }
  for (const id of state.runner.rig) {
    const trojan = state.cards[id];
    if (!trojan?.hostId) continue;
    if (trojan.hostId === iceId) {
      if (trojan.hostStrengthModifier) {
        mod += trojan.hostStrengthModifier;
      }
      if (typeof trojan.hostStrengthPerVirusCounter === "number") {
        mod +=
          (trojan.virusCounters ?? 0) * trojan.hostStrengthPerVirusCounter;
      }
      if (typeof trojan.hostStrengthPerPowerCounter === "number") {
        mod +=
          (trojan.powerCounters ?? 0) * trojan.hostStrengthPerPowerCounter;
      }
    } else if (
      serverIce &&
      trojan.otherIceProtectingServerStrengthModifier &&
      serverIce.includes(trojan.hostId) &&
      trojan.hostId !== iceId
    ) {
      mod += trojan.otherIceProtectingServerStrengthModifier;
    }
  }
  return mod;
}

/** Rime-class: rezzed ice on the same server grants strength to all ice there. */
function sameServerIceStrengthBonus(state: GameState, iceId: string): number {
  let bonus = 0;
  for (const server of Object.values(state.servers)) {
    if (!server.ice.includes(iceId)) continue;
    for (const id of server.ice) {
      const ice = state.cards[id];
      if (!ice?.rezzed || !ice.sameServerIceStrengthBonus) continue;
      bonus += ice.sameServerIceStrengthBonus;
    }
    break;
  }
  return bonus;
}

/** Experiential Data-class: rezzed root upgrades buff ice protecting their server. */
function rootUpgradeIceStrengthBonus(state: GameState, iceId: string): number {
  let bonus = 0;
  for (const server of Object.values(state.servers)) {
    if (!server.ice.includes(iceId)) continue;
    for (const id of server.root) {
      const up = state.cards[id];
      if (!up?.rezzed) continue;
      bonus += up.iceProtectingThisServerStrengthBonus ?? 0;
    }
    break;
  }
  return bonus;
}

export function iceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  let base = card.strength ?? 0;
  if (card.strengthBonusPerIcebreaker) {
    const n = state.runner.rig.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    base += card.strengthBonusPerIcebreaker * n;
  }
  if (typeof card.strengthPerVirusCounter === "number") {
    base += (card.virusCounters ?? 0) * card.strengthPerVirusCounter;
  }
  if (card.strengthBonusIfInstalledSubtype) {
    const { subtype, bonus } = card.strengthBonusIfInstalledSubtype;
    const sub = subtype.toLowerCase();
    const has = state.runner.rig.some((id) =>
      (state.cards[id]?.subtypes ?? []).some((s) => s.toLowerCase() === sub),
    );
    if (has) base += bonus;
  }
  if (card.strengthBonusPerRezzedIceWithSubtype) {
    const { subtype, bonus: perBonus } =
      card.strengthBonusPerRezzedIceWithSubtype;
    let count = 0;
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        const ice = state.cards[id];
        if (ice?.rezzed && (ice.subtypes ?? []).includes(subtype)) {
          count += 1;
        }
      }
    }
    base += count * perBonus;
  }
  if (card.strengthBonusPerIceProtectingThisServer) {
    for (const server of Object.values(state.servers)) {
      if (!server.ice.includes(iceId)) continue;
      base +=
        server.ice.length * card.strengthBonusPerIceProtectingThisServer;
      break;
    }
  }
  if (state.run?.helheimServerStrengthBonus) {
    for (const [sid, server] of Object.entries(state.servers)) {
      if (!server.ice.includes(iceId)) continue;
      base +=
        state.run.helheimServerStrengthBonus[
          sid as import("../state/types.js").ServerId
        ] ?? 0;
      break;
    }
  }
  let penalty = 0;
  for (const id of state.runner.rig) {
    penalty += state.cards[id]?.allIceStrengthPenalty ?? 0;
  }
  let subtypeBonus = 0;
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.iceStrengthBonusForSubtype) {
    const { subtype, bonus: b } = idCard.iceStrengthBonusForSubtype;
    if ((card.subtypes ?? []).includes(subtype)) subtypeBonus += b;
  }
  for (const server of Object.values(state.servers)) {
    for (const rid of [...server.root, ...server.ice]) {
      const src = state.cards[rid];
      if (!src?.rezzed || !src.iceStrengthBonusForSubtype) continue;
      const { subtype, bonus: b } = src.iceStrengthBonusForSubtype;
      if ((card.subtypes ?? []).includes(subtype)) subtypeBonus += b;
    }
  }
  let sandburgBonus = 0;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const src = state.cards[rid];
      const spec = src?.rezzed
        ? src.iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte
        : undefined;
      if (!spec) continue;
      if (state.corp.credits < spec.threshold) continue;
      sandburgBonus +=
        Math.floor(state.corp.credits / spec.perCredits) * spec.bonus;
    }
  }
  const bonus = allIceStrengthBonusFromLockdowns(state);
  return (
    base +
    trojanIceStrengthModifier(state, iceId) +
    sameServerIceStrengthBonus(state, iceId) +
    rootUpgradeIceStrengthBonus(state, iceId) +
    (state.run?.iceStrengthBoosts?.[iceId] ?? 0) +
    bonus -
    penalty +
    subtypeBonus +
    sandburgBonus
  );
}
