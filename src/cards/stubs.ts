/**
 * Card runtime helpers — definitions live in vendored `vendor/cards-data/`.
 * Applies defs onto instances and computes effective strengths for demos/tests.
 */
import type { Effect } from "../effects/ir.js";
import type {
  BreakerAbility,
  CardInstance,
  GameState,
  PaidAbility,
  PaidAbilityWindow,
  ServerId,
  Subroutine,
} from "../state/types.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { scoredAgendaBreakerPenaltyIfIceDerezzed } from "../state/breakerMods.js";
import { scoredAgendaIceSubtypeStrengthBonus } from "../state/breakerMods.js";
import { resolveIceSubtypes } from "../state/continuousEffects.js";
import { allIceStrengthBonusFromCurrents } from "../state/currents.js";
import { log } from "../state/createGame.js";
import { syncHostDurationReplacements } from "../state/hostDuration.js";
import {
  hasLingeringBreakerStrength,
  lingeringBreakerStrengthBoost,
  lingeringIceStrengthBoost,
  LINGERING_KIND_ICE_STRENGTH,
  LINGERING_KIND_ICE_STRENGTH_ENCOUNTER,
} from "../state/lingeringEffects.js";
import { allIceStrengthBonusFromLockdowns } from "../state/lockdowns.js";
import { agendaPointsFor } from "../state/scoring.js";
import { runnerIsTagged } from "../state/tags.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import { applyCardDef, getCardDef, instantiateCard } from "./load.js";

/** Snapshot a card def for assertions (title, strength, abilities, …). */
export function cardExport(defId: string) {
  const def = getCardDef(defId);
  return {
    title: def.title,
    type: def.type,
    side: def.side,
    installCost: def.installCost ?? 0,
    rezCost: def.rezCost,
    strength: def.strength,
    subtypes: def.subtypes ? [...def.subtypes] : [],
    subroutines: (def.subroutines ?? []).map(
      (s): Subroutine => ({
        id: s.id,
        text: s.text,
        effect: structuredClone(s.effect) as Effect,
      }),
    ),
    breaker: def.breaker ? ({ ...def.breaker } as BreakerAbility) : undefined,
    paidAbilities: (def.paidAbilities ?? []).map(
      (a): PaidAbility => ({
        ...a,
        clickCost: a.clickCost ?? 0,
        creditCost: a.creditCost ?? 0,
        // Catalog already normalizes interrupt window ids (CR 9.2.9).
        windows: [...a.windows],
        effect: structuredClone(a.effect) as Effect,
      }),
    ),
    onRez: def.onRez ? (structuredClone(def.onRez) as Effect) : undefined,
    prevention: def.prevention ? { ...def.prevention } : undefined,
    strengthBonusProtectingRemote: def.strengthBonusProtectingRemote,
    strengthBonusProtectingArchives: def.strengthBonusProtectingArchives,
    strengthBonusProtectingRd: def.strengthBonusProtectingRd,
    strengthBonusProtectingHq: def.strengthBonusProtectingHq,
  };
}

/** Common demo ice ids from System Gateway / System Update 2021. */
export type DemoIceId =
  | "ice-wall"
  | "palisade"
  | "pharos"
  | "tithe"
  | "rototurret"
  | "hortum"
  | "eli-1-0";

export const ICE_WALL = () => cardExport("ice-wall");
export const PALISADE = () => cardExport("palisade");
export const PHAROS = () => cardExport("pharos");
export const TITHE = () => cardExport("tithe");
export const ROTOTURRET = () => cardExport("rototurret");
export const HORTUM = () => cardExport("hortum");
export const MARJANAH = () => cardExport("marjanah");
export const CLEAVER = () => cardExport("cleaver");
export const CORRODER = () => cardExport("corroder");

export function applyIceDef(
  card: CardInstance,
  which: DemoIceId | string = "ice-wall",
): void {
  applyCardDef(card, which);
}

export function applyBreakerDef(
  card: CardInstance,
  which = "marjanah",
): void {
  applyCardDef(card, which);
}

export function currentWindow(
  timingKey: string,
): PaidAbilityWindow | null {
  switch (timingKey) {
    case "run.approachPaw":
      return "approach_paw";
    case "run.approachServerPaw":
      return "approach_server_paw";
    case "run.encounterPaw":
      return "encounter_paw";
    case "corp.actionPaw":
    case "corp.drawPaw":
    case "corp.discardPaw":
      return "corp_action_paw";
    case "runner.actionPaw":
    case "runner.startPaw":
    case "runner.discardPaw":
      return "runner_action_paw";
    case "run.initiatePaw":
      return "run_initiate_paw";
    case "run.passIcePaw":
      return "run_movement_paw";
    case "run.afterMovePaw":
      return "run_after_move_paw";
    case "run.completeOtherPriorityWindows":
      return "other_priority_window";
    default:
      return null;
  }
}

