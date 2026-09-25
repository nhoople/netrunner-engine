import { addRestriction } from "../legality/checkpoints.js";
import { log } from "../state/createGame.js";
import type { GameState, RuleCite, Side } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { Cond, Effect, Primitive, SideRef } from "./ir.js";

export interface EffectCtx {
  state: GameState;
  /** Card whose ability/sub is firing. */
  sourceId: string;
  /** Who paid (paid abilities); defaults to source.side. */
  payerSide?: Side;
}

export type EvalResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function breakerStrength(state: GameState, breakerId: string): number {
  const card = state.cards[breakerId];
  const base = card.breaker?.strength ?? card.strength ?? 0;
  return base + (state.run?.strengthBoosts[breakerId] ?? 0);
}

function iceStrength(state: GameState, iceId: string): number {
  const card = state.cards[iceId];
  const base = card.strength ?? 0;
  return base + (state.run?.iceStrengthBoosts[iceId] ?? 0);
}

function resolveSide(ctx: EffectCtx, ref: SideRef): Side {
  if (ref === "corp" || ref === "runner") return ref;
  if (ref === "payer") {
    return ctx.payerSide ?? ctx.state.cards[ctx.sourceId].side;
  }
  // controller ≈ owner/side of source card in v0
  return ctx.state.cards[ctx.sourceId].side;
}

function evalCond(ctx: EffectCtx, cond: Cond): boolean {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (cond.op) {
    case "true":
      return true;
    case "false":
      return false;
    case "during_run":
      return state.run !== null;
    case "source_is_breaker":
      return Boolean(source.breaker);
    case "source_is_ice":
      return source.type === "ice";
    case "grip_nonempty":
      return state.runner.hand.length > 0;
    case "has_installed_program":
      return state.runner.rig.some((id) => state.cards[id].type === "program");
    default: {
      const _c: never = cond;
      return _c;
    }
  }
}

function trashToHeap(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  const handIdx = state.runner.hand.indexOf(cardId);
  if (handIdx >= 0) state.runner.hand.splice(handIdx, 1);
  const rigIdx = state.runner.rig.indexOf(cardId);
  if (rigIdx >= 0) state.runner.rig.splice(rigIdx, 1);
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
}

function applyPrimitive(ctx: EffectCtx, action: Primitive): EvalResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "end_the_run": {
      if (!state.run) {
        return {
          ok: false,
          error: "End the run with no active run.",
          cites: [CR.endTheRun],
        };
      }
      state.run.endedTheRun = true;
      state.run.successful = false;
      log(
        state,
        `End the run (CR ${CR.endTheRun.number}) — run is unsuccessful.`,
      );
      return { ok: true };
    }
    case "gain_credits": {
      const side = resolveSide(ctx, action.side);
      const p = side === "corp" ? state.corp : state.runner;
      p.credits += action.amount;
      log(
        state,
        `${side} gains ${action.amount}¢ (CR ${CR.gainCredits.number}).`,
      );
      return { ok: true };
    }
    case "pump_strength": {
      if (!state.run) {
        return {
          ok: false,
          error: "Pump requires an active run.",
          cites: [CR.icebreakerStrengthImplicit],
        };
      }
      if (!source.breaker) {
        return {
          ok: false,
          error: "Pump requires an icebreaker.",
          cites: [CR.programStrength],
        };
      }
      state.run.strengthBoosts[sourceId] =
        (state.run.strengthBoosts[sourceId] ?? 0) + action.amount;
      const eff = breakerStrength(state, sourceId);
      log(
        state,
        `Pump ${source.title} +${action.amount} → strength ${eff} (CR ${CR.icebreakerStrengthImplicit.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "fortify_ice": {
      if (!state.run || source.type !== "ice") {
        return {
          ok: false,
          error: "Fortify requires ice during a run.",
          cites: [CR.iceStrength],
        };
      }
      state.run.iceStrengthBoosts[sourceId] =
        (state.run.iceStrengthBoosts[sourceId] ?? 0) + action.amount;
      const eff = iceStrength(state, sourceId);
      log(
        state,
        `Fortify ${source.title} +${action.amount} → strength ${eff} (CR ${CR.iceStrength.number}, ${CR.paidAbility.number}).`,
      );
      return { ok: true };
    }
    case "net_damage": {
      // v0: auto-trash from back of grip (deterministic). CR 10.4.1 / 10.4.2a.
      let left = action.amount;
      let trashed = 0;
      while (left > 0 && state.runner.hand.length > 0) {
        const id = state.runner.hand[state.runner.hand.length - 1]!;
        trashToHeap(state, id);
        trashed += 1;
        left -= 1;
      }
      log(
        state,
        `Net damage ${action.amount}: trashed ${trashed} from grip (CR ${CR.netDamage.number}, ${CR.sufferDamage.number}).`,
      );
      return { ok: true };
    }
    case "give_tags": {
      state.runner.tags += action.amount;
      log(
        state,
        `Runner receives ${action.amount} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
      );
      return { ok: true };
    }
    case "trash_program": {
      const progId = state.runner.rig.find(
        (id) => state.cards[id].type === "program",
      );
      if (!progId) {
        log(
          state,
          `Trash program — no installed program (CR ${CR.trashing.number}).`,
        );
        return { ok: true };
      }
      const title = state.cards[progId].title;
      trashToHeap(state, progId);
      log(
        state,
        `Trash installed program ${title} (CR ${CR.trashing.number}).`,
      );
      return { ok: true };
    }
    default: {
      const _a: never = action;
      return {
        ok: false,
        error: `Unhandled primitive: ${JSON.stringify(_a)}`,
        cites: [],
      };
    }
  }
}

