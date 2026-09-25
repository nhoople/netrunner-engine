import type { CardInstance } from "../state/types.js";

/** Hardcoded ice: barrier with a single End the run subroutine. */
export const STATIC_WALL: Pick<
  CardInstance,
  | "title"
  | "type"
  | "side"
  | "installCost"
  | "rezCost"
  | "strength"
  | "subtypes"
  | "subroutines"
> = {
  title: "Static Wall",
  type: "ice",
  side: "corp",
  installCost: 1,
  rezCost: 3,
  strength: 1,
  subtypes: ["barrier"],
  subroutines: [{ id: "sw-etr", effect: "end_the_run", text: "End the run." }],
};

/** Hardcoded icebreaker: breaks barrier subroutines. */
export const CROWBAR: Pick<
  CardInstance,
  | "title"
  | "type"
  | "side"
  | "installCost"
  | "strength"
  | "subtypes"
  | "breaker"
> = {
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
  },
};

export function applyIceStub(card: CardInstance): void {
  Object.assign(card, {
    title: STATIC_WALL.title,
    installCost: STATIC_WALL.installCost,
    rezCost: STATIC_WALL.rezCost,
    strength: STATIC_WALL.strength,
    subtypes: [...STATIC_WALL.subtypes!],
    subroutines: STATIC_WALL.subroutines!.map((s) => ({ ...s })),
  });
}

export function applyBreakerStub(card: CardInstance): void {
  Object.assign(card, {
    title: CROWBAR.title,
    installCost: CROWBAR.installCost,
    strength: CROWBAR.strength,
    subtypes: [...CROWBAR.subtypes!],
    breaker: { ...CROWBAR.breaker! },
  });
}