/** CR 9.2.7d / 1.17.3: the Corp scores in a paid ability window marked (S). */
export function corpMayScore(timingKey: string): boolean {
  return timingKey === "corp.actionPaw" || timingKey === "corp.drawPaw";
}

/** CR 9.2.7c: the Corp rezzes an asset or upgrade in a window marked (R). */
export function corpMayRez(timingKey: string): boolean {
  switch (timingKey) {
    case "corp.actionPaw":
    case "corp.drawPaw":
    case "corp.discardPaw":
    case "runner.actionPaw":
    case "runner.startPaw":
    case "runner.discardPaw":
    case "run.approachPaw":
    case "run.approachServerPaw":
    case "run.initiatePaw":
    case "run.afterMovePaw":
      return true;
    default:
      return false;
  }
}

/**
 * Printed breaker strength + continuous / temporary modifiers (CR 3.9.4a /
 * 3.9.5b). Ordered as default → increases → decreases (CR 9.12.1a); no
 * breaker strength-set effects exist in the pinned corpus yet.
 */
export function effectiveBreakerStrength(
  state: GameState,
  breakerId: string,
): number {
  // Gebrselassie replacements sync before any strength read (CR 9.9.9a).
  syncHostDurationReplacements(state);
  const card = state.cards[breakerId];
  const printed = card.breaker?.strength ?? card.strength ?? 0;
  let increases = 0;
  let decreases = 0;
  // CR 9.12.1d: a blanked source's static ability is not applied.
  const selfOk = !abilitiesSuppressed(state, breakerId);
  if (selfOk && card.strengthBonusPerIcebreaker) {
    const n = state.runner.installed.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    increases += card.strengthBonusPerIcebreaker * n;
  }
  if (selfOk && typeof card.strengthBonusPerInstalledProgram === "number") {
    const n = state.runner.installed.filter(
      (id) => state.cards[id]?.type === "program",
    ).length;
    increases += card.strengthBonusPerInstalledProgram * n;
  }
  if (
    selfOk &&
    typeof card.strengthBonusPerIceProtectingAttackedServerDuringRun ===
      "number" &&
    state.run?.attackedServerId
  ) {
    const iceCount =
      state.servers[state.run.attackedServerId]?.ice.length ?? 0;
    increases +=
      card.strengthBonusPerIceProtectingAttackedServerDuringRun * iceCount;
  }
  if (selfOk && card.strengthBonusPerHeapSubtype) {
    const sub = card.strengthBonusPerHeapSubtype.subtype.toLowerCase();
    const n = state.runner.discardPile.filter((id) =>
      (state.cards[id]?.subtypes ?? []).some((s) => s.toLowerCase() === sub),
    ).length;
    increases += card.strengthBonusPerHeapSubtype.bonus * n;
  }
  if (selfOk && card.strengthBonusPerCoreDamageThisGame) {
    // Permanent core-damage counter = core damage taken this game (CR §10.4.2b).
    increases +=
      card.strengthBonusPerCoreDamageThisGame * state.runner.coreDamage;
  }
  // Cradle-class continuous lower (CR 9.12.1a decrease layer).
  if (selfOk && typeof card.strengthPenaltyPerGripCard === "number") {
    decreases += card.strengthPenaltyPerGripCard * state.runner.hand.length;
  }
  if (selfOk && card.strengthPerPowerCounter) {
    increases += card.powerCounters ?? 0;
  }
  if (selfOk && typeof card.strengthPerVirusCounter === "number") {
    increases += (card.virusCounters ?? 0) * card.strengthPerVirusCounter;
  }
  if (selfOk && typeof card.strengthBonusPerUnusedMu === "number") {
    increases +=
      card.strengthBonusPerUnusedMu *
      Math.max(0, memoryLimit(state) - usedMemory(state));
  }
  // Aura strength from other installed cards (K2CP Turbine).
  for (const id of state.runner.installed) {
    if (id === breakerId || abilitiesSuppressed(state, id)) continue;
    const aura = state.cards[id]?.giveStrengthToInstalledIcebreakers;
    if (!aura) continue;
    const isBreaker =
      Boolean(card.breaker) ||
      (card.subtypes ?? []).includes("icebreaker");
    if (!isBreaker) continue;
    if (
      aura.excludeSubtype &&
      (card.subtypes ?? []).includes(aura.excludeSubtype)
    ) {
      continue;
    }
    if (aura.amount >= 0) increases += aura.amount;
    else decreases += -aura.amount;
  }
  if (selfOk && card.threatStrengthBonus) {
    const corpPts = agendaPointsFor(state, "corp");
    const runnerPts = agendaPointsFor(state, "runner");
    if (Math.max(corpPts, runnerPts) >= card.threatStrengthBonus.level) {
      increases += card.threatStrengthBonus.amount;
    }
  }
  // Dinosaurus-class: host grants strength to the hosted icebreaker.
  if (card.hostId && !abilitiesSuppressed(state, card.hostId)) {
    const host = state.cards[card.hostId];
    if (host?.hostNonAiIcebreaker && host.hostIcebreakerStrengthBonus) {
      increases += host.hostIcebreakerStrengthBonus;
    }
  }
  // GAMEDRAGON-class: hardware hosted on the breaker grants strength.
  for (const id of state.runner.installed) {
    const mod = state.cards[id];
    if (
      mod?.hostId === breakerId &&
      mod.hostIcebreakerStrengthBonus &&
      !abilitiesSuppressed(state, id)
    ) {
      increases += mod.hostIcebreakerStrengthBonus;
    }
  }
  // Temporary boosts: lingerings when present, else map seeds (M2).
  const temp = hasLingeringBreakerStrength(state, breakerId)
    ? lingeringBreakerStrengthBoost(state, breakerId)
    : (state.turn.breakerStrengthBoostsThisTurn?.[breakerId] ?? 0) +
      (state.turn.checkpointBreakerBoosts?.[breakerId] ?? 0) +
      (state.run?.strengthBoosts?.[breakerId] ?? 0) +
      (state.run?.encounterStrengthBoosts?.[breakerId] ?? 0);
  if (temp >= 0) increases += temp;
  else decreases += -temp;
  // Stegodon-class scored-agenda lower.
  decreases += scoredAgendaBreakerPenaltyIfIceDerezzed(state);
  return printed + increases - decreases;
}

