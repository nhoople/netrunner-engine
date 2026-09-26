/**
 * Minimal effect IR for card data / stubs.
 * Hand-authored AST — not a CR / nodes.json compiler.
 *
 * Shape: seq | do | if | prevent
 * Unknown IR nodes fail closed at load/eval time.
 */

export type SideRef = "corp" | "runner" | "payer" | "controller";

/** Leaf actions the host knows how to execute. */
export type Primitive =
  | { kind: "end_the_run" }
  | { kind: "gain_credits"; side: SideRef; amount: number }
  | { kind: "pump_strength"; amount: number }
  | { kind: "fortify_ice"; amount: number }
  | { kind: "net_damage"; amount: number }
  | { kind: "meat_damage"; amount: number }
  | { kind: "brain_damage"; amount: number }
  | { kind: "give_tags"; amount: number }
  | { kind: "trash_program"; pick: "first" }
  | {
      kind: "trace";
      strength: number;
      onSuccess: Effect;
      onFailure?: Effect;
      /** When true, leave state.trace pending for host intents. */
      interactive?: boolean;
    }
  | { kind: "draw"; side: SideRef; amount: number }
  | { kind: "add_agenda_counter"; amount: number }
  | { kind: "lose_clicks"; side: SideRef; amount: number };

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

/** Known primitive kinds — used by card loader fail-closed checks. */
export const KNOWN_PRIMITIVE_KINDS = new Set([
  "end_the_run",
  "gain_credits",
  "pump_strength",
  "fortify_ice",
  "net_damage",
  "meat_damage",
  "brain_damage",
  "give_tags",
  "trash_program",
  "trace",
  "draw",
  "add_agenda_counter",
  "lose_clicks",
]);

export const KNOWN_EFFECT_OPS = new Set(["seq", "do", "if", "prevent"]);
export const KNOWN_COND_OPS = new Set([
  "true",
  "false",
  "during_run",
  "source_is_breaker",
  "source_is_ice",
  "grip_nonempty",
  "has_installed_program",
]);

/** Construction helpers for stubs / tests. */
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
  meatDamage: (amount: number): Effect => fx.do({ kind: "meat_damage", amount }),
  brainDamage: (amount: number): Effect =>
    fx.do({ kind: "brain_damage", amount }),
  giveTags: (amount: number): Effect => fx.do({ kind: "give_tags", amount }),
  trashProgram: (): Effect => fx.do({ kind: "trash_program", pick: "first" }),
  draw: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "draw", side, amount }),
  loseClicks: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "lose_clicks", side, amount }),
  trace: (
    strength: number,
    onSuccess: Effect,
    onFailure?: Effect,
    interactive = false,
  ): Effect =>
    fx.do({
      kind: "trace",
      strength,
      onSuccess,
      ...(onFailure !== undefined ? { onFailure } : {}),
      interactive,
    }),
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

/**
 * Fail-closed validation of an Effect tree.
 * Returns an error string if any node/primitive is unknown.
 */
export function validateEffectTree(
  effect: unknown,
  path = "effect",
): string | null {
  if (!effect || typeof effect !== "object") {
    return `${path}: not an object`;
  }
  const e = effect as Record<string, unknown>;
  if (typeof e.op !== "string" || !KNOWN_EFFECT_OPS.has(e.op)) {
    return `${path}: unknown op ${JSON.stringify(e.op)}`;
  }
  switch (e.op) {
    case "seq": {
      if (!Array.isArray(e.effects)) return `${path}.effects: not an array`;
      for (let i = 0; i < e.effects.length; i++) {
        const err = validateEffectTree(e.effects[i], `${path}.effects[${i}]`);
        if (err) return err;
      }
      return null;
    }
    case "do": {
      const action = e.action as Record<string, unknown> | undefined;
      if (!action || typeof action.kind !== "string") {
        return `${path}.action: missing kind`;
      }
      if (!KNOWN_PRIMITIVE_KINDS.has(action.kind)) {
        return `${path}.action: unknown primitive kind ${action.kind}`;
      }
      if (action.kind === "trace") {
        const sErr = validateEffectTree(action.onSuccess, `${path}.onSuccess`);
        if (sErr) return sErr;
        if (action.onFailure !== undefined) {
          const fErr = validateEffectTree(
            action.onFailure,
            `${path}.onFailure`,
          );
          if (fErr) return fErr;
        }
      }
      return null;
    }
    case "if": {
      const cond = e.cond as Record<string, unknown> | undefined;
      if (!cond || typeof cond.op !== "string" || !KNOWN_COND_OPS.has(cond.op)) {
        return `${path}.cond: unknown op ${JSON.stringify(cond?.op)}`;
      }
      const tErr = validateEffectTree(e.then, `${path}.then`);
      if (tErr) return tErr;
      if (e.else !== undefined) {
        const elseErr = validateEffectTree(e.else, `${path}.else`);
        if (elseErr) return elseErr;
      }
      return null;
    }
    case "prevent":
      if (e.forbid !== "jack_out") {
        return `${path}: unknown forbid ${JSON.stringify(e.forbid)}`;
      }
      return null;
    default:
      return `${path}: unhandled op`;
  }
}
