/**
 * Minimal effect IR for hardcoded test cards.
 * Hand-authored AST — not a CR / nodes.json compiler.
 *
 * Shape: seq | do | if | prevent
 */

export type SideRef = "corp" | "runner" | "payer" | "controller";

/** Leaf actions the host knows how to execute. */
export type Primitive =
  | { kind: "end_the_run" }
  | { kind: "gain_credits"; side: SideRef; amount: number }
  | { kind: "pump_strength"; amount: number }
  | { kind: "fortify_ice"; amount: number }
  | { kind: "net_damage"; amount: number }
  | { kind: "give_tags"; amount: number }
  | { kind: "trash_program"; pick: "first" };

export type Cond =
  | { op: "true" }
  | { op: "false" }
  | { op: "during_run" }
  | { op: "source_is_breaker" }
  | { op: "source_is_ice" }
  | { op: "grip_nonempty" }
  | { op: "has_installed_program" };

export type Effect =
  | { op: "seq"; effects: Effect[] }
  | { op: "do"; action: Primitive }
  | { op: "if"; cond: Cond; then: Effect; else?: Effect }
  | { op: "prevent"; forbid: "jack_out" };

/** Construction helpers for stubs. */
export const fx = {
  seq: (...effects: Effect[]): Effect => ({ op: "seq", effects }),
  do: (action: Primitive): Effect => ({ op: "do", action }),
  if: (cond: Cond, then: Effect, elseEffect?: Effect): Effect => ({
    op: "if",
    cond,
    then,
    ...(elseEffect !== undefined ? { else: elseEffect } : {}),
  }),
  prevent: (forbid: "jack_out"): Effect => ({ op: "prevent", forbid }),
  etr: (): Effect => fx.do({ kind: "end_the_run" }),
  gainCredits: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "gain_credits", side, amount }),
  pump: (amount: number): Effect => fx.do({ kind: "pump_strength", amount }),
  fortify: (amount: number): Effect => fx.do({ kind: "fortify_ice", amount }),
  netDamage: (amount: number): Effect => fx.do({ kind: "net_damage", amount }),
  giveTags: (amount: number): Effect => fx.do({ kind: "give_tags", amount }),
  trashProgram: (): Effect => fx.do({ kind: "trash_program", pick: "first" }),
};

/** Walk the AST; true if any leaf matches. */
export function effectContains(
  effect: Effect,
  pred: (p: Primitive) => boolean,
): boolean {
  switch (effect.op) {
    case "seq":
      return effect.effects.some((e) => effectContains(e, pred));
    case "do":
      return pred(effect.action);
    case "if":
      return (
        effectContains(effect.then, pred) ||
        (effect.else !== undefined && effectContains(effect.else, pred))
      );
    case "prevent":
      return false;
    default: {
      const _e: never = effect;
      return _e;
    }
  }
}