/** Server id when `iceId` is installed protecting that server, else null. */
export function serverIdForIce(
  state: GameState,
  iceId: string,
): ServerId | null {
  for (const [sid, server] of Object.entries(state.servers)) {
    if (server.ice.includes(iceId)) return sid as ServerId;
  }
  return null;
}

/** True when two ice protect the same server. */
export function iceShareServer(
  state: GameState,
  iceA: string,
  iceB: string,
): boolean {
  const sa = serverIdForIce(state, iceA);
  const sb = serverIdForIce(state, iceB);
  return sa !== null && sa === sb;
}

function rezzedRootUpgradesOnServer(
  state: GameState,
  serverId: ServerId,
): CardInstance[] {
  const server = state.servers[serverId];
  if (!server) return [];
  return server.root
    .map((id) => state.cards[id])
    .filter(
      (c) =>
        c &&
        c.rezzed &&
        (c.type === "upgrade" || c.type === "asset"),
    ) as CardInstance[];
}

/**
 * Rez cost reduction on ice from rezzed root upgrades on the same server
 * (Vovô Ozetti `iceRezCostReductionProtectingThisServer`). Blanked sources
 * do not apply (CR 9.12.1d).
 */
export function continuousIceRezCostReduction(
  state: GameState,
  iceId: string,
): number {
  const sid = serverIdForIce(state, iceId);
  if (!sid) return 0;
  let n = 0;
  for (const up of rezzedRootUpgradesOnServer(state, sid)) {
    if (abilitiesSuppressed(state, up.id)) continue;
    n += up.iceRezCostReductionProtectingThisServer ?? 0;
  }
  const ice = state.cards[iceId];
  if (ice && (ice.subtypes ?? []).includes("bioroid")) {
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const c = state.cards[id];
        if (!c?.rezzed || abilitiesSuppressed(state, id)) continue;
        const per = c.bioroidIceRezCostReductionPerRunnerClickRemaining ?? 0;
        if (per > 0) n += per * state.runner.clicks;
      }
    }
  }
  return n;
}

/**
 * Braintrust: sum ice rez discounts from agenda counters on scored agendas
 * (`iceRezCostReductionPerAgendaCounter` × `agendaCounters`). Blanked
 * agendas do not apply (CR 9.12.1d).
 */
export function iceRezCostReductionFromScoredAgendaCounters(
  state: GameState,
): number {
  let n = 0;
  for (const id of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    const per = card.iceRezCostReductionPerAgendaCounter ?? 0;
    if (per <= 0) continue;
    n += per * (card.agendaCounters ?? 0);
  }
  return n;
}

/**
 * Rez cost reduction for a root install from other rezzed upgrades on that
 * server while Threat is active (Vovô Ozetti). Blanked sources do not apply
 * (CR 9.12.1d).
 */
export function rootRezCostReduction(
  state: GameState,
  cardIdBeingRezzed: string,
): number {
  const card = state.cards[cardIdBeingRezzed];
  const zone = card?.zone ?? "";
  if (!zone.startsWith("server:") || !zone.endsWith(":root")) return 0;
  const serverId = zone.replace(/^server:/, "").replace(/:root$/, "") as ServerId;
  const corpPts = agendaPointsFor(state, "corp");
  const runnerPts = agendaPointsFor(state, "runner");
  const threat = Math.max(corpPts, runnerPts);
  let n = 0;
  for (const up of rezzedRootUpgradesOnServer(state, serverId)) {
    if (up.id === cardIdBeingRezzed) continue;
    if (abilitiesSuppressed(state, up.id)) continue;
    if ((up.rootRezCostReductionThisServer ?? 0) > 0) {
      n += up.rootRezCostReductionThisServer!;
    }
    const spec = up.rootRezCostReductionThisServerIfThreat;
    if (spec && threat >= spec.level) n += spec.amount;
  }
  return n;
}

