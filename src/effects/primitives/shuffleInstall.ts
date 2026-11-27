import { revealCards } from "../../state/visibility/reveal.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
/** Magnum Opus (mo) primitives — v1.142.0. */
import { log } from "../../state/setupAndEnd/createGame.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { shuffleInPlace } from "../../state/rng.js";
import type { RuleCite } from "../../state/types.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function moveHeapCardToStack(state: EffectCtx["state"], cardId: string): void {
  state.runner.discardPile = state.runner.discardPile.filter(
    (id) => id !== cardId,
  );
  const c = state.cards[cardId]!;
  c.zone = "runner:stack";
  c.faceup = false;
  state.runner.deck.push(cardId);
}

function offerHeapShufflePick(ctx: EffectCtx, remaining: number): PrimResult {
  const { state, sourceId } = ctx;
  const heap = [...state.runner.discardPile];
  if (remaining <= 0 || heap.length === 0) {
    shuffleInPlace(state, state.runner.deck);
    state.turn.moHeapShuffleRemaining = undefined;
    return { ok: true };
  }
  state.turn.moHeapShuffleRemaining = remaining;
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: heap.map((cardId) => ({
      id: `mo-shuffle:${cardId}`,
      label: `Shuffle ${state.cards[cardId]!.title} into stack`,
      effect: fx.do({ kind: "shuffle_heap_pick", cardId }),
    })),
  });
  return { ok: true };
}

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
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "shuffle_n_heap_cards_into_stack": {
      const amount = Math.max(0, action.amount);
      const heap = [...state.runner.discardPile];
      if (amount <= 0 || heap.length === 0) {
        log(
          state,
          `${source?.title ?? "Labor Rights"} — no heap cards to shuffle.`,
        );
        return { ok: true };
      }
      const n = Math.min(amount, heap.length);
      if (heap.length <= n) {
        for (const id of heap) moveHeapCardToStack(state, id);
        shuffleInPlace(state, state.runner.deck);
        log(
          state,
          `${source?.title ?? "Labor Rights"} — shuffle all ${heap.length} heap card(s) into stack.`,
        );
        return { ok: true };
      }
      log(
        state,
        `${source?.title ?? "Labor Rights"} — choose ${n} heap card(s) to shuffle.`,
      );
      return offerHeapShufflePick(ctx, n);
    }

    case "shuffle_heap_pick": {
      const cardId = action.cardId;
      const remaining = state.turn.moHeapShuffleRemaining ?? 0;
      if (!state.runner.discardPile.includes(cardId) || remaining <= 0) {
        log(state, `Shuffle heap — invalid pick.`);
        return { ok: true };
      }
      moveHeapCardToStack(state, cardId);
      log(state, `Shuffle ${state.cards[cardId]!.title} into stack.`);
      return offerHeapShufflePick(ctx, remaining - 1);
    }

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
