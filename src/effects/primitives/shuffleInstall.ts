import { revealCards } from "../../state/visibility/reveal.js";
/** Magnum Opus (mo) primitives — v1.142.0. */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import type { RuleCite } from "../../state/types.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function sharedTypeMax(types: string[]): number {
  if (types.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of types) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let max = 0;
  for (const n of counts.values()) {
    if (n > max) max = n;
  }
  return max;
}

export function applyMagnumOpusPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "mo_slot_machine_encounter": {
      if (state.runner.deck.length > 0) {
        const top = state.runner.deck.shift()!;
        state.runner.deck.push(top);
        log(
          state,
          `Slot Machine — put top of stack (${state.cards[top]?.title ?? top}) on bottom.`,
        );
      }
      const revealN = Math.min(3, state.runner.deck.length);
      const revealed = state.runner.deck.slice(0, revealN);
      const types = revealed.map((id) => state.cards[id]?.type ?? "unknown");
      const max = sharedTypeMax(types);
      if (state.run) {
        state.run.encounterSlotMachineSharedTypeMax = max;
      }
      const titles = revealed
        .map((id) => state.cards[id]?.title ?? id)
        .join(", ");
      revealCards(state, revealed, sourceId);
      log(
        state,
        `Slot Machine — reveal top ${revealN}: ${titles || "(empty)"} (shared-type max=${max}).`,
      );
      return { ok: true };
    }

    case "mo_slot_machine_if_shared_type_gte": {
      const have = state.run?.encounterSlotMachineSharedTypeMax ?? 0;
      if (have < action.threshold) {
        log(
          state,
          `Slot Machine — shared-type max ${have} < ${action.threshold}; skip.`,
        );
        return { ok: true };
      }
      return evalEffect(ctx, action.then);
    }

    default:
      return null;
  }
}
