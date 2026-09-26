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
  Subroutine,
} from "../state/types.js";
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
        windows: [...a.windows],
        effect: structuredClone(a.effect) as Effect,
      }),
    ),
    onRez: def.onRez ? (structuredClone(def.onRez) as Effect) : undefined,
    prevention: def.prevention ? { ...def.prevention } : undefined,
    strengthBonusProtectingRemote: def.strengthBonusProtectingRemote,
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
  if (card.strengthPerPowerCounter) {
    base += card.powerCounters ?? 0;
  }
  const runBoost = state.run?.strengthBoosts[breakerId] ?? 0;
  const encBoost = state.run?.encounterStrengthBoosts[breakerId] ?? 0;
  return base + runBoost + encBoost;
}

/** Printed ice strength + encounter fortify boosts (CR 3.4.4). */
export function effectiveIceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  let base = card.strength ?? 0;
  if (card.strengthBonusProtectingRemote) {
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(iceId) && server.kind === "remote") {
        base += card.strengthBonusProtectingRemote;
        break;
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
  if (card.strengthBonusIfNoInstalledSubtype) {
    const { subtype, bonus } = card.strengthBonusIfNoInstalledSubtype;
    const has = state.runner.rig.some((id) =>
      (state.cards[id].subtypes ?? []).includes(subtype),
    );
    if (!has) base += bonus;
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
  return base + boost;
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
  return [...set];
}

/** True if this ice cannot be broken by AI programs right now. */
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

export { instantiateCard, getCardDef, applyCardDef };
