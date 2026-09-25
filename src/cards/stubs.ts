import { fx, type Effect } from "../effects/ir.js";
import type {
  BreakerAbility,
  CardInstance,
  GameState,
  PaidAbility,
  PaidAbilityWindow,
  Subroutine,
} from "../state/types.js";

/** Single-sub barrier (existing vertical slice). */
export const STATIC_WALL = {
  title: "Static Wall",
  type: "ice" as const,
  side: "corp" as const,
  installCost: 1,
  rezCost: 3,
  strength: 1,
  subtypes: ["barrier"],
  subroutines: [
    {
      id: "sw-etr",
      text: "End the run.",
      effect: fx.etr(),
    },
  ] satisfies Subroutine[],
};

/** Barrier that forbids jack-out for the run when rezzed (CR 1.2.2). */
export const LOCKDOWN_WALL = {
  ...STATIC_WALL,
  title: "Lockdown Wall",
  prevention: { jackOutForRun: true as const },
  onRez: fx.prevent("jack_out"),
};

/**
 * Multi-sub barrier: Corp gains credits, then End the run.
 * Strength 3 — Crowbar needs pumps to interface (CR 3.9.5g).
 */
export const BASTION: {
  title: string;
  type: "ice";
  side: "corp";
  installCost: number;
  rezCost: number;
  strength: number;
  subtypes: string[];
  subroutines: Subroutine[];
} = {
  title: "Bastion",
  type: "ice",
  side: "corp",
  installCost: 1,
  rezCost: 4,
  strength: 3,
  subtypes: ["barrier"],
  subroutines: [
    {
      id: "bastion-gain",
      text: "The Corp gains 2{c}.",
      effect: fx.gainCredits("corp", 2),
    },
    {
      id: "bastion-etr",
      text: "End the run.",
      effect: fx.etr(),
    },
  ],
};

/**
 * Encounter effects ice: 1 net damage, then give 1 tag (CR 10.4 / 10.5).
 * Barrier str 1 — Crowbar can break without pump.
 */
export const PULSE_NEEDLE: {
  title: string;
  type: "ice";
  side: "corp";
  installCost: number;
  rezCost: number;
  strength: number;
  subtypes: string[];
  subroutines: Subroutine[];
} = {
  title: "Pulse Needle",
  type: "ice",
  side: "corp",
  installCost: 1,
  rezCost: 2,
  strength: 1,
  subtypes: ["barrier"],
  subroutines: [
    {
      id: "pn-dmg",
      text: "Do 1 net damage.",
      effect: fx.netDamage(1),
    },
    {
      id: "pn-tag",
      text: "Give the Runner 1 tag.",
      effect: fx.giveTags(1),
    },
  ],
};

/**
 * Optional trash-program sub ice (CR 1.19.1) — first installed program.
 * Used when we want trash without tags/damage.
 */
export const SCRAP_CODE: {
  title: string;
  type: "ice";
  side: "corp";
  installCost: number;
  rezCost: number;
  strength: number;
  subtypes: string[];
  subroutines: Subroutine[];
} = {
  title: "Scrap Code",
  type: "ice",
  side: "corp",
  installCost: 1,
  rezCost: 2,
  strength: 1,
  subtypes: ["barrier"],
  subroutines: [
    {
      id: "sc-trash",
      text: "Trash an installed program.",
      effect: fx.trashProgram(),
    },
    {
      id: "sc-etr",
      text: "End the run.",
      effect: fx.etr(),
    },
  ],
};

const crowbarPump: PaidAbility = {
  id: "crowbar-pump",
  label: "Pump Crowbar +1 strength",
  clickCost: 0,
  creditCost: 1,
  windows: ["encounter_paw"],
  effect: fx.pump(1),
};

/** Fracter with pump paid ability (CR 3.9.5b / 9.5.1). */
export const CROWBAR: {
  title: string;
  type: "program";
  side: "runner";
  installCost: number;
  strength: number;
  subtypes: string[];
  breaker: BreakerAbility;
  paidAbilities: PaidAbility[];
} = {
  title: "Crowbar",
  type: "program",
  side: "runner",
  installCost: 0,
  strength: 1,
  subtypes: ["icebreaker", "fracter"],
  breaker: {
    breaksSubtype: "barrier",
    strength: 1,
    breakCredits: 1,
    pumpCredits: 1,
    pumpStrength: 1,
  },
  paidAbilities: [crowbarPump],
};

/**
 * Approach-PAW Corp paid ability on ice: spend 1¢ to give +1 strength
 * until the end of this encounter (minimal generic PAW hook).
 */
const fortifyAbility: PaidAbility = {
  id: "fortify",
  label: "Fortify (+1 ice strength this encounter)",
  clickCost: 0,
  creditCost: 1,
  windows: ["approach_paw"],
  effect: fx.fortify(1),
};

export type IceStubKind =
  | "static"
  | "lockdown"
  | "bastion"
  | "pulse"
  | "scrap";

function iceSource(which: IceStubKind) {
  switch (which) {
    case "lockdown":
      return LOCKDOWN_WALL;
    case "bastion":
      return BASTION;
    case "pulse":
      return PULSE_NEEDLE;
    case "scrap":
      return SCRAP_CODE;
    default:
      return STATIC_WALL;
  }
}

export function applyIceStub(
  card: CardInstance,
  which: IceStubKind = "static",
): void {
  const src = iceSource(which);
  Object.assign(card, {
    title: src.title,
    installCost: src.installCost,
    rezCost: src.rezCost,
    strength: src.strength,
    subtypes: [...src.subtypes],
    subroutines: src.subroutines.map((s) => ({
      ...s,
      effect: structuredClone(s.effect) as Effect,
    })),
    prevention:
      "prevention" in src && src.prevention
        ? { ...src.prevention }
        : undefined,
    onRez:
      "onRez" in src && src.onRez
        ? (structuredClone(src.onRez) as Effect)
        : undefined,
    paidAbilities:
      which === "bastion"
        ? [
            {
              ...fortifyAbility,
              effect: structuredClone(fortifyAbility.effect) as Effect,
              windows: [...fortifyAbility.windows],
            },
          ]
        : undefined,
  });
}

export function applyBreakerStub(card: CardInstance): void {
  Object.assign(card, {
    title: CROWBAR.title,
    installCost: CROWBAR.installCost,
    strength: CROWBAR.strength,
    subtypes: [...CROWBAR.subtypes],
    breaker: { ...CROWBAR.breaker },
    paidAbilities: CROWBAR.paidAbilities.map((a) => ({
      ...a,
      windows: [...a.windows],
      effect: structuredClone(a.effect) as Effect,
    })),
  });
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

/** Printed breaker strength + encounter boosts (CR 3.9.4a / 3.9.5b). */
export function effectiveBreakerStrength(
  state: GameState,
  breakerId: string,
): number {
  const card = state.cards[breakerId];
  const base = card.breaker?.strength ?? card.strength ?? 0;
  const boost = state.run?.strengthBoosts[breakerId] ?? 0;
  return base + boost;
}

/** Printed ice strength + encounter fortify boosts (CR 3.4.4). */
export function effectiveIceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  const base = card.strength ?? 0;
  const boost = state.run?.iceStrengthBoosts[iceId] ?? 0;
  return base + boost;
}