/** Printed ice strength + encounter fortify boosts (CR 3.4.4). */
export function effectiveIceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  let base = card.strength ?? 0;
  // CR 9.12.1d: a blanked source's static ability is not applied. Ice-own
  // continuous strength fields gate on this; external sources check their own.
  const selfOk = !abilitiesSuppressed(state, iceId);
  if (selfOk && card.strengthPerCorpCardInHq) {
    base += state.corp.hand.length * card.strengthPerCorpCardInHq;
  }
  if (selfOk && card.strengthBonusPerRunnerTag) {
    base += card.strengthBonusPerRunnerTag * (state.runner.tags ?? 0);
  }
  if (selfOk && card.strengthBonusPerIcebreaker) {
    const n = state.runner.installed.filter(
      (id) =>
        Boolean(state.cards[id].breaker) ||
        (state.cards[id].subtypes ?? []).includes("icebreaker"),
    ).length;
    base += card.strengthBonusPerIcebreaker * n;
  }
  if (
    selfOk &&
    card.strengthBonusPerIceProtectingThisServer &&
    card.rezzed
  ) {
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
      base += state.run.helheimServerStrengthBonus[sid as ServerId] ?? 0;
      break;
    }
  }
  if (selfOk && card.strengthBonusProtectingRemote) {
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(iceId) && server.kind === "remote") {
        base += card.strengthBonusProtectingRemote;
        break;
      }
    }
  }
  if (selfOk && card.strengthBonusProtectingArchives) {
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(iceId) && server.id === "archives") {
        base += card.strengthBonusProtectingArchives;
        break;
      }
    }
  }
  if (selfOk && card.strengthBonusProtectingRd) {
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(iceId) && server.id === "rd") {
        base += card.strengthBonusProtectingRd;
        break;
      }
    }
  }
  if (selfOk && card.strengthBonusProtectingHq) {
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(iceId) && server.id === "hq") {
        base += card.strengthBonusProtectingHq;
        break;
      }
    }
  }
  if (selfOk && card.strengthBonusWhileTagged && runnerIsTagged(state)) {
    base += card.strengthBonusWhileTagged;
  }
  // Isaac Liberdade: advanced ice protecting this server gets +N from upgrades.
  {
    let serverId: string | null = null;
    for (const [sid, server] of Object.entries(state.servers)) {
      if (server.ice.includes(iceId)) {
        serverId = sid;
        break;
      }
    }
    if (serverId && (card.advancementCounters ?? 0) > 0) {
      const server = state.servers[serverId as keyof typeof state.servers];
      for (const upId of server?.root ?? []) {
        const up = state.cards[upId];
        if (!up?.rezzed || abilitiesSuppressed(state, upId)) continue;
        const n = up.advancedIceProtectingThisServerStrengthBonus ?? 0;
        if (n > 0) base += n;
      }
    }
    if (serverId) {
      const server = state.servers[serverId as keyof typeof state.servers];
      for (const upId of server?.root ?? []) {
        const up = state.cards[upId];
        if (!up?.rezzed || abilitiesSuppressed(state, upId)) continue;
        base += up.iceProtectingThisServerStrengthBonus ?? 0;
      }
    }
  }
  if (selfOk && card.strengthBonusAtAdvancements) {
    const { threshold, bonus } = card.strengthBonusAtAdvancements;
    if ((card.advancementCounters ?? 0) >= threshold) {
      base += bonus;
    }
  }
  if (selfOk && card.strengthPerAdvancement) {
    base += (card.advancementCounters ?? 0) * card.strengthPerAdvancement;
  }
  if (selfOk && typeof card.strengthPerVirusCounter === "number") {
    base += (card.virusCounters ?? 0) * card.strengthPerVirusCounter;
  }
  // Monkeywrench-class trojans: host / other-ice strength modifiers.
  {
    let serverIce: string[] | null = null;
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(iceId)) {
        serverIce = server.ice;
        break;
      }
    }
    for (const id of state.runner.installed) {
      const trojan = state.cards[id];
      if (!trojan?.hostId || abilitiesSuppressed(state, id)) continue;
      if (trojan.hostId === iceId) {
        if (trojan.hostStrengthModifier) {
          base += trojan.hostStrengthModifier;
        }
        if (typeof trojan.hostStrengthPerVirusCounter === "number") {
          base +=
            (trojan.virusCounters ?? 0) * trojan.hostStrengthPerVirusCounter;
        }
        if (typeof trojan.hostStrengthPerPowerCounter === "number") {
          base +=
            (trojan.powerCounters ?? 0) * trojan.hostStrengthPerPowerCounter;
        }
      } else if (
        serverIce &&
        trojan.otherIceProtectingServerStrengthModifier &&
        serverIce.includes(trojan.hostId) &&
        trojan.hostId !== iceId
      ) {
        base += trojan.otherIceProtectingServerStrengthModifier;
      }
    }
    if (serverIce) {
      for (const id of serverIce) {
        const ice = state.cards[id];
        if (
          !ice?.rezzed ||
          !ice.sameServerIceStrengthBonus ||
          abilitiesSuppressed(state, id)
        ) {
          continue;
        }
        base += ice.sameServerIceStrengthBonus;
      }
    }
  }
  if (selfOk && typeof card.strengthBonusIfOutermostOnServer === "number") {
    for (const server of Object.values(state.servers)) {
      if (server.ice[0] === iceId) {
        base += card.strengthBonusIfOutermostOnServer;
        break;
      }
    }
  }
  // Wraparound-class is a SET (printed+bonus while condition holds), not an
  // increase — applied in the CR 9.12.1a set layer below so Şifr can override
  // it without the bonus re-applying after the set (Wraparound UFAQ).
  let wraparoundSet: number | undefined;
  if (selfOk && card.strengthBonusIfNoInstalledSubtype) {
    const { subtype, bonus } = card.strengthBonusIfNoInstalledSubtype;
    const has = state.runner.installed.some((id) =>
      (state.cards[id].subtypes ?? []).includes(subtype),
    );
    if (!has) wraparoundSet = (card.strength ?? 0) + bonus;
  }
  if (selfOk && card.strengthBonusIfInstalledSubtype) {
    const { subtype, bonus } = card.strengthBonusIfInstalledSubtype;
    const has = state.runner.installed.some((id) =>
      (state.cards[id].subtypes ?? []).includes(subtype.toLowerCase()) ||
      (state.cards[id].subtypes ?? []).includes(subtype),
    );
    if (has) base += bonus;
  }
  if (selfOk && typeof card.strengthBonusIfSoleIceProtectingServer === "number") {
    for (const server of Object.values(state.servers)) {
      if (
        server.ice.includes(iceId) &&
        server.ice.length === 1
      ) {
        base += card.strengthBonusIfSoleIceProtectingServer;
        break;
      }
    }
  }
  if (
    selfOk &&
    typeof card.strengthBonusIfRezzedThisTurn === "number" &&
    (state.turn.rezzedThisTurnIds ?? []).includes(iceId)
  ) {
    base += card.strengthBonusIfRezzedThisTurn;
  }
  if (selfOk && card.strengthBonusPerRezzedIceWithSubtype) {
    const { subtype, bonus: perBonus } =
      card.strengthBonusPerRezzedIceWithSubtype;
    const want = subtype.toLowerCase();
    let count = 0;
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        const ice = state.cards[id];
        if (
          ice?.rezzed &&
          resolveIceSubtypes(state, id).some((t) => t.toLowerCase() === want)
        ) {
          count += 1;
        }
      }
    }
    base += count * perBonus;
  }
  // Ice Carver (and similar): continuous encounter lowers (CR 9.12.1a decrease).
  let encounterLower = 0;
  if (state.run?.encounter?.iceId === iceId) {
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      const mod = state.cards[id].runnerEncounterIceStrengthModifier ?? 0;
      if (mod < 0) encounterLower += -mod;
      else if (mod > 0) base += mod;
    }
  }
  let penalty = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    penalty += state.cards[id]?.allIceStrengthPenalty ?? 0;
    if (
      state.run?.firstEncounteredIceId === iceId &&
      state.cards[id]?.firstEncounteredIceStrengthPenaltyThisRun
    ) {
      penalty += state.cards[id]!.firstEncounteredIceStrengthPenaltyThisRun!;
    }
  }
  // Sandburg-class: +N per X Corp credits when credits ≥ threshold.
  let sandburgBonus = 0;
  for (const server of Object.values(state.servers)) {
    for (const rid of server.root) {
      const src = state.cards[rid];
      if (!src?.rezzed || abilitiesSuppressed(state, rid)) continue;
      const spec = src.iceStrengthBonusPerFiveCorpCreditsWhenCorpCreditsGte;
      if (!spec) continue;
      if (state.corp.credits < spec.threshold) continue;
      sandburgBonus +=
        Math.floor(state.corp.credits / spec.perCredits) * spec.bonus;
    }
  }
  // Stronger Together-class: Corp identity / active cards grant subtype ice +N
  // (layered subtypes — framework migration M4).
  let subtypeBonus = 0;
  const layeredSubs = resolveIceSubtypes(state, iceId).map((s) =>
    s.toLowerCase(),
  );
  const idCard = state.cards[state.corp.identityId];
  if (
    idCard?.iceStrengthBonusForSubtype &&
    !abilitiesSuppressed(state, state.corp.identityId)
  ) {
    const { subtype, bonus } = idCard.iceStrengthBonusForSubtype;
    if (layeredSubs.includes(subtype.toLowerCase())) subtypeBonus += bonus;
  }
  for (const server of Object.values(state.servers)) {
    for (const rid of [...server.root, ...server.ice]) {
      const src = state.cards[rid];
      if (
        !src?.rezzed ||
        !src.iceStrengthBonusForSubtype ||
        abilitiesSuppressed(state, rid)
      ) {
        continue;
      }
      const { subtype, bonus } = src.iceStrengthBonusForSubtype;
      if (layeredSubs.includes(subtype.toLowerCase())) subtypeBonus += bonus;
    }
  }
  const lockdownBonus = allIceStrengthBonusFromLockdowns(state);
  const currentBonus = allIceStrengthBonusFromCurrents(state);
  const scoredSubtypeBonus = scoredAgendaIceSubtypeStrengthBonus(state, card);
  // CR 9.12.1a: default → sets → increases → decreases (NSG Şifr+Sandburg).
  const printed = card.strength ?? 0;
  let value = printed;
  if (typeof wraparoundSet === "number") value = wraparoundSet;
  // Şifr-class set: lowered to N (never raises; UFAQ Wraparound / Architect).
  const enc = state.run?.encounter;
  if (
    enc?.iceId === iceId &&
    typeof enc.strengthLoweredTo === "number" &&
    value > enc.strengthLoweredTo
  ) {
    value = enc.strengthLoweredTo;
  }
  const increases =
    base -
    printed +
    lockdownBonus +
    currentBonus +
    subtypeBonus +
    scoredSubtypeBonus +
    sandburgBonus;
  // Prefer lingerings when they currently contribute; otherwise use map seeds /
  // fortify paths that still write maps only (M2).
  const fromLingering = lingeringIceStrengthBoost(state, iceId);
  const hasActiveIceLingering = state.lingeringEffects.some((e) => {
    if (e.expired) return false;
    if (
      e.kind !== LINGERING_KIND_ICE_STRENGTH &&
      e.kind !== LINGERING_KIND_ICE_STRENGTH_ENCOUNTER
    ) {
      return false;
    }
    if (
      e.kind === LINGERING_KIND_ICE_STRENGTH_ENCOUNTER &&
      !state.run?.encounter
    ) {
      return false;
    }
    return (e.payload as { iceId?: string } | undefined)?.iceId === iceId;
  });
  const tempBoost = hasActiveIceLingering
    ? fromLingering
    : (state.run?.iceStrengthBoosts?.[iceId] ?? 0) +
      (state.turn.iceStrengthBoostsThisTurn?.[iceId] ?? 0);
  const tempIncrease = Math.max(0, tempBoost);
  let tempDecrease = Math.max(0, -tempBoost);
  if (card.strengthCannotBeLowered) {
    tempDecrease = 0;
    encounterLower = 0;
    // allIceStrengthPenalty is also a lower — Lotus Field-class blocks it.
    penalty = 0;
  }
  return value + increases + tempIncrease - penalty - encounterLower - tempDecrease;
}

