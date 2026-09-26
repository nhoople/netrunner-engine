/**
 * Stub card helpers — definitions live in `data/cards/`; this module
 * applies them onto instances and keeps demo/test convenience exports.
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

function asStubExport(defId: string) {
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
  };
}

export const STATIC_WALL = asStubExport("static-wall");
export const LOCKDOWN_WALL = asStubExport("lockdown-wall");
export const BASTION = asStubExport("bastion") as {
  title: string;
  type: "ice";
  side: "corp";
  installCost: number;
  rezCost: number;
  strength: number;
  subtypes: string[];
  subroutines: Subroutine[];
};
export const PULSE_NEEDLE = asStubExport("pulse-needle") as typeof BASTION;
export const SCRAP_CODE = asStubExport("scrap-code") as typeof BASTION;
export const CROWBAR = asStubExport("crowbar") as {
  title: string;
  type: "program";
  side: "runner";
  installCost: number;
  strength: number;
  subtypes: string[];
  breaker: BreakerAbility;
  paidAbilities: PaidAbility[];
};

export type IceStubKind =
  | "static"
  | "lockdown"
  | "bastion"
  | "pulse"
  | "scrap";

const iceDefId: Record<IceStubKind, string> = {
  static: "static-wall",
  lockdown: "lockdown-wall",
  bastion: "bastion",
  pulse: "pulse-needle",
  scrap: "scrap-code",
};

export function applyIceStub(
  card: CardInstance,
  which: IceStubKind = "static",
): void {
  applyCardDef(card, iceDefId[which]);
}

export function applyBreakerStub(card: CardInstance): void {
  applyCardDef(card, "crowbar");
}

export function currentWindow(
  timingKey: string,
): PaidAbilityWindow | null {
  switch (timingKey) {
    case "run.approachPaw":
      return "approach_paw";
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
  const base = card.breaker?.strength ?? card.strength ?? 0;
  const runBoost = state.run?.strengthBoosts[breakerId] ?? 0;
  const encBoost = state.run?.encounterStrengthBoosts[breakerId] ?? 0;
  return base + runBoost + encBoost;
}

/** Printed ice strength + encounter fortify boosts (CR 3.4.4). */
export function effectiveIceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  const base = card.strength ?? 0;
  const boost = state.run?.iceStrengthBoosts[iceId] ?? 0;
  return base + boost;
}

export { instantiateCard, getCardDef, applyCardDef };
