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
  | "prevention"
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

/**
 * Barrier that also forbids jacking out for the rest of the run when rezzed
 * (honest cannot-precedence stub, CR 1.2.2).
 */
export const LOCKDOWN_WALL: typeof STATIC_WALL = {
  ...STATIC_WALL,
  title: "Lockdown Wall",
  prevention: { jackOutForRun: true },
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

export function applyIceStub(card: CardInstance, which: "static" | "lockdown" = "static"): void {
  const src = which === "lockdown" ? LOCKDOWN_WALL : STATIC_WALL;
  Object.assign(card, {
    title: src.title,
    installCost: src.installCost,
    rezCost: src.rezCost,
    strength: src.strength,
    subtypes: [...src.subtypes!],
    subroutines: src.subroutines!.map((s) => ({ ...s })),
    prevention: src.prevention ? { ...src.prevention } : undefined,
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