/**
 * Ice subtypes via the continuous subtype layer (CR 9.12.1d/e): blanking,
 * Egret/Chromatophores host grants, then Mother Goddess copying layered
 * subtypes of other rezzed ice (gained→further grant).
 */
export function effectiveIceSubtypes(
  state: GameState,
  iceId: string,
): string[] {
  return resolveIceSubtypes(state, iceId);
}

/**
 * Continuous ice rez cost increases from installed Runner cards (Xanadu flat
 * `iceRezCostIncrease`; Cat's Cradle `iceRezCostIncreaseBySubtype`). Subtype
 * filters use effective ice subtypes (CR §1.16.2a / §8.1.2d). Blanked sources
 * do not apply (CR 9.12.1d).
 */
export function continuousIceRezCostIncrease(
  state: GameState,
  iceId: string,
): number {
  let n = 0;
  const subtypes = effectiveIceSubtypes(state, iceId);
  const targetServer = serverIdForIce(state, iceId);
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    n += card.iceRezCostIncrease ?? 0;
    const filtered = card.iceRezCostIncreaseBySubtype;
    if (filtered && subtypes.includes(filtered.subtype)) {
      n += filtered.amount;
    }
    // Rook-class: while hosted on ice, ice protecting that same server
    // (this ice's host) gets +N rez cost (CR §1.16.2a / §8.1.2d).
    if (
      card.iceRezCostIncreaseProtectingHostedServer &&
      card.hostId &&
      targetServer &&
      serverIdForIce(state, card.hostId) === targetServer
    ) {
      n += card.iceRezCostIncreaseProtectingHostedServer;
    }
  }
  return n;
}

