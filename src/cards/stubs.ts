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
import { agendaPointsFor } from "../state/scoring.js";
import { scoredAgendaBreakerPenaltyIfIceDerezzed } from "../state/breakerMods.js";
import { allIceStrengthBonusFromLockdowns } from "../state/lockdowns.js";
import { runnerIsTagged } from "../state/tags.js";
import { applyCardDef, getCardDef, instantiateCard } from "./load.js";
import { log } from "../state/createGame.js";

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
        windows: [...a.windows],
        effect: structuredClone(a.effect) as Effect,
      }),
    ),
    onRez: def.onRez ? (structuredClone(def.onRez) as Effect) : undefined,
    prevention: def.prevention ? { ...def.prevention } : undefined,
    strengthBonusProtectingRemote: def.strengthBonusProtectingRemote,
    strengthBonusProtectingArchives: def.strengthBonusProtectingArchives,
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
      return "corp_action_paw";
    case "runner.actionPaw":
      return "runner_action_paw";
    case "run.completeOtherPriorityWindows":
      return "other_priority_window";
    default:
      return null;
  }
}

/** Printed breaker strength + run/encounter boosts (CR 3.9.4a / 3.9.5b). */
export function effectiveBreakerStrength(
  state: GameState,
  breakerId: string,
): number {
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
  if (card.strengthBonusPerHeapSubtype) {
    const sub = card.strengthBonusPerHeapSubtype.subtype.toLowerCase();
    const n = state.runner.discard.filter((id) =>
      (state.cards[id]?.subtypes ?? []).some((s) => s.toLowerCase() === sub),
    ).length;
    base += card.strengthBonusPerHeapSubtype.bonus * n;
  }
  if (card.strengthBonusPerCoreDamageThisGame) {
    // Permanent core-damage counter = core damage taken this game (CR §10.4.2b).
    base += card.strengthBonusPerCoreDamageThisGame * state.runner.brainDamage;
  }
  if (typeof card.strengthPenaltyPerGripCard === "number") {
    base -= card.strengthPenaltyPerGripCard * state.runner.hand.length;
  }
  if (card.strengthPerPowerCounter) {
    base += card.powerCounters ?? 0;
  }
  if (typeof card.strengthPerVirusCounter === "number") {
    base += (card.virusCounters ?? 0) * card.strengthPerVirusCounter;
  }
  // Aura strength from other installed cards (K2CP Turbine).
  for (const id of state.runner.rig) {
    if (id === breakerId) continue;
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
    base += aura.amount;
  }
  if (card.threatStrengthBonus) {
    const corpPts = agendaPointsFor(state, "corp");
    const runnerPts = agendaPointsFor(state, "runner");
    if (Math.max(corpPts, runnerPts) >= card.threatStrengthBonus.level) {
      base += card.threatStrengthBonus.amount;
    }
  }
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
  base += state.turn.breakerStrengthBoostsThisTurn[breakerId] ?? 0;
  const runBoost = state.run?.strengthBoosts[breakerId] ?? 0;
  const encBoost = state.run?.encounterStrengthBoosts[breakerId] ?? 0;
  const stegodon = scoredAgendaBreakerPenaltyIfIceDerezzed(state);
  return base + runBoost + encBoost - stegodon;
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
 * (Vovô Ozetti `iceRezCostReductionProtectingThisServer`).
 */
export function continuousIceRezCostReduction(
  state: GameState,
  iceId: string,
): number {
  const sid = serverIdForIce(state, iceId);
  if (!sid) return 0;
  let n = 0;
  for (const up of rezzedRootUpgradesOnServer(state, sid)) {
    n += up.iceRezCostReductionProtectingThisServer ?? 0;
  }
  return n;
}

/**
 * Braintrust: sum ice rez discounts from agenda counters on scored agendas
 * (`iceRezCostReductionPerAgendaCounter` × `agendaCounters`).
 */
export function iceRezCostReductionFromScoredAgendaCounters(
  state: GameState,
): number {
  let n = 0;
  for (const id of state.corp.score) {
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
 * server while Threat is active (Vovô Ozetti).
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
    const spec = up.rootRezCostReductionThisServerIfThreat;
    if (spec && threat >= spec.level) n += spec.amount;
  }
  return n;
}

/** Printed ice strength + encounter fortify boosts (CR 3.4.4). */
export function effectiveIceStrength(state: GameState, iceId: string): number {
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
  if (card.strengthBonusProtectingRemote) {
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(iceId) && server.kind === "remote") {
        base += card.strengthBonusProtectingRemote;
        break;
      }
    }
  }
  if (card.strengthBonusProtectingArchives) {
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(iceId) && server.id === "archives") {
        base += card.strengthBonusProtectingArchives;
        break;
      }
    }
  }
  if (card.strengthBonusWhileTagged && runnerIsTagged(state)) {
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
    if (serverId && (card.advancementTokens ?? 0) > 0) {
      const server = state.servers[serverId as keyof typeof state.servers];
      for (const upId of server?.root ?? []) {
        const up = state.cards[upId];
        if (!up?.rezzed) continue;
        const n = up.advancedIceProtectingThisServerStrengthBonus ?? 0;
        if (n > 0) base += n;
      }
    }
    if (serverId) {
      const server = state.servers[serverId as keyof typeof state.servers];
      for (const upId of server?.root ?? []) {
        const up = state.cards[upId];
        if (!up?.rezzed) continue;
        base += up.iceProtectingThisServerStrengthBonus ?? 0;
      }
    }
  }
  if (card.strengthBonusAtAdvancements) {
    const { threshold, bonus } = card.strengthBonusAtAdvancements;
    if ((card.advancementTokens ?? 0) >= threshold) {
      base += bonus;
    }
  }
  if (card.strengthPerAdvancement) {
    base += (card.advancementTokens ?? 0) * card.strengthPerAdvancement;
  }
  if (typeof card.strengthPerVirusCounter === "number") {
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
    for (const id of state.runner.rig) {
      const trojan = state.cards[id];
      if (!trojan?.hostId) continue;
      if (trojan.hostId === iceId) {
        if (trojan.hostStrengthModifier) {
          base += trojan.hostStrengthModifier;
        }
        if (typeof trojan.hostStrengthPerVirusCounter === "number") {
          base +=
            (trojan.virusCounters ?? 0) * trojan.hostStrengthPerVirusCounter;
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
        if (!ice?.rezzed || !ice.sameServerIceStrengthBonus) continue;
        base += ice.sameServerIceStrengthBonus;
      }
    }
  }
  if (card.strengthBonusIfNoInstalledSubtype) {
    const { subtype, bonus } = card.strengthBonusIfNoInstalledSubtype;
    const has = state.runner.rig.some((id) =>
      (state.cards[id].subtypes ?? []).includes(subtype),
    );
    if (!has) base += bonus;
  }
  if (typeof card.strengthBonusIfSoleIceProtectingServer === "number") {
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
    typeof card.strengthBonusIfRezzedThisTurn === "number" &&
    (state.turn.rezzedThisTurnIds ?? []).includes(iceId)
  ) {
    base += card.strengthBonusIfRezzedThisTurn;
  }
  // Ice Carver (and similar): encounter strength modifiers from Runner cards.
  if (state.run?.encounter?.iceId === iceId) {
    for (const id of state.runner.rig) {
      const mod = state.cards[id].runnerEncounterIceStrengthModifier ?? 0;
      if (mod !== 0) base += mod;
    }
  }
  let boost = state.run?.iceStrengthBoosts[iceId] ?? 0;
  boost += state.turn.iceStrengthBoostsThisTurn[iceId] ?? 0;
  if (card.strengthCannotBeLowered && boost < 0) boost = 0;
  let penalty = 0;
  for (const id of state.runner.rig) {
    penalty += state.cards[id]?.allIceStrengthPenalty ?? 0;
  }
  // Stronger Together-class: Corp identity / active cards grant subtype ice +N.
  let subtypeBonus = 0;
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.iceStrengthBonusForSubtype) {
    const { subtype, bonus } = idCard.iceStrengthBonusForSubtype;
    if ((card.subtypes ?? []).includes(subtype)) subtypeBonus += bonus;
  }
  for (const server of Object.values(state.servers)) {
    for (const rid of [...server.root, ...server.ice]) {
      const src = state.cards[rid];
      if (!src?.rezzed || !src.iceStrengthBonusForSubtype) continue;
      const { subtype, bonus } = src.iceStrengthBonusForSubtype;
      if ((card.subtypes ?? []).includes(subtype)) subtypeBonus += bonus;
    }
  }
  const lockdownBonus = allIceStrengthBonusFromLockdowns(state);
  return base + boost - penalty + lockdownBonus + subtypeBonus;
}