/** Execute an effect tree against game state (mutates). */
export function evalEffect(ctx: EffectCtx, effect: Effect): EvalResult {
  switch (effect.op) {
    case "seq": {
      for (const e of effect.effects) {
        const r = evalEffect(ctx, e);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "do":
      return applyPrimitive(ctx, effect.action);
    case "if": {
      if (evalCond(ctx, effect.cond)) {
        return evalEffect(ctx, effect.then);
      }
      if (effect.else) return evalEffect(ctx, effect.else);
      return { ok: true };
    }
    case "prevent": {
      if (effect.forbid === "jack_out") {
        if (ctx.state.run) ctx.state.run.cannotJackOut = true;
        addRestriction(
          ctx.state,
          "jack_out",
          CR.cannotPrecedence,
          ctx.sourceId,
        );
        return { ok: true };
      }
      return { ok: true };
    }
    default: {
      const _e: never = effect;
      return {
        ok: false,
        error: `Unhandled effect op: ${JSON.stringify(_e)}`,
        cites: [],
      };
    }
  }
}

/**
 * Preconditions for paying a paid ability whose effect is this tree.
 * Returns a failure result if illegal, otherwise null.
 */
export function validatePaidEffect(
  ctx: EffectCtx,
  effect: Effect,
): Extract<EvalResult, { ok: false }> | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  const walk = (e: Effect): Extract<EvalResult, { ok: false }> | null => {
    switch (e.op) {
      case "seq": {
        for (const child of e.effects) {
          const r = walk(child);
          if (r) return r;
        }
        return null;
      }
      case "if":
        return walk(e.then) ?? (e.else ? walk(e.else) : null);
      case "prevent":
        return null;
      case "do": {
        const a = e.action;
        if (a.kind === "pump_strength") {
          if (!state.run) {
            return {
              ok: false,
              error: "Pump requires an active run/encounter.",
              cites: [CR.icebreakerStrengthImplicit],
            };
          }
          if (!source.breaker) {
            return {
              ok: false,
              error: "Pump requires an icebreaker.",
              cites: [CR.programStrength],
            };
          }
        }
        if (a.kind === "fortify_ice") {
          if (!state.run || source.type !== "ice") {
            return {
              ok: false,
              error: "Fortify requires approached ice during a run.",
              cites: [CR.iceStrength],
            };
          }
        }
        return null;
      }
      default: {
        const _e: never = e;
        return _e;
      }
    }
  };
  return walk(effect);
}