/**
 * Self rez-cost discount from counting already-rezzed ice of a subtype
 * (Ivik `rezCostDiscountPerRezzedSubtype`; CR §1.16.2a / §8.1.2d).
 * Does not count the ice being rezzed. Blanked source does not apply
 * (CR 9.12.1d).
 */
export function rezCostDiscountPerRezzedSubtype(
  state: GameState,
  iceId: string,
): number {
  if (abilitiesSuppressed(state, iceId)) return 0;
  const spec = state.cards[iceId]?.rezCostDiscountPerRezzedSubtype;
  if (!spec) return 0;
  let count = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      if (id === iceId) continue;
      const other = state.cards[id];
      if (!other?.rezzed) continue;
      if (effectiveIceSubtypes(state, id).includes(spec.subtype)) {
        count += 1;
      }
    }
  }
  return count * spec.amount;
}

/**
 * Self rez-cost discount from counting other unrezzed ice
 * (Reverb `rezCostDiscountPerOtherUnrezzedIce`; CR §1.16.2a / §8.1.2d).
 * Does not count the ice being rezzed. Blanked source does not apply
 * (CR 9.12.1d).
 */
export function rezCostDiscountPerOtherUnrezzedIce(
  state: GameState,
  iceId: string,
): number {
  if (abilitiesSuppressed(state, iceId)) return 0;
  const per = state.cards[iceId]?.rezCostDiscountPerOtherUnrezzedIce;
  if (!per) return 0;
  let count = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      if (id === iceId) continue;
      const other = state.cards[id];
      if (!other || other.rezzed) continue;
      count += 1;
    }
  }
  return count * per;
}