/** Ice subtypes including grants from hosted trojans (Egret). */
export function effectiveIceSubtypes(
  state: GameState,
  iceId: string,
): string[] {
  const ice = state.cards[iceId];
  const set = new Set(ice.subtypes ?? []);
  for (const id of state.runner.rig) {
    const host = state.cards[id];
    if (host.hostId === iceId && host.hostGainsAllIceSubtypes) {
      set.add("barrier");
      set.add("code gate");
      set.add("sentry");
    }
  }
  const enc = state.run?.encounter;
  if (enc?.iceId === iceId && enc.grantedSubtypes?.length) {
    for (const s of enc.grantedSubtypes) set.add(s);
  }
  if (ice.grantedSubtypesUntilEndOfTurn?.length) {
    for (const s of ice.grantedSubtypesUntilEndOfTurn) set.add(s);
  }
  return [...set];
}

/**
 * Continuous ice rez cost increases from installed Runner cards (Xanadu flat
 * `iceRezCostIncrease`; Cat's Cradle `iceRezCostIncreaseBySubtype`). Subtype
 * filters use effective ice subtypes (CR §1.16.2a / §8.1.2d).
 */
export function continuousIceRezCostIncrease(
  state: GameState,
  iceId: string,
): number {
  let n = 0;
  const subtypes = effectiveIceSubtypes(state, iceId);
  const targetServer = serverIdForIce(state, iceId);
  for (const id of state.runner.rig) {
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
 * Does not count the ice being rezzed.
 */
export function rezCostDiscountPerRezzedSubtype(
  state: GameState,
  iceId: string,
): number {
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
 * Does not count the ice being rezzed.
 */
export function rezCostDiscountPerOtherUnrezzedIce(
  state: GameState,
  iceId: string,
): number {
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
  const card = state.cards[cardId];
  const amount = card?.rezCostDiscountIfAgendaScoredOrStolenThisTurn ?? 0;
  if (amount <= 0) return 0;
  const scored = (state.turn.agendaPointsScoredThisTurn ?? 0) > 0;
  const stolen = (state.turn.agendaPointsStolenThisTurn ?? 0) > 0;
  return scored || stolen ? amount : 0;
}


export function iceBlocksAiBreak(state: GameState, iceId: string): boolean {
  const ice = state.cards[iceId];
  if (ice.cannotBreakWithAi) return true;
  const thresh = ice.cannotBreakWithAiAtAdvancements;
  if (thresh !== undefined && (ice.advancementTokens ?? 0) >= thresh) {
    return true;
  }
  return false;
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
 * Protocol-class installedCardsTrashCostBonus while rezzed. */
export function runnerTrashCostForCard(
  state: GameState,
  cardId: string,
): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  let cost = card.trashCost ?? 0;
  let reduction = 0;
  for (const id of state.runner.rig) {
    reduction += state.cards[id]?.corpCardTrashCostReduction ?? 0;
  }
  cost = Math.max(0, cost - reduction);
  // Encryption Protocol: +N trash cost to all installed cards while rezzed.
  cost += installedCardsTrashCostBonusTotal(state);
  if (card.type !== "asset") return cost;
  const host = hostServerForCard(state, cardId);
  if (!host) return cost;
  for (const id of host.root) {
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
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      bonus += c.installedCardsTrashCostBonus ?? 0;
    }
  }
  return bonus;
}

/** Spend Mahkota recurring credits toward a Corp rez on the host server. */
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
    if (!(card.recurringSpendFor ?? []).includes("rez_ice")) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (rez_ice).`,
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