/** True if this ice cannot be broken by AI programs right now. */
/** Hype Machine: rez discount while an agenda was scored or stolen this turn. */
export function rezCostDiscountIfAgendaScoredOrStolenThisTurn(
  state: GameState,
  cardId: string,
): number {
  if (abilitiesSuppressed(state, cardId)) return 0;
  const card = state.cards[cardId];
  const amount = card?.rezCostDiscountIfAgendaScoredOrStolenThisTurn ?? 0;
  if (amount <= 0) return 0;
  const scored = (state.turn.agendaPointsScoredThisTurn ?? 0) > 0;
  const stolen = (state.turn.agendaPointsStolenThisTurn ?? 0) > 0;
  return scored || stolen ? amount : 0;
}


export function iceBlocksAiBreak(state: GameState, iceId: string): boolean {
  if (abilitiesSuppressed(state, iceId)) return false;
  const ice = state.cards[iceId];
  if (ice.cannotBreakWithAi) return true;
  const thresh = ice.cannotBreakWithAiAtAdvancements;
  if (thresh !== undefined && (ice.advancementCounters ?? 0) >= thresh) {
    return true;
  }
  return false;
}

/** Semak-samun-class: required breaker subtype, or undefined if blanked / unset. */
export function iceBreakExceptSubtype(
  state: GameState,
  iceId: string,
): string | undefined {
  if (abilitiesSuppressed(state, iceId)) return undefined;
  return state.cards[iceId]?.cannotBreakExceptSubtype;
}

export function isAiBreaker(card: CardInstance): boolean {
  return (
    (card.subtypes ?? []).includes("ai") ||
    card.breaker?.breaksSubtype === "*"
  );
}

function hostServerForCard(
  state: GameState,
  cardId: string,
): { id: ServerId; root: string[]; ice: string[] } | null {
  for (const server of Object.values(state.servers)) {
    if (server.root.includes(cardId) || server.ice.includes(cardId)) {
      return server;
    }
  }
  return null;
}

/** Runner trash cost including Mahkota-class server root bonuses and
 * Demolisher-class global Corp trash-cost reductions, plus Encryption
 * Protocol-class installedCardsTrashCostBonus while rezzed. Blanked
 * sources do not apply (CR 9.12.1d). */
export function runnerTrashCostForCard(
  state: GameState,
  cardId: string,
): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  let cost = card.trashCost ?? 0;
  let reduction = 0;
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    reduction += state.cards[id]?.corpCardTrashCostReduction ?? 0;
  }
  cost = Math.max(0, cost - reduction);
  // Encryption Protocol: +N trash cost to all installed cards while rezzed.
  cost += installedCardsTrashCostBonusTotal(state);
  // Full Immersion RecStudio: +N per hosted card (self static; blanked skips).
  if (!abilitiesSuppressed(state, cardId)) {
    const perHosted = card.trashCostIncreasePerHostedCard;
    if (typeof perHosted === "number" && perHosted > 0) {
      cost += perHosted * (card.hostedCardIds?.length ?? 0);
    }
  }
  // Industrial Genomics: +N per facedown Archives card.
  const idCard = state.cards[state.corp.identityId];
  if (!abilitiesSuppressed(state, state.corp.identityId)) {
    const perFacedown = idCard?.trashCostIncreasePerFacedownArchivesCard;
    if (typeof perFacedown === "number" && perFacedown > 0) {
      const facedown = state.corp.discardPile.filter(
        (id) => !state.cards[id]?.faceup,
      ).length;
      cost += perFacedown * facedown;
    }
  }
  // Oaktown Grid / Mahkota-class: root trash bonuses.
  const host = hostServerForCard(state, cardId);
  if (host) {
    for (const id of host.root) {
      if (abilitiesSuppressed(state, id)) continue;
      const up = state.cards[id];
      if (!up?.rezzed && !up?.persistent) continue;
      const rootInc = up?.rootTrashCostIncreaseThisServer ?? 0;
      if (rootInc > 0) cost += rootInc;
    }
  }
  if (card.type !== "asset") return cost;
  if (!host) return cost;
  for (const id of host.root) {
    if (abilitiesSuppressed(state, id)) continue;
    const up = state.cards[id];
    if (!up?.serverRootAssetTrashCostBonus) continue;
    if (!up.rezzed && !up.persistent) continue;
    cost += up.serverRootAssetTrashCostBonus;
  }
  return cost;
}

/** Sum of Encryption Protocol-class trash-cost bonuses from rezzed Corp cards. */
export function installedCardsTrashCostBonusTotal(state: GameState): number {
  let bonus = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (abilitiesSuppressed(state, id)) continue;
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      bonus += c.installedCardsTrashCostBonus ?? 0;
    }
  }
  return bonus;
}

/** Spend Mahkota recurring credits toward a Corp rez on the host server. */
/** Recurring credits a rezzed root card could spend on this rez, without spending them. */
export function quoteHostServerRecurringTowardCorpRez(
  state: GameState,
  cardId: string,
  payCost: number,
): number {
  const host = hostServerForCard(state, cardId);
  if (!host || payCost <= 0) return payCost;
  let left = payCost;
  for (const id of host.root) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const up = state.cards[id];
    if (!up?.recurringSpendFor?.includes("rez_host_server")) continue;
    if (!up.rezzed && !up.persistent) continue;
    left -= Math.min(left, up.recurringCredits ?? 0);
  }
  return left;
}

export function applyHostServerRecurringTowardCorpRez(
  state: GameState,
  cardId: string,
  payCost: number,
): number {
  const host = hostServerForCard(state, cardId);
  if (!host || payCost <= 0) return payCost;
  let left = payCost;
  for (const id of host.root) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const up = state.cards[id];
    if (!up?.recurringSpendFor?.includes("rez_host_server")) continue;
    if (!up.rezzed && !up.persistent) continue;
    const pool = up.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    up.recurringCredits = pool - take;
    left -= take;
  }
  return left;
}

/**
 * Dedicated Server: spend rezzed corp recurring credits marked `rez_ice`
 * toward an ice rez (any server).
 */
export function applyRezIceRecurringTowardCorpRez(
  state: GameState,
  payCost: number,
): number {
  if (payCost <= 0) return payCost;
  let left = payCost;
  for (const card of Object.values(state.cards)) {
    if (left <= 0) break;
    if (card.side !== "corp" || !card.rezzed) continue;
    if (abilitiesSuppressed(state, card.id)) continue;
    const purposes = card.recurringSpendFor ?? [];
    if (!purposes.includes("rez_ice") && !purposes.includes("rez")) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      const label = purposes.includes("rez") ? "rez" : "rez_ice";
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (${label}).`,
      );
    }
  }
  return left;
}

/**
 * Weyland Because We Built It: spend recurring credits marked `advance_ice`
 * toward advancing ice.
 */
export function applyAdvanceIceRecurringTowardAdvance(
  state: GameState,
  payCost: number,
): number {
  if (payCost <= 0) return payCost;
  let left = payCost;
  const idCard = state.cards[state.corp.identityId];
  const candidates = [
    idCard,
    ...Object.values(state.cards).filter(
      (c) => c.side === "corp" && c.rezzed && c.type !== "identity",
    ),
  ];
  for (const card of candidates) {
    if (!card || left <= 0) break;
    if (abilitiesSuppressed(state, card.id)) continue;
    if (!(card.recurringSpendFor ?? []).includes("advance_ice")) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (advance_ice).`,
      );
    }
  }
  return left;
}

/**
 * Simone Diego: spend recurring credits marked `advance_cards_this_server`
 * toward advancing a card in the same server's root or ice.
 */
export function applyAdvanceThisServerRecurringTowardAdvance(
  state: GameState,
  targetCardId: string,
  payCost: number,
): number {
  if (payCost <= 0) return payCost;
  const target = state.cards[targetCardId];
  if (!target) return payCost;
  let targetServerId: string | null = null;
  for (const [sid, server] of Object.entries(state.servers)) {
    if (server.root.includes(targetCardId) || server.ice.includes(targetCardId)) {
      targetServerId = sid;
      break;
    }
  }
  if (!targetServerId) return payCost;
  const server = state.servers[targetServerId as import("../state/types.js").ServerId];
  if (!server) return payCost;
  let left = payCost;
  for (const id of [...server.root, ...server.ice]) {
    if (left <= 0) break;
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.rezzed) continue;
    if (!(card.recurringSpendFor ?? []).includes("advance_cards_this_server")) {
      continue;
    }
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (advance_cards_this_server).`,
      );
    }
  }
  return left;
}

export { instantiateCard, getCardDef, applyCardDef };
